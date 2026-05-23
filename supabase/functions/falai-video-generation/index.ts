import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import {
  CANONICAL_FAL_MODELS,
  executeFalModel,
  getCanonicalFalModel,
  getDefaultFalModelForMedia,
  mergeFalModelInputs,
  pollFalStatus,
  resolveFalModelOrFallback,
} from '../_shared/falai-client.ts';

interface VideoGenerationInput {
  prompt: string
  image_url?: string
  image_urls?: string[]
  aspect_ratio?: string
  duration?: number
  fps?: number
  motion_strength?: number
  resolution?: string
  generate_audio?: boolean
  settings?: Record<string, unknown>
  settings_override?: Record<string, unknown> | string
  model_id?: string
}

const MAX_POLL_ATTEMPTS = 300;
const POLL_INTERVAL_MS = 1000;

async function delay(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFalResponseUrl(responseUrl: string, falKey: string): Promise<any> {
  const resp = await fetch(responseUrl, {
    method: 'GET',
    headers: { Authorization: `Key ${falKey}` },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch final Fal result (${resp.status})`);
  }

  return await resp.json();
}

async function runFalVideoGeneration(args: {
  modelId: string;
  input: VideoGenerationInput;
  falKey: string;
  referenceImages: string[];
}): Promise<{ result: any; modelId: string }> {
  const merged = mergeFalModelInputs(args.modelId, {
    prompt: args.input.prompt,
    image_url: args.referenceImages[0],
    image_urls: args.referenceImages.length > 0 ? args.referenceImages : undefined,
    aspect_ratio: args.input.aspect_ratio,
    duration: args.input.duration,
    duration_seconds: args.input.duration,
    fps: args.input.fps,
    motion_strength: args.input.motion_strength,
    resolution: args.input.resolution,
    generate_audio: args.input.generate_audio,
    settings: args.input.settings,
    settings_override: args.input.settings_override,
  });

  console.log(`Generating video with ${merged.modelId}:`, merged.inputs);
  const submitResult = await executeFalModel(merged.modelId, merged.inputs, 'queue');
  if (!submitResult.success || !submitResult.requestId) {
    throw new Error(submitResult.error || 'Failed to generate video');
  }

  let finalResult: any = null;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const statusResponse = await pollFalStatus(submitResult.requestId, submitResult.statusUrl);
    if (!statusResponse.success) {
      throw new Error(statusResponse.error || 'Failed to poll video generation');
    }

    const status = statusResponse.data?.status;
    if (status === 'COMPLETED') {
      finalResult = submitResult.responseUrl
        ? await fetchFalResponseUrl(submitResult.responseUrl, args.falKey)
        : statusResponse.data?.result;
      break;
    }

    if (status === 'FAILED') {
      throw new Error(`Fal video generation failed for ${merged.modelId}`);
    }

    await delay(POLL_INTERVAL_MS);
  }

  if (!finalResult) {
    throw new Error(`Timed out waiting for video generation from ${merged.modelId}`);
  }

  return {
    result: finalResult,
    modelId: merged.modelId,
  };
}

function getDefaultVideoGenerationModel(hasImageInput: boolean) {
  return (
    CANONICAL_FAL_MODELS.find(
      (model) =>
        model.media_type === 'video' &&
        model.ui_group === 'generation' &&
        model.workflow_type === (hasImageInput ? 'image-to-video' : 'text-to-video')
    ) ?? getDefaultFalModelForMedia('video', 'generation')
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const isInternalRequest = req.headers.get('x-internal-request') === 'true';
    if (!isInternalRequest) {
      await authenticateRequest(req.headers);
    }

    const input: VideoGenerationInput = await req.json();
    
    if (!input.prompt) {
      return errorResponse('Prompt is required', 400);
    }

    const falKey = Deno.env.get('FAL_KEY');
    if (!falKey) {
      return errorResponse('FAL_KEY environment variable is not set', 500);
    }

    const referenceImages = [
      ...(typeof input.image_url === 'string' && input.image_url ? [input.image_url] : []),
      ...((input.image_urls ?? []).filter(Boolean)),
    ];
    const fallbackModel = getDefaultVideoGenerationModel(referenceImages.length > 0);
    const requestedModelId =
      input.model_id || fallbackModel.id;
    const resolvedModel = resolveFalModelOrFallback(requestedModelId, {
      mediaTypeHint: 'video',
      uiGroup: 'generation',
    });
    const canonicalModel = getCanonicalFalModel(resolvedModel.model.id);
    let primaryModelId = resolvedModel.model.id;
    let fallbackUsed = resolvedModel.fallbackUsed;
    let fallbackReason = resolvedModel.fallbackReason;

    if (!canonicalModel || canonicalModel.media_type !== 'video') {
      return errorResponse(`Unsupported video model: ${requestedModelId}`, 400);
    }

    if (
      canonicalModel.workflow_type !== 'text-to-video' &&
      canonicalModel.workflow_type !== 'image-to-video' &&
      canonicalModel.workflow_type !== 'reference-to-video'
    ) {
      primaryModelId = fallbackModel.id;
      fallbackUsed = true;
      fallbackReason = `incompatible_workflow:${canonicalModel.workflow_type}`;
    }

    if (
      (canonicalModel.workflow_type === 'image-to-video' ||
        canonicalModel.workflow_type === 'reference-to-video') &&
      referenceImages.length === 0
    ) {
      primaryModelId = getDefaultVideoGenerationModel(false).id;
      fallbackUsed = true;
      fallbackReason = `requires_input_image:${canonicalModel.id}`;
    }

    if (canonicalModel.workflow_type === 'text-to-video' && referenceImages.length > 0) {
      primaryModelId = getDefaultVideoGenerationModel(true).id;
      fallbackUsed = true;
      fallbackReason = `rejects_reference_images:${canonicalModel.id}`;
    }
    try {
      const primary = await runFalVideoGeneration({
        modelId: primaryModelId,
        input,
        falKey,
        referenceImages,
      });

      return successResponse({
        success: true,
        data: primary.result,
        model_used: primary.modelId,
        requested_model: requestedModelId,
        fallback_used: fallbackUsed,
        fallback_reason: fallbackReason,
      });
    } catch (primaryError) {
      const shouldTryFallback = primaryModelId !== fallbackModel.id;
      if (!shouldTryFallback) {
        throw primaryError;
      }

      const fallback = await runFalVideoGeneration({
        modelId: fallbackModel.id,
        input,
        falKey,
        referenceImages,
      });

      return successResponse({
        success: true,
        data: fallback.result,
        model_used: fallback.modelId,
        requested_model: requestedModelId,
        fallback_used: true,
        fallback_reason: fallbackReason ?? `runtime_failure:${primaryModelId}`,
      });
    }
  } catch (error) {
    console.error('Video generation error:', error);
    
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    
    const message = error instanceof Error ? error.message : 'Failed to generate video';
    return errorResponse(message, 500);
  }
});
