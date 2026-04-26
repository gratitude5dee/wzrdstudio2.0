import * as fal from 'npm:@fal-ai/serverless-client';

import { AuthError, authenticateRequest } from '../_shared/auth.ts';
import {
  enhancePromptForImageGeneration,
  extractLayerArtifacts,
  extractSingleImageArtifact,
} from '../_shared/image-edit.ts';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';

type ImageEditOperation =
  | 'enhancePrompt'
  | 'upscale'
  | 'crop'
  | 'inpaint'
  | 'outpaint'
  | 'removeBackground'
  | 'splitLayers'
  | 'productPlacement';

interface ImageEditOperationRequest {
  projectId?: string;
  nodeId?: string;
  operation?: ImageEditOperation;
  prompt?: string;
  imageUrl?: string;
  maskDataUrl?: string;
  modelId?: string;
  productImageUrl?: string;
}

const SUPPORTED_OPERATIONS = new Set<ImageEditOperation>([
  'enhancePrompt',
  'inpaint',
  'removeBackground',
  'splitLayers',
  'upscale',
  'productPlacement',
]);

const DEFAULT_INPAINT_MODEL = 'fal-ai/flux-pro/v1/fill';
const REMOVE_BACKGROUND_MODEL_ID = 'fal-ai/imageutils/rembg';
const SPLIT_LAYERS_MODEL_ID = 'fal-ai/qwen-image-layered';
const DEFAULT_UPSCALE_MODEL = 'fal-ai/seedvr/upscale/image/seamless';
const DEFAULT_PRODUCT_PLACEMENT_MODEL = 'bria/embed-product';

let falConfigured = false;

function ensureFalConfigured() {
  const falKey = Deno.env.get('FAL_KEY');
  if (!falKey) {
    throw new Error('FAL_KEY not configured');
  }

  if (!falConfigured) {
    fal.config({ credentials: falKey });
    falConfigured = true;
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function runFalModel(modelId: string, input: Record<string, unknown>) {
  ensureFalConfigured();
  return await fal.subscribe(modelId, {
    input,
    logs: true,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await authenticateRequest(req.headers);
    const body = (await req.json()) as ImageEditOperationRequest;

    const projectId = normalizeString(body.projectId);
    const nodeId = normalizeString(body.nodeId);
    const operation = body.operation;
    const prompt = normalizeString(body.prompt);
    const imageUrl = normalizeString(body.imageUrl);
    const maskDataUrl = normalizeString(body.maskDataUrl);
    const modelId = normalizeString(body.modelId);
    const productImageUrl = normalizeString(body.productImageUrl);

    if (!projectId) {
      return errorResponse('projectId is required', 400);
    }

    if (!nodeId) {
      return errorResponse('nodeId is required', 400);
    }

    if (!operation) {
      return errorResponse('operation is required', 400);
    }

    if (!SUPPORTED_OPERATIONS.has(operation)) {
      return errorResponse(`${operation} is not supported yet`, 400, {
        supported: Array.from(SUPPORTED_OPERATIONS),
      });
    }

    console.log('image-edit-operation request:', {
      projectId,
      nodeId,
      operation,
      modelId: modelId || 'default',
      userId: user.id,
    });

    if (operation === 'enhancePrompt') {
      if (!prompt) {
        return errorResponse('prompt is required for enhancePrompt', 400);
      }

      return successResponse({
        prompt: enhancePromptForImageGeneration(prompt),
      });
    }

    if (!imageUrl) {
      return errorResponse('imageUrl is required', 400);
    }

    if (operation === 'inpaint') {
      if (!maskDataUrl) {
        return errorResponse('maskDataUrl is required for inpaint', 400);
      }

      const inpaintModel = modelId || DEFAULT_INPAINT_MODEL;
      const result = await runFalModel(inpaintModel, {
        image_url: imageUrl,
        mask_url: maskDataUrl,
        mask_image_url: maskDataUrl,
        prompt: prompt || 'Fill the masked area naturally and preserve the rest of the image',
        num_inference_steps: 28,
        guidance_scale: 7.5,
        num_images: 1,
        output_format: 'png',
      });

      const asset = extractSingleImageArtifact(result, 'Inpaint result');
      if (!asset) {
        throw new Error('No edited asset returned from inpaint operation');
      }

      return successResponse({ asset });
    }

    if (operation === 'removeBackground') {
      const result = await runFalModel(REMOVE_BACKGROUND_MODEL_ID, {
        image_url: imageUrl,
      });

      const asset = extractSingleImageArtifact(result, 'Cutout');
      if (!asset) {
        throw new Error('No asset returned from background removal');
      }

      return successResponse({ asset });
    }

    if (operation === 'upscale') {
      const upscaleModel = modelId || DEFAULT_UPSCALE_MODEL;
      const result = await runFalModel(upscaleModel, {
        image_url: imageUrl,
        scale: 2,
      });

      const asset = extractSingleImageArtifact(result, 'Upscaled');
      if (!asset) {
        throw new Error('No asset returned from upscale operation');
      }

      return successResponse({ asset });
    }

    if (operation === 'productPlacement') {
      if (!productImageUrl) {
        return errorResponse('productImageUrl is required for productPlacement', 400);
      }

      const placementModel = modelId || DEFAULT_PRODUCT_PLACEMENT_MODEL;
      const result = await runFalModel(placementModel, {
        image_url: imageUrl,
        product_image_url: productImageUrl,
        prompt: prompt || 'Place the product naturally in the scene',
      });

      const asset = extractSingleImageArtifact(result, 'Product Placement');
      if (!asset) {
        throw new Error('No asset returned from product placement operation');
      }

      return successResponse({ asset });
    }

    // splitLayers (default fallthrough)
    const result = await runFalModel(SPLIT_LAYERS_MODEL_ID, {
      image_url: imageUrl,
    });

    const layers = extractLayerArtifacts(result);
    if (layers.length === 0) {
      throw new Error('No layers returned from splitLayers');
    }

    return successResponse({ layers });
  } catch (error) {
    console.error('image-edit-operation error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    return errorResponse(
      error instanceof Error ? error.message : 'Failed to execute image edit operation',
      500
    );
  }
});
