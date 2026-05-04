import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import { executeFalModel } from '../_shared/falai-client.ts';
import { getCatalogModelById } from '../_shared/ai-model-catalog.ts';
import {
  executeGmiQueueModel,
  executeGmiChatCompletion,
} from '../_shared/gmi-client.ts';
import {
  buildCreditIdempotencyKey,
  commitCredits,
  getCreditCostForModel,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
} from '../_shared/credits.ts';

interface RequestBody {
  modelId: string
  inputs: Record<string, any>
  mode?: 'sync' | 'queue'
  metadata?: {
    userId?: string
    projectId?: string
    nodeId?: string
    source?: 'node-editor' | 'storyboard' | 'timeline'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  let creditReservation: { holdId: string | null; requestedAmount: number; skipped: boolean } | null = null;
  let creditCost = 0;
  let userId: string | null = null;
  let billingModelId = '';
  let billingResourceType = 'generation';

  try {
    const user = await authenticateRequest(req.headers);
    userId = user.id;

    const body: RequestBody = await req.json();
    const { modelId, inputs, mode = 'queue', metadata } = body;

    if (!modelId || typeof modelId !== 'string') {
      return errorResponse('Invalid model ID', 400);
    }

    console.log('Executing model:', {
      modelId,
      source: metadata?.source,
      userId: metadata?.userId,
    });

    const catalogModel = await getCatalogModelById(modelId, { enabledOnly: false });
    billingModelId = modelId;
    billingResourceType = catalogModel?.mediaType || 'generation';

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    creditCost = getCreditCostForModel(modelId, billingResourceType);
    creditReservation = await reserveCredits({
      supabase: serviceClient,
      userId,
      resourceType: billingResourceType,
      requestedAmount: creditCost,
      referenceType: 'falai_execute',
      referenceId: metadata?.nodeId || crypto.randomUUID(),
      idempotencyKey: buildCreditIdempotencyKey(
        'falai-execute',
        userId,
        metadata?.projectId,
        metadata?.nodeId,
        modelId,
        crypto.randomUUID(),
      ),
      metadata: {
        endpoint: 'falai-execute',
        project_id: metadata?.projectId,
        node_id: metadata?.nodeId,
        source: metadata?.source,
        model_id: modelId,
      },
    });

    // ── Route GMI Cloud models to the GMI API ───────────────────────────
    if (catalogModel?.provider === 'gmi-cloud') {
      const apiModelId = catalogModel.endpointId;

      // Text / LLM models use the chat completions endpoint
      if (catalogModel.transportType === 'chat_completion' || catalogModel.mediaType === 'text') {
        const messages = inputs.messages ?? [
          { role: 'user', content: inputs.prompt ?? '' },
        ];
        const result = await executeGmiChatCompletion(apiModelId, messages, {
          max_tokens: inputs.max_tokens ?? 2000,
          temperature: inputs.temperature ?? 1,
        });
        if (!result.success) {
          await releaseCredits({
            supabase: serviceClient,
            holdId: creditReservation.holdId,
            skipped: creditReservation.skipped,
            reason: 'gmi_text_failed',
            userId,
            metadata: { endpoint: 'falai-execute', model_id: modelId },
          });
          creditReservation = null;
          return successResponse({ ...result, provider: 'gmi-cloud' });
        }
        await commitCredits({
          supabase: serviceClient,
          holdId: creditReservation.holdId,
          skipped: creditReservation.skipped,
          amount: creditCost,
          userId,
          metadata: { endpoint: 'falai-execute', model_id: modelId },
        });
        creditReservation = null;
        return successResponse({ ...result, provider: 'gmi-cloud' });
      }

      // Image / Video models use the request queue
      const result = await executeGmiQueueModel(apiModelId, inputs, catalogModel.payloadKeys);
      if (!result.success) {
        await releaseCredits({
          supabase: serviceClient,
          holdId: creditReservation.holdId,
          skipped: creditReservation.skipped,
          reason: 'gmi_queue_submit_failed',
          userId,
          metadata: { endpoint: 'falai-execute', model_id: modelId },
        });
        creditReservation = null;
        return successResponse({ ...result, provider: 'gmi-cloud' });
      }
      await commitCredits({
        supabase: serviceClient,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        amount: creditCost,
        userId,
        metadata: {
          endpoint: 'falai-execute',
          model_id: modelId,
          request_id: result.requestId,
        },
      });
      creditReservation = null;
      return successResponse({ ...result, provider: 'gmi-cloud' });
    }

    // ── Default: route to Fal AI ────────────────────────────────────────
    const result = await executeFalModel(modelId, inputs, mode);
    if (!result.success) {
      await releaseCredits({
        supabase: serviceClient,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        reason: 'fal_submit_failed',
        userId,
        metadata: { endpoint: 'falai-execute', model_id: modelId },
      });
      creditReservation = null;
      return successResponse(result);
    }

    await commitCredits({
      supabase: serviceClient,
      holdId: creditReservation.holdId,
      skipped: creditReservation.skipped,
      amount: creditCost,
      userId,
      metadata: {
        endpoint: 'falai-execute',
        model_id: modelId,
        request_id: result.requestId,
      },
    });
    creditReservation = null;

    return successResponse(result);
  } catch (error) {
    console.error('Edge function error:', error);

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
        reason: 'falai_execute_failed',
        userId,
        metadata: {
          endpoint: 'falai-execute',
          model_id: billingModelId,
          resource_type: billingResourceType,
        },
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to execute model';
    return errorResponse(message, 500);
  }
});
