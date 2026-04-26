/**
 * gmi-execute – Edge function that routes AI generation requests to
 * the GMI Cloud API. Used exclusively by free-tier users.
 *
 * Supports three execution paths:
 *   1. LLM chat completions (text models → api.gmi-serving.com)
 *   2. Image queue (Seedream etc → console.gmicloud.ai request queue)
 *   3. Video queue (Kling V3 Omni etc → console.gmicloud.ai request queue)
 *
 * Pro/Enterprise users never hit this function — they go through falai-execute.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { getCatalogModelById } from '../_shared/ai-model-catalog.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
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

  try {
    await authenticateRequest(req.headers);

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
        return errorResponse(result.error ?? 'GMI LLM execution failed', 502);
      }

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
      return errorResponse(result.error ?? 'GMI queue submission failed', 502);
    }

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

    const message = error instanceof Error ? error.message : 'Failed to execute GMI model';
    return errorResponse(message, 500);
  }
});
