import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import {
  executeFalModel,
  getCanonicalFalModel,
  getDefaultFalModelForMedia,
  mergeFalModelInputs,
  pollFalStatus,
  resolveFalModelOrFallback,
} from '../_shared/falai-client.ts';

interface ImageGenerationInput {
  prompt: string
  image_size?: string
  aspect_ratio?: string
  num_inference_steps?: number
  guidance_scale?: number
  num_images?: number
  seed?: number
  enable_safety_checker?: boolean
  output_format?: 'jpeg' | 'png' | 'webp'
  settings?: Record<string, unknown>
  settings_override?: Record<string, unknown> | string
  model_id?: string // Allow model selection
}

const MAX_POLL_ATTEMPTS = 180;
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

async function runFalImageGeneration(args: {
  modelId: string;
  input: ImageGenerationInput;
  falKey: string;
}): Promise<{ result: any; modelId: string }> {
  const merged = mergeFalModelInputs(args.modelId, {
    prompt: args.input.prompt,
    image_size: args.input.image_size,
    aspect_ratio: args.input.aspect_ratio,
    num_inference_steps: args.input.num_inference_steps,
    guidance_scale: args.input.guidance_scale,
    num_images: args.input.num_images ?? 1,
    seed: args.input.seed,
    enable_safety_checker: args.input.enable_safety_checker,
    output_format: args.input.output_format,
    settings: args.input.settings,
    settings_override: args.input.settings_override,
  });

  console.log(`Generating image with ${merged.modelId}:`, merged.inputs);
  const submitResult = await executeFalModel(merged.modelId, merged.inputs, 'queue');
  if (!submitResult.success || !submitResult.requestId) {
    throw new Error(submitResult.error || `FAL image generation failed for ${merged.modelId}`);
  }

  let finalResult: any = null;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const statusResponse = await pollFalStatus(submitResult.requestId, submitResult.statusUrl);
    if (!statusResponse.success) {
      throw new Error(statusResponse.error || 'Failed to poll image generation');
    }

    const status = statusResponse.data?.status;
    if (status === 'COMPLETED') {
      finalResult = submitResult.responseUrl
        ? await fetchFalResponseUrl(submitResult.responseUrl, args.falKey)
        : statusResponse.data?.result;
      break;
    }

    if (status === 'FAILED') {
      throw new Error(`Fal image generation failed for ${merged.modelId}`);
    }

    await delay(POLL_INTERVAL_MS);
  }

  if (!finalResult) {
    throw new Error(`Timed out waiting for image generation from ${merged.modelId}`);
  }

  return {
    result: finalResult,
    modelId: merged.modelId,
  };
}

// Helper function to generate images with OpenAI as fallback
async function generateWithOpenAI(prompt: string, size: string = '1024x1024'): Promise<any> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('Neither FAL_KEY nor OPENAI_API_KEY is configured');
  }

  console.log('Falling back to OpenAI image generation...');
  
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: prompt,
      n: 1,
      size: size,
      quality: 'high'
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  
  // Return in FAL-compatible format
  return {
    success: true,
    data: {
      images: [{
        url: `data:image/png;base64,${data.data[0].b64_json}`,
        width: parseInt(size.split('x')[0]),
        height: parseInt(size.split('x')[1])
      }]
    }
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    // Check if request is internal (from another edge function)
    const isInternalRequest = req.headers.get('x-internal-request') === 'true';
    
    // Only authenticate external requests
    if (!isInternalRequest) {
      await authenticateRequest(req.headers);
    }

    const input: ImageGenerationInput = await req.json();
    
    if (!input.prompt) {
      return errorResponse('Prompt is required', 400);
    }

    const falKey = Deno.env.get('FAL_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!falKey && !openaiKey) {
      return errorResponse('No image generation service configured. Please set FAL_KEY or OPENAI_API_KEY environment variable.', 500);
    }

    let result;
    
    // Try FAL.AI first if key is available
    if (falKey) {
      try {
        const requestedModelId =
          input.model_id || getDefaultFalModelForMedia('image', 'generation').id;
        const fallbackModel = getDefaultFalModelForMedia('image', 'generation');
        const resolvedModel = resolveFalModelOrFallback(requestedModelId, {
          mediaTypeHint: 'image',
          uiGroup: 'generation',
        });
        const canonicalModel = getCanonicalFalModel(resolvedModel.model.id);
        let primaryModelId = resolvedModel.model.id;
        let fallbackUsed = resolvedModel.fallbackUsed;
        let fallbackReason = resolvedModel.fallbackReason;

        if (!canonicalModel || canonicalModel.media_type !== 'image') {
          return errorResponse(`Unsupported image model: ${requestedModelId}`, 400);
        }

        if (canonicalModel.workflow_type !== 'text-to-image') {
          primaryModelId = fallbackModel.id;
          fallbackUsed = true;
          fallbackReason = `incompatible_workflow:${canonicalModel.workflow_type}`;
        }
        try {
          const primary = await runFalImageGeneration({
            modelId: primaryModelId,
            input,
            falKey,
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
          if (shouldTryFallback) {
            const fallback = await runFalImageGeneration({
              modelId: fallbackModel.id,
              input,
              falKey,
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

          throw primaryError;
        }
      } catch (falError) {
        console.error('FAL.AI generation failed:', falError);
        console.log('Attempting OpenAI fallback...');
        
        if (!openaiKey) {
          throw falError; // Re-throw if no fallback available
        }
      }
    }
    
    // Use OpenAI as fallback or primary if FAL key not available
    if (openaiKey) {
      result = await generateWithOpenAI(input.prompt, input.image_size || '1024x1024');
      
      return successResponse({
        ...result,
        model_used: 'openai-gpt-image-1',
      });
    }
    
    return errorResponse('All image generation services failed', 500);

  } catch (error) {
    console.error('Image generation error:', error);
    
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    
    const message = error instanceof Error ? error.message : 'Failed to generate image';
    return errorResponse(message, 500);
  }
});
