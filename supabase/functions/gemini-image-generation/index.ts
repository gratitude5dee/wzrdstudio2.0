import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { executeGmiQueueModel, pollGmiQueueStatus } from '../_shared/gmi-client.ts';
import { corsHeaders, errorResponse, handleCors } from '../_shared/response.ts';
import {
  buildCreditIdempotencyKey,
  commitCredits,
  getCreditCostForModel,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
} from '../_shared/credits.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  let creditReservation: { holdId: string | null; requestedAmount: number; skipped: boolean } | null = null;
  let userId: string | null = null;
  const modelId = 'gmi/gemini-3.1-flash-image-preview';
  const creditCost = getCreditCostForModel(modelId, 'image');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    const user = await authenticateRequest(req.headers);
    userId = user.id;
    const {
      prompt,
      imageUrl,
      editMode = false,
      aspectRatio = '1:1',
      imageSize = '1K',
    } = await req.json();

    if (!prompt) {
      return errorResponse('Prompt is required', 400);
    }

    console.log(`[gemini-image-gen] prompt="${prompt.slice(0, 80)}" editMode=${editMode} aspectRatio=${aspectRatio} imageSize=${imageSize}`);

    creditReservation = await reserveCredits({
      supabase,
      userId,
      resourceType: 'image',
      requestedAmount: creditCost,
      referenceType: 'gemini_image_generation',
      referenceId: crypto.randomUUID(),
      idempotencyKey: buildCreditIdempotencyKey('gemini-image-generation', userId, crypto.randomUUID()),
      metadata: {
        endpoint: 'gemini-image-generation',
        model_id: modelId,
        edit_mode: editMode,
      },
    });

    // Build payload for Gemini 3.1 Flash Image Preview via GMI Cloud queue
    const payload: Record<string, unknown> = {
      prompt,
      image_size: imageSize,
      aspect_ratio: aspectRatio,
    };

    // If edit mode, include reference images
    if (editMode && imageUrl) {
      payload.image = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
    }

    // Submit to GMI queue
    const submitResult = await executeGmiQueueModel('gemini-3.1-flash-image-preview', payload);

    if (!submitResult.success || !submitResult.requestId) {
      console.error('[gemini-image-gen] Submit failed:', submitResult.error);
      await releaseCredits({
        supabase,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        reason: 'gmi_submit_failed',
        userId,
        metadata: { endpoint: 'gemini-image-generation', model_id: modelId },
      });
      creditReservation = null;
      return errorResponse(submitResult.error || 'Failed to submit image generation request', 500);
    }

    console.log(`[gemini-image-gen] Submitted request_id=${submitResult.requestId}`);

    // Poll for completion (max 120s, every 3s)
    const maxPollTime = 120_000;
    const pollInterval = 3_000;
    const startTime = Date.now();
    let imageResultUrl: string | null = null;

    while (Date.now() - startTime < maxPollTime) {
      await new Promise(r => setTimeout(r, pollInterval));

      const pollResult = await pollGmiQueueStatus(submitResult.requestId);
      if (!pollResult.success || !pollResult.data) continue;

      const status = pollResult.data.status;
      console.log(`[gemini-image-gen] Poll status: ${status}`);

      if (status === 'success') {
        imageResultUrl = pollResult.data.outcome?.media_urls?.[0]?.url || null;
        break;
      } else if (status === 'failed' || status === 'cancelled') {
        await releaseCredits({
          supabase,
          holdId: creditReservation.holdId,
          skipped: creditReservation.skipped,
          reason: `gmi_image_${status}`,
          userId,
          metadata: { endpoint: 'gemini-image-generation', model_id: modelId },
        });
        creditReservation = null;
        return errorResponse(`Image generation ${status}`, 500);
      }
      // queued / processing — keep polling
    }

    if (!imageResultUrl) {
      await releaseCredits({
        supabase,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        reason: 'gmi_image_timeout',
        userId,
        metadata: { endpoint: 'gemini-image-generation', model_id: modelId },
      });
      creditReservation = null;
      return errorResponse('Image generation timed out after 120 seconds', 504);
    }

    console.log(`[gemini-image-gen] Success, image URL obtained`);
    await commitCredits({
      supabase,
      holdId: creditReservation.holdId,
      skipped: creditReservation.skipped,
      amount: creditCost,
      userId,
      metadata: {
        endpoint: 'gemini-image-generation',
        model_id: modelId,
        image_url: imageResultUrl,
      },
    });
    creditReservation = null;

    return new Response(JSON.stringify({
      imageUrl: imageResultUrl,
      prompt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    if (error instanceof InsufficientCreditsError) {
      return insufficientCreditsResponse(error, corsHeaders);
    }
    if (creditReservation && userId) {
      await releaseCredits({
        supabase,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        reason: 'gemini_image_generation_failed',
        userId,
        metadata: { endpoint: 'gemini-image-generation', model_id: modelId },
      });
    }
    console.error("[gemini-image-gen] Error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
