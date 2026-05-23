/**
 * gmi-execute – Edge function that routes AI generation requests to
 * the GMI Cloud API. GMI calls still consume credits and are blocked at zero balance.
 *
 * Supports three execution paths:
 *   1. LLM chat completions (text models → api.gmi-serving.com)
 *   2. Image queue (Seedream etc → console.gmicloud.ai request queue)
 *   3. Video queue (Kling V3 Omni etc → console.gmicloud.ai request queue)
 *
 * Some surfaces route GMI models here directly while Fal models use falai-execute.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { getCatalogModelById } from '../_shared/ai-model-catalog.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import {
  buildCreditIdempotencyKey,
  commitCredits,
  getCreditCostForModel,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
} from '../_shared/credits.ts';
import {
  executeGmiChatCompletion,
  executeGmiQueueModel,
  pollGmiQueueStatus,
} from '../_shared/gmi-client.ts';

interface RequestBody {
  modelId: string;
  inputs: Record<string, any>;
  mode?: 'sync' | 'queue';
  action?: 'submit' | 'poll';
  requestId?: string; // for polling
  metadata?: {
    userId?: string;
    projectId?: string;
    nodeId?: string;
    source?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  let creditReservation: { holdId: string | null; requestedAmount: number; skipped: boolean } | null = null;
  let creditCost = 0;
  let userId: string | null = null;
  let modelIdForBilling = '';
  let resourceTypeForBilling = 'generation';

  try {
    const user = await authenticateRequest(req.headers);
    userId = user.id;

    const body: RequestBody = await req.json();
    const { modelId, inputs, action = 'submit', requestId, metadata } = body;

    // ── Poll an existing request ────────────────────────────────────────
    if (action === 'poll') {
      if (!requestId) {
        return errorResponse('requestId is required for polling', 400);
      }

      const pollResult = await pollGmiQueueStatus(requestId);
      if (!pollResult.success) {
        return errorResponse(pollResult.error ?? 'GMI poll failed', 502);
      }

      return successResponse({
        success: true,
        data: pollResult.data,
        requestId,
        status: pollResult.data?.status,
      });
    }

    // ── Submit a new request ────────────────────────────────────────────
    if (!modelId || typeof modelId !== 'string') {
      return errorResponse('Invalid model ID', 400);
    }

    const model = await getCatalogModelById(modelId);
    if (!model || model.provider !== 'gmi-cloud') {
      return errorResponse(`Model ${modelId} is not a GMI Cloud model`, 400);
    }

    const apiModelId = model.endpointId;
    modelIdForBilling = modelId;
    resourceTypeForBilling = model.mediaType || 'generation';

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    creditCost = getCreditCostForModel(modelId, resourceTypeForBilling);
    creditReservation = await reserveCredits({
      supabase: serviceClient,
      userId,
      resourceType: resourceTypeForBilling,
      requestedAmount: creditCost,
      referenceType: 'gmi_execute',
      referenceId: metadata?.nodeId || requestId || crypto.randomUUID(),
      idempotencyKey: buildCreditIdempotencyKey(
        'gmi-execute',
        userId,
        metadata?.projectId,
        metadata?.nodeId,
        modelId,
        requestId,
        crypto.randomUUID(),
      ),
      metadata: {
        endpoint: 'gmi-execute',
        project_id: metadata?.projectId,
        node_id: metadata?.nodeId,
        source: metadata?.source,
        model_id: modelId,
      },
    });

    console.log('[gmi-execute] Executing model:', {
      studioModelId: modelId,
      apiModelId,
      source: metadata?.source,
    });

    // ── Text / LLM path ────────────────────────────────────────────────
    if (model.transportType === 'chat_completion' || model.mediaType === 'text') {
      const messages = inputs.messages ?? [
        { role: 'user', content: inputs.prompt ?? '' },
      ];

      const result = await executeGmiChatCompletion(apiModelId, messages, {
        max_tokens: inputs.max_tokens ?? 2000,
        temperature: inputs.temperature ?? 1,
        stream: false,
      });

      if (!result.success) {
        await releaseCredits({
          supabase: serviceClient,
          holdId: creditReservation.holdId,
          skipped: creditReservation.skipped,
          reason: 'gmi_text_failed',
          userId,
          metadata: { endpoint: 'gmi-execute', model_id: modelId },
        });
        creditReservation = null;
        return errorResponse(result.error ?? 'GMI LLM execution failed', 502);
      }

      await commitCredits({
        supabase: serviceClient,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        amount: creditCost,
        userId,
        metadata: { endpoint: 'gmi-execute', model_id: modelId },
      });
      creditReservation = null;

      return successResponse({
        success: true,
        data: result.data,
        provider: 'gmi-cloud',
      });
    }

    // ── Image / Video queue path ────────────────────────────────────────
    const payload = { ...inputs };
    // The GMI queue API wraps inputs inside a "payload" key; we pass the
    // model + payload to executeGmiQueueModel which structures it properly.

    const result = await executeGmiQueueModel(apiModelId, payload, model.payloadKeys);

    if (!result.success) {
      await releaseCredits({
        supabase: serviceClient,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        reason: 'gmi_queue_submit_failed',
        userId,
        metadata: { endpoint: 'gmi-execute', model_id: modelId },
      });
      creditReservation = null;
      return errorResponse(result.error ?? 'GMI queue submission failed', 502);
    }

    await commitCredits({
      supabase: serviceClient,
      holdId: creditReservation.holdId,
      skipped: creditReservation.skipped,
      amount: creditCost,
      userId,
      metadata: {
        endpoint: 'gmi-execute',
        model_id: modelId,
        request_id: result.requestId,
      },
    });
    creditReservation = null;

    return successResponse({
      success: true,
      data: result.data,
      requestId: result.requestId,
      statusUrl: result.statusUrl,
      provider: 'gmi-cloud',
    });
  } catch (error) {
    console.error('[gmi-execute] Error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    if (error instanceof InsufficientCreditsError) {
      return insufficientCreditsResponse(error, corsHeaders);
    }

    if (creditReservation && userId) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } },
      );
      await releaseCredits({
        supabase: serviceClient,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        reason: 'gmi_execute_failed',
        userId,
        metadata: {
          endpoint: 'gmi-execute',
          model_id: modelIdForBilling,
          resource_type: resourceTypeForBilling,
        },
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to execute GMI model';
    return errorResponse(message, 500);
  }
});
