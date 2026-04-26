import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import { executeFalModel } from '../_shared/falai-client.ts';
import { getCatalogModelById } from '../_shared/ai-model-catalog.ts';
import {
  executeGmiQueueModel,
  executeGmiChatCompletion,
} from '../_shared/gmi-client.ts';

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

  try {
    await authenticateRequest(req.headers);

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
        return successResponse({ ...result, provider: 'gmi-cloud' });
      }

      // Image / Video models use the request queue
      const result = await executeGmiQueueModel(apiModelId, inputs, catalogModel.payloadKeys);
      return successResponse({ ...result, provider: 'gmi-cloud' });
    }

    // ── Default: route to Fal AI ────────────────────────────────────────
    const result = await executeFalModel(modelId, inputs, mode);

    return successResponse(result);
  } catch (error) {
    console.error('Edge function error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    const message = error instanceof Error ? error.message : 'Failed to execute model';
    return errorResponse(message, 500);
  }
});
