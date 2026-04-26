export interface FalResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  requestId?: string
  logs?: any[]
  statusUrl?: string
  responseUrl?: string
}

export interface FalQueueStatus {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  response_url?: string
  queue_position?: number
  logs?: any[]
  result?: any
}

export async function executeFalModel<T>(
  modelId: string,
  inputs: Record<string, any>,
  mode: 'sync' | 'queue' = 'queue'
): Promise<FalResponse<T>> {
  try {
    const falKey = Deno.env.get('FAL_KEY')
    if (!falKey) {
      throw new Error('FAL_KEY environment variable is not set')
    }

    console.log(`Executing Fal.AI model: ${modelId} with mode: ${mode}`)

    // Use queue.fal.run for async (queue) mode, fal.run for sync
    const baseUrl = mode === 'queue' ? 'https://queue.fal.run' : 'https://fal.run';
    const response = await fetch(`${baseUrl}/${modelId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(inputs),
    })

    const responseText = await response.text()
    console.log('Fal.AI response:', responseText)

    if (!response.ok) {
      let errorMessage
      try {
        const error = JSON.parse(responseText)
        errorMessage = error.message || error.error || `Failed to execute model (${response.status})`
      } catch {
        errorMessage = `Failed to execute model (${response.status}): ${responseText}`
      }
      throw new Error(errorMessage)
    }

    const result = JSON.parse(responseText)
    
    return {
      success: true,
      data: mode === 'queue' ? result : result,
      requestId: result.request_id,
      logs: result.logs,
      // Store queue URLs for reliable polling
      statusUrl: result.status_url,
      responseUrl: result.response_url,
    }
  } catch (error) {
    console.error('Fal.AI execution error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function pollFalStatus(requestId: string, statusUrl?: string): Promise<FalResponse<any>> {
  try {
    const falKey = Deno.env.get('FAL_KEY')
    if (!falKey) {
      throw new Error('FAL_KEY environment variable is not set')
    }

    // Use the status URL from the queue response if available, otherwise construct one
    const url = statusUrl || `https://queue.fal.run/requests/${requestId}/status`;
    const response = await fetch(`${url}?logs=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${falKey}`,
      },
    })

    const responseText = await response.text()
    console.log('Fal.AI status response:', responseText)

    if (!response.ok) {
      let errorMessage
      try {
        const error = JSON.parse(responseText)
        errorMessage = error.message || error.error || 'Failed to check status from fal.ai'
      } catch {
        errorMessage = 'Failed to check status from fal.ai: ' + responseText
      }
      throw new Error(errorMessage)
    }

    const data = JSON.parse(responseText)
    
    return {
      success: true,
      data: {
        status: data.status,
        result: data.logs?.length ? data.logs[data.logs.length - 1]?.result : null,
        logs: data.logs,
        queue_position: data.queue_position,
      },
    }
  } catch (error) {
    console.error('Fal.AI status check error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to poll fal.ai status',
    }
  }
}

export interface ModelInfo {
  id: string
  name: string
  category: string
  description: string
  capabilities: string[]
  inputSchema: Record<string, any>
  outputSchema: Record<string, any>
  pricing?: {
    costPer1k?: number
    currency?: string
  }
}

// Comprehensive Fal.AI Model Registry organized by category
export const FAL_MODELS_BY_CATEGORY = {
  'image-generation': [
    {
      id: 'fal-ai/flux/schnell',
      name: 'FLUX.1 [schnell] Text to Image',
      description: 'Fast 12B parameter flow transformer for rapid text-to-image generation.',
      inputs: { prompt: 'string*', image_size: 'ImageSize|string', num_inference_steps: 'integer', guidance_scale: 'number' },
      outputs: { images: 'list<Image>' },
    },
    {
      id: 'fal-ai/flux/dev',
      name: 'FLUX.1 [dev] Text to Image',
      description: '12B parameter flow transformer for high-quality text-to-image generation.',
      inputs: { prompt: 'string*', image_size: 'ImageSize|string' },
      outputs: { images: 'list<Image>' },
    },
    {
      id: 'fal-ai/flux-pro/v1.1-ultra',
      name: 'FLUX1.1 [pro] ultra',
      description: 'Professional-grade image quality up to 2K resolution.',
      inputs: { prompt: 'string*', aspect_ratio: 'string' },
      outputs: { images: 'list<Image>' },
    },
    {
      id: 'fal-ai/hidream-i1-dev',
      name: 'Hidream I1 Dev Text to Image',
      description: '17B parameter model for state-of-the-art image generation.',
      inputs: { prompt: 'string*', image_size: 'ImageSize|string' },
      outputs: { images: 'list<Image>' },
    },
    {
      id: 'fal-ai/hidream-i1-fast',
      name: 'Hidream I1 Fast Text to Image',
      description: '17B parameter model for fast, high-quality image generation.',
      inputs: { prompt: 'string*', image_size: 'ImageSize|string' },
      outputs: { images: 'list<Image>' },
    },
    {
      id: 'fal-ai/ideogram/v3',
      name: 'Ideogram V3 Text to Image',
      description: 'Generate high-quality images, posters, and logos with great typography.',
      inputs: { prompt: 'string*' },
      outputs: { images: 'list<File>', seed: 'integer' },
    },
    {
      id: 'fal-ai/minimax/image-01',
      name: 'MiniMax (Hailuo AI) Text to Image',
      description: 'Generate high quality images from text prompts.',
      inputs: { prompt: 'string*' },
      outputs: { images: 'list<File>' },
    },
  ],
  'video-generation': [
    {
      id: 'fal-ai/magi',
      name: 'MAGI-1 (Text to Video)',
      description: 'Video generation model with exceptional understanding of physical interactions.',
      inputs: { prompt: 'string*' },
      outputs: { video: 'File' },
    },
    {
      id: 'fal-ai/magi/image-to-video',
      name: 'MAGI-1 (Image to Video)',
      description: 'Generates videos from images with exceptional understanding of physical interactions.',
      inputs: { prompt: 'string*', image_url: 'string*' },
      outputs: { video: 'File' },
    },
    {
      id: 'fal-ai/kling-video/v2/master/text-to-video',
      name: 'Kling 2.0 Master Text to Video',
      description: 'Generate video clips from prompts using Kling 2.0 Master.',
      inputs: { prompt: 'string*' },
      outputs: { video: 'File' },
    },
    {
      id: 'fal-ai/kling-video/v2/master/image-to-video',
      name: 'Kling 2.0 Master Image to Video',
      description: 'Generate video clips from images using Kling 2.0 Master.',
      inputs: { prompt: 'string*', image_url: 'string*' },
      outputs: { video: 'File' },
    },
    {
      id: 'fal-ai/ltx-video-v097',
      name: 'LTX Video-0.9.7 (Text to Video)',
      description: 'Generate videos from prompts using LTX Video-0.9.7.',
      inputs: { prompt: 'string*' },
      outputs: { video: 'File' },
    },
    {
      id: 'fal-ai/ltx-video-v097/image-to-video',
      name: 'LTX Video-0.9.7 (Image to Video)',
      description: 'Generate videos from prompts and images using LTX Video-0.9.7.',
      inputs: { prompt: 'string*', image_url: 'string*' },
      outputs: { video: 'File' },
    },
    {
      id: 'fal-ai/ltx-video-13b-distilled/image-to-video',
      name: 'LTX Video 13B Distilled (Image to Video)',
      description: 'High-quality image-to-video generation with advanced motion understanding and 13B parameters.',
      inputs: { 
        image_url: 'string*',
        prompt: 'string*',
        negative_prompt: 'string',
        resolution: 'string',
        aspect_ratio: 'string',
        num_frames: 'integer',
        first_pass_num_inference_steps: 'integer',
        second_pass_num_inference_steps: 'integer',
        frame_rate: 'integer',
        enable_safety_checker: 'boolean'
      },
      outputs: { video: 'File' },
    },
    {
      id: 'fal-ai/framepack',
      name: 'Framepack Image to Video',
      description: 'Efficient Image-to-video model that autoregressively generates videos.',
      inputs: { prompt: 'string*', image_url: 'string*' },
      outputs: { video: 'File', seed: 'integer' },
    },
    {
      id: 'fal-ai/wan-i2v',
      name: 'Wan-2.1 Image-to-Video',
      description: 'Generates high-quality videos from images.',
      inputs: { prompt: 'string*', image_url: 'string*' },
      outputs: { video: 'File' },
    },
    {
      id: 'fal-ai/veo2/image-to-video',
      name: 'Veo 2 (Image to Video)',
      description: 'Creates videos from images with realistic motion and high quality.',
      inputs: { prompt: 'string*', image_url: 'string*' },
      outputs: { video: 'File' },
    },
  ],
  'audio-generation': [
    {
      id: 'cassetteai/music-generator',
      name: 'Music Generator',
      description: 'Generates a 30-second sample in under 2 seconds and a full 3-minute track in under 10 seconds.',
      inputs: { prompt: 'string*', duration: 'integer*' },
      outputs: { audio_file: 'File' },
    },
    {
      id: 'cassetteai/sound-effects-generator',
      name: 'Sound Effects Generator',
      description: 'Generates high-quality SFX up to 30 seconds long in 1 second.',
      inputs: { prompt: 'string*', duration: 'integer*' },
      outputs: { audio_file: 'File' },
    },
    {
      id: 'fal-ai/ace-step/prompt-to-audio',
      name: 'ACE-Step Text to Audio',
      description: 'Generate music from a simple prompt using ACE-Step.',
      inputs: { prompt: 'string*', instrumental: 'boolean', duration: 'float' },
      outputs: { audio: 'File', seed: 'integer', tags: 'string', lyrics: 'string' },
    },
    {
      id: 'fal-ai/minimax/speech-02-hd',
      name: 'MiniMax Speech-02 HD',
      description: 'Generate high-quality text-to-speech.',
      inputs: { text: 'string*' },
      outputs: { audio: 'File' },
    },
    {
      id: 'fal-ai/dia-tts',
      name: 'Dia Text to Speech',
      description: 'Generates realistic dialogue from transcripts.',
      inputs: { text: 'string*' },
      outputs: { audio: 'File' },
    },
  ],
  'image-editing': [
    {
      id: 'fal-ai/hidream-e1-full',
      name: 'Hidream E1 Full Image to Image',
      description: 'Edit images with natural language.',
      inputs: { image_url: 'string*', edit_instruction: 'string' },
      outputs: { images: 'list<Image>' },
    },
    {
      id: 'fal-ai/step1x-edit',
      name: 'Step1X Edit',
      description: 'Transforms photos with simple instructions into professional-quality edits.',
      inputs: { prompt: 'string*', image_url: 'string*' },
      outputs: { images: 'list<Image>' },
    },
    {
      id: 'fal-ai/finegrain-eraser',
      name: 'Finegrain Eraser (Prompt)',
      description: 'Removes objects using natural language.',
      inputs: { image_url: 'string*', prompt: 'string*' },
      outputs: { image: 'File' },
    },
    {
      id: 'fal-ai/ideogram/v3/edit',
      name: 'Ideogram V3 Edit',
      description: 'Transform images with Ideogram V3\'s editing capabilities.',
      inputs: { prompt: 'string*', image_url: 'string*', mask_url: 'string*' },
      outputs: { images: 'list<File>' },
    },
    {
      id: 'fal-ai/cartoonify',
      name: 'Cartoonify Image to Image',
      description: 'Transform images into 3D cartoon artwork.',
      inputs: { image_url: 'string*' },
      outputs: { images: 'list<Image>', prompt: 'string' },
    },
  ],
  'speech-processing': [
    {
      id: 'fal-ai/speech-to-text',
      name: 'Speech-to-Text',
      description: 'Accurate and efficient speech-to-text transcription.',
      inputs: { audio_url: 'string*' },
      outputs: { output: 'string' },
    },
    {
      id: 'fal-ai/speech-to-text/turbo',
      name: 'Speech-to-Text (Turbo)',
      description: 'Rapid processing for speech-to-text transcription.',
      inputs: { audio_url: 'string*' },
      outputs: { output: 'string' },
    },
    {
      id: 'fal-ai/dia-tts/voice-clone',
      name: 'Dia Tts Voice Cloning',
      description: 'Clone dialog voices from a sample audio and generate dialogs from text.',
      inputs: { text: 'string*', ref_audio_url: 'string*', ref_text: 'string*' },
      outputs: { audio: 'File' },
    },
    {
      id: 'fal-ai/minimax/voice-clone',
      name: 'MiniMax Voice Cloning',
      description: 'Clone a voice from a sample audio.',
      inputs: { audio_url: 'string*' },
      outputs: { custom_voice_id: 'string' },
    },
  ],
  'vision-language': [
    {
      id: 'fal-ai/moondream2',
      name: 'Moondream2 (Caption)',
      description: 'Efficient vision language model for image understanding.',
      inputs: { image_url: 'string*' },
      outputs: { output: 'string' },
    },
    {
      id: 'fal-ai/moondream2/visual-query',
      name: 'Moondream2 (Visual Query)',
      description: 'Efficient vision language model for visual question answering.',
      inputs: { image_url: 'string*', query: 'string*' },
      outputs: { output: 'string' },
    },
    {
      id: 'fal-ai/moondream2/object-detection',
      name: 'Moondream2 (Object Detection)',
      description: 'Efficient vision language model for object detection.',
      inputs: { image_url: 'string*', object: 'string*' },
      outputs: { objects: 'list<object>', image: 'Image' },
    },
  ],
  '3d-generation': [
    {
      id: 'fal-ai/trellis/multi',
      name: 'Trellis (Multi-Image)',
      description: 'Generate 3D models from multiple images.',
      inputs: { image_urls: 'list<string>*' },
      outputs: { model_mesh: 'File' },
    },
  ],
  'enhancement': [
    {
      id: 'fal-ai/recraft/upscale/creative',
      name: 'Recraft Creative Upscale',
      description: 'Enhances raster images, increasing resolution and sharpness.',
      inputs: { image_url: 'string*' },
      outputs: { image: 'File' },
    },
    {
      id: 'fal-ai/recraft/upscale/crisp',
      name: 'Recraft Crisp Upscale',
      description: 'Enhances raster images, boosting resolution with a focus on details and faces.',
      inputs: { image_url: 'string*' },
      outputs: { image: 'File' },
    },
  ],
} as const;

// Define the model type based on the structure
type FalModelDefinition = {
  id: string;
  name: string;
  description: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
};

// Flatten all models for easy access (excluding 3D generation from general list)
export const ALL_FAL_MODELS: FalModelDefinition[] = Object.entries(FAL_MODELS_BY_CATEGORY)
  .filter(([category]) => category !== '3d-generation')
  .flatMap(([_, models]) => [...models] as FalModelDefinition[]);

// Legacy COMMON_MODELS for backward compatibility
export const COMMON_MODELS: ModelInfo[] = [
  {
    id: 'fal-ai/flux/dev',
    name: 'FLUX.1 [dev]',
    category: 'image-generation',
    description: 'High-quality text-to-image generation',
    capabilities: ['text-to-image', 'high-quality'],
    inputSchema: {
      prompt: { type: 'string', required: true },
      image_size: { type: 'string', default: '1024x1024' },
      num_inference_steps: { type: 'number', default: 28 },
      guidance_scale: { type: 'number', default: 3.5 },
      num_images: { type: 'number', default: 1 },
      seed: { type: 'number', optional: true },
      enable_safety_checker: { type: 'boolean', default: true },
    },
    outputSchema: {
      images: { type: 'array', items: { url: 'string', width: 'number', height: 'number' } },
    },
  },
  {
    id: 'fal-ai/magi',
    name: 'MAGI-1 (Text to Video)',
    category: 'video-generation',
    description: 'Video generation model with exceptional understanding of physical interactions',
    capabilities: ['text-to-video', 'physics-aware'],
    inputSchema: {
      prompt: { type: 'string', required: true },
      aspect_ratio: { type: 'string', default: '16:9' },
      loop: { type: 'boolean', default: false },
    },
    outputSchema: {
      video: { type: 'object', properties: { url: 'string' } },
    },
  },
  {
    id: 'cassetteai/music-generator',
    name: 'Music Generator',
    category: 'audio-generation',
    description: 'Fast music generation from text prompts',
    capabilities: ['text-to-audio', 'music'],
    inputSchema: {
      prompt: { type: 'string', required: true },
      duration: { type: 'number', default: 30 },
    },
    outputSchema: {
      audio_file: { type: 'object', properties: { url: 'string' } },
    },
  },
];

// Helper function to get models by category
export function getModelsByCategory(category: string): FalModelDefinition[] {
  const models = (FAL_MODELS_BY_CATEGORY as unknown as Record<string, readonly FalModelDefinition[]>)[category];
  return models ? [...models] : [];
}

// Helper function to find a model by ID
export function getModelById(id: string): FalModelDefinition | undefined {
  return ALL_FAL_MODELS.find((model: FalModelDefinition) => model.id === id);
}

// Fal.ai Model Constants for easy reference
export const FAL_MODELS = {
  // Image Generation
  FLUX_PRO: "fal-ai/flux-pro/v1.1-ultra",
  FLUX_DEV: "fal-ai/flux/dev",
  FLUX_SCHNELL: "fal-ai/flux/schnell",
  STABLE_DIFFUSION_XL: "fal-ai/stable-diffusion-xl",
  HIDREAM_I1_DEV: "fal-ai/hidream-i1-dev",
  HIDREAM_I1_FAST: "fal-ai/hidream-i1-fast",
  IDEOGRAM_V3: "fal-ai/ideogram/v3",
  MINIMAX_IMAGE: "fal-ai/minimax/image-01",
  
  // Video Generation  
  MAGI_TEXT_TO_VIDEO: "fal-ai/magi",
  MAGI_IMAGE_TO_VIDEO: "fal-ai/magi/image-to-video",
  KLING_V2_TEXT_TO_VIDEO: "fal-ai/kling-video/v2/master/text-to-video",
  KLING_V2_IMAGE_TO_VIDEO: "fal-ai/kling-video/v2/master/image-to-video",
  LTX_VIDEO_TEXT: "fal-ai/ltx-video-v097",
  LTX_VIDEO_IMAGE: "fal-ai/ltx-video-v097/image-to-video",
  LTX_VIDEO_13B_DISTILLED_IMAGE_TO_VIDEO: "fal-ai/ltx-video-13b-distilled/image-to-video",
  FRAMEPACK: "fal-ai/framepack",
  WAN_I2V: "fal-ai/wan-i2v",
  VEO2_IMAGE_TO_VIDEO: "fal-ai/veo2/image-to-video",
  
  // Audio Generation
  MUSIC_GENERATOR: "cassetteai/music-generator",
  SOUND_EFFECTS: "cassetteai/sound-effects-generator",
  ACE_STEP_AUDIO: "fal-ai/ace-step/prompt-to-audio",
  MINIMAX_TTS: "fal-ai/minimax/speech-02-hd",
  DIA_TTS: "fal-ai/dia-tts",
  
  // Image Enhancement
  UPSCALE_CREATIVE: "fal-ai/recraft/upscale/creative",
  UPSCALE_CRISP: "fal-ai/recraft/upscale/crisp",
  
  // Image Editing
  HIDREAM_E1_EDIT: "fal-ai/hidream-e1-full",
  STEP1X_EDIT: "fal-ai/step1x-edit",
  FINEGRAIN_ERASER: "fal-ai/finegrain-eraser",
  CARTOONIFY: "fal-ai/cartoonify",
}

// Helper to handle Fal.ai queue with better error handling
export async function submitToFalQueue<T>(
  modelId: string,
  inputs: Record<string, any>,
  options: {
    pollInterval?: number;
    maxAttempts?: number;
    onProgress?: (status: any) => void;
  } = {}
): Promise<FalResponse<T>> {
  const { pollInterval = 2000, maxAttempts = 180, onProgress } = options;
  
  try {
    console.log(`[Fal Queue] Submitting to model: ${modelId}`);
    
    // Submit to queue
    const submitResponse = await executeFalModel(modelId, inputs, 'queue');
    
    if (!submitResponse.success) {
      throw new Error(submitResponse.error || 'Failed to submit to Fal queue');
    }
    
    const requestId = submitResponse.requestId;
    const queueStatusUrl = submitResponse.statusUrl;
    const queueResponseUrl = submitResponse.responseUrl;
    
    if (!requestId) {
      // If no request ID, it was processed synchronously
      return submitResponse as FalResponse<T>;
    }
    
    console.log(`[Fal Queue] Request ID: ${requestId}, polling for result...`);
    console.log(`[Fal Queue] Status URL: ${queueStatusUrl}`);
    console.log(`[Fal Queue] Response URL: ${queueResponseUrl}`);
    
    // Poll for result
    let attempts = 0;
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const statusResponse = await pollFalStatus(requestId, queueStatusUrl);
      
      if (!statusResponse.success) {
        throw new Error(statusResponse.error || 'Failed to check status');
      }
      
      const { status, result } = statusResponse.data;
      
      if (onProgress) {
        onProgress({ status, attempts, requestId });
      }
      
      console.log(`[Fal Queue] Status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);
      
      if (status === 'COMPLETED') {
        // Fetch full result from response URL
        if (queueResponseUrl) {
          const falKey = Deno.env.get('FAL_KEY')!;
          const resultResp = await fetch(queueResponseUrl, {
            headers: { 'Authorization': `Key ${falKey}` },
          });
          if (resultResp.ok) {
            const fullResult = await resultResp.json();
            return { success: true, data: fullResult, requestId };
          }
        }
        if (result) {
          return {
            success: true,
            data: result,
            requestId,
          };
        } else {
          throw new Error('Job completed but no result returned');
        }
      } else if (status === 'FAILED') {
        throw new Error('Fal.ai job failed');
      }
      
      attempts++;
    }
    
    throw new Error(`Polling timeout after ${maxAttempts} attempts`);
    
  } catch (error) {
    console.error('[Fal Queue] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error in Fal queue processing',
    };
  }
}

// ============================================================
// Canonical Fal Registry (2026) + Shared Normalization Helpers
// ============================================================

export type FalMediaType = 'image' | 'video' | 'audio' | 'json' | 'utility';
export type FalUiGroup = 'generation' | 'advanced';

export interface CanonicalFalModel {
  id: string;
  name: string;
  description: string;
  category: string;
  media_type: FalMediaType;
  workflow_type: string;
  ui_group: FalUiGroup;
  supports: string[];
  defaults: Record<string, unknown>;
}

const canonicalModel = (model: CanonicalFalModel): CanonicalFalModel => model;

export const CANONICAL_FAL_MODELS: CanonicalFalModel[] = [
  // Image generation (primary)
  canonicalModel({
    id: 'fal-ai/flux/schnell',
    name: 'FLUX Schnell',
    description: 'Legacy fast image model (compatibility).',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'image_size', 'num_images'],
    defaults: { image_size: 'landscape_16_9', num_images: 1, num_inference_steps: 4 },
  }),
  canonicalModel({
    id: 'fal-ai/flux/dev',
    name: 'FLUX Dev',
    description: 'Legacy quality image model (compatibility).',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'image_size', 'num_images', 'num_inference_steps', 'guidance_scale'],
    defaults: { image_size: 'landscape_16_9', num_images: 1, num_inference_steps: 28, guidance_scale: 3.5 },
  }),
  canonicalModel({
    id: 'fal-ai/flux-pro/v1.1-ultra',
    name: 'FLUX Pro Ultra',
    description: 'Legacy pro image model (compatibility).',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'aspect_ratio'],
    defaults: { aspect_ratio: '16:9' },
  }),
  canonicalModel({
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro',
    description: 'Gemini 3 Pro image generation.',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'num_images', 'aspect_ratio', 'output_format', 'resolution', 'safety_tolerance'],
    defaults: { num_images: 1, aspect_ratio: 'auto', output_format: 'png' },
  }),
  canonicalModel({
    id: 'fal-ai/nano-banana-2',
    name: 'Nano Banana 2',
    description: 'Fast image generation and editing.',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'num_images', 'aspect_ratio', 'output_format', 'safety_tolerance'],
    defaults: { num_images: 1, aspect_ratio: 'auto', output_format: 'png' },
  }),
  canonicalModel({
    id: 'fal-ai/qwen-image-2/text-to-image',
    name: 'Qwen Image 2',
    description: 'Unified next-generation image generation.',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'num_images', 'aspect_ratio', 'output_format'],
    defaults: { num_images: 1, aspect_ratio: '16:9', output_format: 'png' },
  }),
  canonicalModel({
    id: 'fal-ai/qwen-image-2/pro/text-to-image',
    name: 'Qwen Image 2 Pro',
    description: 'Higher quality text-to-image.',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'num_images', 'aspect_ratio', 'output_format'],
    defaults: { num_images: 1, aspect_ratio: '16:9', output_format: 'png' },
  }),
  canonicalModel({
    id: 'fal-ai/qwen-image-2512',
    name: 'Qwen Image 2512',
    description: 'Improved text rendering and natural textures.',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'num_images'],
    defaults: { num_images: 1 },
  }),
  canonicalModel({
    id: 'fal-ai/seedream/v5/lite/text-to-image',
    name: 'Seedream 5 Lite',
    description: 'High quality text-to-image.',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'num_images', 'aspect_ratio'],
    defaults: { num_images: 1, aspect_ratio: 'auto' },
  }),
  canonicalModel({
    id: 'fal-ai/ideogram/v3',
    name: 'Ideogram V3',
    description: 'Typography-friendly text-to-image model.',
    category: 'image-generation',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt', 'aspect_ratio'],
    defaults: { aspect_ratio: '16:9' },
  }),

  // Image advanced / edit
  canonicalModel({
    id: 'fal-ai/nano-banana-pro/edit',
    name: 'Nano Banana Pro Edit',
    description: 'Natural-language image editing.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'image_urls', 'num_images', 'aspect_ratio', 'resolution', 'output_format'],
    defaults: { num_images: 1, aspect_ratio: 'auto', output_format: 'png' },
  }),
  canonicalModel({
    id: 'fal-ai/nano-banana-2/edit',
    name: 'Nano Banana 2 Edit',
    description: 'Fast image editing.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'image_urls', 'num_images', 'aspect_ratio', 'output_format'],
    defaults: { num_images: 1, aspect_ratio: 'auto', output_format: 'png' },
  }),
  canonicalModel({
    id: 'fal-ai/qwen-image-2/edit',
    name: 'Qwen Image 2 Edit',
    description: 'Image editing with natural-language instructions.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'image_urls', 'output_format'],
    defaults: { output_format: 'png' },
  }),
  canonicalModel({
    id: 'fal-ai/qwen-image-2/pro/edit',
    name: 'Qwen Image 2 Pro Edit',
    description: 'Precision image editing.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'image_urls', 'output_format'],
    defaults: { output_format: 'png' },
  }),
  canonicalModel({
    id: 'fal-ai/qwen-image-edit-2509',
    name: 'Qwen Image Edit 2509',
    description: 'Editing-plus workflow with multi-image support.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'image_urls'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/qwen-image-layered',
    name: 'Qwen Image Layered',
    description: 'Image decomposition into RGBA layers.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-analysis',
    ui_group: 'advanced',
    supports: ['image_url'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/qwen-image-edit-2511-multiple-angles',
    name: 'Qwen Multiple Angles 2511',
    description: 'Generate alternate camera angles from image input.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-edit',
    ui_group: 'advanced',
    supports: ['image_urls', 'horizontal_angle', 'vertical_angle', 'zoom'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/qwen-image-edit-plus-lora-gallery/multiple-angles',
    name: 'Qwen LoRA Multiple Angles',
    description: 'LoRA multi-camera angle workflow.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-edit',
    ui_group: 'advanced',
    supports: ['image_urls', 'horizontal_angle', 'vertical_angle', 'zoom'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/seedream/v5/lite/edit',
    name: 'Seedream 5 Lite Edit',
    description: 'Natural-language image editing.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'image_urls'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/seedream/v4.5/edit',
    name: 'Seedream 4.5 Edit',
    description: 'Image generation/editing hybrid.',
    category: 'image-editing',
    media_type: 'image',
    workflow_type: 'image-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'image_urls', 'aspect_ratio'],
    defaults: { aspect_ratio: 'auto' },
  }),

  // Video generation
  canonicalModel({
    id: 'fal-ai/kling-video/v3/pro/image-to-video',
    name: 'Kling 3.0 Pro I2V',
    description: 'High-fidelity image-to-video generation.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'image-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'image_url', 'duration_seconds', 'fps', 'generate_audio'],
    defaults: { duration_seconds: 5, fps: 24, generate_audio: true },
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o3/standard/text-to-video',
    name: 'Kling O3 Standard T2V',
    description: 'Omni video generation (standard).',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'text-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'duration', 'aspect_ratio', 'generate_audio'],
    defaults: { duration: '5', aspect_ratio: '16:9', generate_audio: true },
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o3/pro/text-to-video',
    name: 'Kling O3 Pro T2V',
    description: 'Omni video generation (pro).',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'text-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'duration', 'aspect_ratio', 'generate_audio'],
    defaults: { duration: '5', aspect_ratio: '16:9', generate_audio: true },
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o3/standard/image-to-video',
    name: 'Kling O3 Standard I2V',
    description: 'Image-to-video generation (standard).',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'image-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'image_url', 'duration', 'generate_audio'],
    defaults: { duration: '5', generate_audio: false },
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o3/pro/image-to-video',
    name: 'Kling O3 Pro I2V',
    description: 'Image-to-video generation (pro).',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'image-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'image_url', 'duration', 'generate_audio'],
    defaults: { duration: '5', generate_audio: true },
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    name: 'Kling 2.5 Turbo Pro I2V',
    description: 'Fast, fluid image-to-video generation.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'image-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'image_url', 'duration_seconds', 'fps'],
    defaults: { duration_seconds: 4, fps: 24 },
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o1/image-to-video',
    name: 'Kling O1 FLFV I2V',
    description: 'Start/end frame image-to-video.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'image-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'start_image_url', 'end_image_url'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/magi',
    name: 'MAGI Text to Video',
    description: 'Legacy text-to-video model (compatibility).',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'text-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'aspect_ratio', 'duration'],
    defaults: { aspect_ratio: '16:9', duration: '5s' },
  }),
  canonicalModel({
    id: 'fal-ai/magi/image-to-video',
    name: 'MAGI Image to Video',
    description: 'Legacy image-to-video model (compatibility).',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'image-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'image_url', 'aspect_ratio', 'duration'],
    defaults: { aspect_ratio: '16:9', duration: '5s' },
  }),
  canonicalModel({
    id: 'fal-ai/sora-2/text-to-video',
    name: 'Sora 2',
    description: 'Text-to-video generation with audio.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'text-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'duration_seconds'],
    defaults: { duration_seconds: 5 },
  }),
  canonicalModel({
    id: 'fal-ai/sora-2/text-to-video/pro',
    name: 'Sora 2 Pro',
    description: 'Higher-fidelity text-to-video generation.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'text-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'duration_seconds'],
    defaults: { duration_seconds: 5 },
  }),
  canonicalModel({
    id: 'fal-ai/bytedance/seedance/v1/lite/text-to-video',
    name: 'Seedance Lite T2V',
    description: 'Fast 720p text-to-video generation.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'text-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'duration_seconds'],
    defaults: { duration_seconds: 5 },
  }),
  canonicalModel({
    id: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    name: 'Seedance Lite I2V',
    description: 'Image-to-video generation (lite).',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'image-to-video',
    ui_group: 'generation',
    supports: ['image_url', 'duration_seconds'],
    defaults: { duration_seconds: 5 },
  }),
  canonicalModel({
    id: 'fal-ai/bytedance/seedance/v1/pro/text-to-video',
    name: 'Seedance Pro T2V',
    description: '1080p text-to-video generation.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'text-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'duration_seconds'],
    defaults: { duration_seconds: 5 },
  }),
  canonicalModel({
    id: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
    name: 'Seedance Pro I2V',
    description: '1080p image-to-video generation.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'image-to-video',
    ui_group: 'generation',
    supports: ['image_url', 'duration_seconds'],
    defaults: { duration_seconds: 5 },
  }),
  canonicalModel({
    id: 'fal-ai/ltx-2-19b/text-to-video',
    name: 'LTX 2 19B T2V',
    description: 'Text-to-video generation with audio.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'text-to-video',
    ui_group: 'generation',
    supports: ['prompt', 'duration_seconds'],
    defaults: { duration_seconds: 4 },
  }),
  canonicalModel({
    id: 'fal-ai/ltx-video',
    name: 'LTX Video',
    description: 'General-purpose text-to-video.',
    category: 'video-generation',
    media_type: 'video',
    workflow_type: 'text-to-video',
    ui_group: 'generation',
    supports: ['prompt'],
    defaults: {},
  }),

  // Video advanced / edit / reference
  canonicalModel({
    id: 'fal-ai/kling-video/o3/standard/reference-to-video',
    name: 'Kling O3 Standard Reference',
    description: 'Reference-guided video generation.',
    category: 'video-editing',
    media_type: 'video',
    workflow_type: 'reference-to-video',
    ui_group: 'advanced',
    supports: ['prompt', 'start_image_url', 'image_urls', 'elements'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o3/pro/reference-to-video',
    name: 'Kling O3 Pro Reference',
    description: 'Reference-guided video generation (pro).',
    category: 'video-editing',
    media_type: 'video',
    workflow_type: 'reference-to-video',
    ui_group: 'advanced',
    supports: ['prompt', 'start_image_url', 'image_urls', 'elements', 'duration', 'aspect_ratio'],
    defaults: { duration: '8', aspect_ratio: '16:9' },
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o3/standard/video-to-video/edit',
    name: 'Kling O3 Standard V2V Edit',
    description: 'Video editing with prompt guidance.',
    category: 'video-editing',
    media_type: 'video',
    workflow_type: 'video-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'video_url', 'image_urls', 'elements'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o3/pro/video-to-video/edit',
    name: 'Kling O3 Pro V2V Edit',
    description: 'Pro video editing with references and elements.',
    category: 'video-editing',
    media_type: 'video',
    workflow_type: 'video-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'video_url', 'image_urls', 'elements', 'keep_audio'],
    defaults: { keep_audio: true },
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o3/pro/video-to-video/reference',
    name: 'Kling O3 Pro V2V Reference',
    description: 'Reference-driven video-to-video generation.',
    category: 'video-editing',
    media_type: 'video',
    workflow_type: 'video-reference',
    ui_group: 'advanced',
    supports: ['prompt', 'video_url', 'image_urls', 'elements'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o1/reference-to-video',
    name: 'Kling O1 Reference I2V',
    description: 'Reference-guided image-to-video generation.',
    category: 'video-editing',
    media_type: 'video',
    workflow_type: 'reference-to-video',
    ui_group: 'advanced',
    supports: ['prompt', 'reference_image_url', 'start_image_url'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/kling-video/o1/video-to-video/edit',
    name: 'Kling O1 V2V Edit',
    description: 'Video edit workflow for Kling O1.',
    category: 'video-editing',
    media_type: 'video',
    workflow_type: 'video-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'video_url'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/sora-2/video-to-video/remix',
    name: 'Sora 2 Remix',
    description: 'Video remix from prompt + optional images.',
    category: 'video-editing',
    media_type: 'video',
    workflow_type: 'video-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'video_url', 'image_urls'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/ltx-2-19b/distilled/extend-video',
    name: 'LTX Distilled Extend Video',
    description: 'Extends an existing video with prompt guidance.',
    category: 'video-editing',
    media_type: 'video',
    workflow_type: 'video-edit',
    ui_group: 'advanced',
    supports: ['prompt', 'video_url'],
    defaults: {},
  }),

  // Lip sync / talking-head
  canonicalModel({
    id: 'veed/fabric-1.0',
    name: 'VEED Fabric 1.0',
    description: 'Talking-head generation from a portrait and speech audio.',
    category: 'video-lipsync',
    media_type: 'video',
    workflow_type: 'talking-head',
    ui_group: 'advanced',
    supports: ['image_url', 'audio_url', 'resolution'],
    defaults: { resolution: '720p' },
  }),
  canonicalModel({
    id: 'fal-ai/creatify/aurora',
    name: 'Creatify Aurora',
    description: 'Avatar-style talking-head generation with optional guidance prompt.',
    category: 'video-lipsync',
    media_type: 'video',
    workflow_type: 'talking-head',
    ui_group: 'advanced',
    supports: ['image_url', 'audio_url', 'prompt', 'resolution', 'guidance_scale', 'audio_guidance_scale'],
    defaults: { resolution: '720p', guidance_scale: 1, audio_guidance_scale: 2 },
  }),
  canonicalModel({
    id: 'fal-ai/wan/v2.2-14b/speech-to-video',
    name: 'Wan 2.2 Speech to Video',
    description: 'Speech-driven portrait animation from image and audio.',
    category: 'video-lipsync',
    media_type: 'video',
    workflow_type: 'talking-head',
    ui_group: 'advanced',
    supports: ['image_url', 'audio_url', 'prompt', 'fps', 'num_frames'],
    defaults: { fps: 16, num_frames: 81 },
  }),
  canonicalModel({
    id: 'fal-ai/ltx-2.3/audio-to-video',
    name: 'LTX-2.3 Audio to Video',
    description: 'Audio-conditioned video generation for speech-led motion.',
    category: 'video-lipsync',
    media_type: 'video',
    workflow_type: 'talking-head',
    ui_group: 'advanced',
    supports: ['audio_url', 'prompt', 'resolution', 'fps'],
    defaults: { resolution: '720p', fps: 24 },
  }),
  canonicalModel({
    id: 'fal-ai/sync-lipsync/v2',
    name: 'Sync Lipsync 2.0',
    description: 'Video lip sync using a source video and replacement audio.',
    category: 'video-lipsync',
    media_type: 'video',
    workflow_type: 'lip-sync',
    ui_group: 'advanced',
    supports: ['video_url', 'audio_url', 'model'],
    defaults: { model: 'lipsync-2' },
  }),
  canonicalModel({
    id: 'fal-ai/latentsync',
    name: 'LatentSync',
    description: 'Advanced audio-driven lip sync for existing video.',
    category: 'video-lipsync',
    media_type: 'video',
    workflow_type: 'lip-sync',
    ui_group: 'advanced',
    supports: ['video_url', 'audio_url'],
    defaults: {},
  }),

  // FFmpeg / utility endpoints (advanced)
  canonicalModel({
    id: 'fal-ai/ffmpeg-api/compose',
    name: 'FFmpeg Compose',
    description: 'Compose videos from multiple media sources.',
    category: 'video-utility',
    media_type: 'video',
    workflow_type: 'video-compose',
    ui_group: 'advanced',
    supports: ['videos', 'images', 'audio', 'timeline'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/ffmpeg-api/merge-videos',
    name: 'FFmpeg Merge Videos',
    description: 'Merge two or more videos.',
    category: 'video-utility',
    media_type: 'video',
    workflow_type: 'video-to-video',
    ui_group: 'advanced',
    supports: ['video_urls'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/ffmpeg-api/merge-audio-video',
    name: 'FFmpeg Merge Audio + Video',
    description: 'Merge audio and video tracks.',
    category: 'video-utility',
    media_type: 'video',
    workflow_type: 'video-to-video',
    ui_group: 'advanced',
    supports: ['video_urls', 'audio_urls'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/ffmpeg-api/merge-audios',
    name: 'FFmpeg Merge Audios',
    description: 'Merge multiple audio files into one.',
    category: 'audio-utility',
    media_type: 'audio',
    workflow_type: 'audio-to-audio',
    ui_group: 'advanced',
    supports: ['audio_urls'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/ffmpeg-api/extract-frame',
    name: 'FFmpeg Extract Frame',
    description: 'Extract first/middle/last frame from a video.',
    category: 'video-utility',
    media_type: 'image',
    workflow_type: 'video-to-image',
    ui_group: 'advanced',
    supports: ['video_url', 'frame_position'],
    defaults: { frame_position: 'middle' },
  }),
  canonicalModel({
    id: 'fal-ai/ffmpeg-api/metadata',
    name: 'FFmpeg Metadata',
    description: 'Read audio/video encoding metadata.',
    category: 'metadata',
    media_type: 'json',
    workflow_type: 'analysis',
    ui_group: 'advanced',
    supports: ['url'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/ffmpeg-api/loudnorm',
    name: 'FFmpeg Loudnorm',
    description: 'EBU R128 loudness normalization.',
    category: 'audio-utility',
    media_type: 'json',
    workflow_type: 'analysis',
    ui_group: 'advanced',
    supports: ['audio_url'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/ffmpeg-api/waveform',
    name: 'FFmpeg Waveform',
    description: 'Waveform extraction from audio.',
    category: 'audio-utility',
    media_type: 'json',
    workflow_type: 'analysis',
    ui_group: 'advanced',
    supports: ['audio_url'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/workflow-utilities/trim-video',
    name: 'Trim Video',
    description: 'Trim/cut video to time range.',
    category: 'video-utility',
    media_type: 'video',
    workflow_type: 'video-to-video',
    ui_group: 'advanced',
    supports: ['video_url', 'start_time', 'end_time'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/workflow-utilities/scale-video',
    name: 'Scale Video',
    description: 'Scale video to target dimensions.',
    category: 'video-utility',
    media_type: 'video',
    workflow_type: 'video-to-video',
    ui_group: 'advanced',
    supports: ['video_url', 'width', 'height'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/workflow-utilities/reverse-video',
    name: 'Reverse Video',
    description: 'Reverse a video clip.',
    category: 'video-utility',
    media_type: 'video',
    workflow_type: 'video-to-video',
    ui_group: 'advanced',
    supports: ['video_url'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/workflow-utilities/extract-nth-frame',
    name: 'Extract Nth Frame',
    description: 'Extract every Nth frame from video.',
    category: 'video-utility',
    media_type: 'image',
    workflow_type: 'video-to-image',
    ui_group: 'advanced',
    supports: ['video_url', 'nth'],
    defaults: { nth: 10 },
  }),
  canonicalModel({
    id: 'fal-ai/workflow-utilities/blend-video',
    name: 'Blend Video',
    description: 'Blend two videos together.',
    category: 'video-utility',
    media_type: 'video',
    workflow_type: 'video-to-video',
    ui_group: 'advanced',
    supports: ['video_url_a', 'video_url_b'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/workflow-utilities/interleave-video',
    name: 'Interleave Video',
    description: 'Interleave multiple videos.',
    category: 'video-utility',
    media_type: 'video',
    workflow_type: 'video-to-video',
    ui_group: 'advanced',
    supports: ['video_urls'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/workflow-utilities/audio-compressor',
    name: 'Audio Compressor',
    description: 'Compress/limit audio.',
    category: 'audio-utility',
    media_type: 'audio',
    workflow_type: 'audio-to-audio',
    ui_group: 'advanced',
    supports: ['audio_url'],
    defaults: {},
  }),
  canonicalModel({
    id: 'fal-ai/workflow-utilities/impulse-response',
    name: 'Impulse Response',
    description: 'Apply impulse response to audio.',
    category: 'audio-utility',
    media_type: 'audio',
    workflow_type: 'audio-to-audio',
    ui_group: 'advanced',
    supports: ['audio_url', 'impulse_url'],
    defaults: {},
  }),
];

const CANONICAL_MODEL_BY_ID = new Map(
  CANONICAL_FAL_MODELS.map((model) => [model.id, model])
);

const DEFAULT_MODEL_BY_MEDIA: Record<FalMediaType, string> = {
  image: 'fal-ai/nano-banana-2',
  video: 'fal-ai/kling-video/o3/standard/text-to-video',
  audio: 'fal-ai/ffmpeg-api/merge-audios',
  json: 'fal-ai/ffmpeg-api/metadata',
  utility: 'fal-ai/ffmpeg-api/metadata',
};

export const FAL_MODEL_ALIAS_MAP: Record<string, string> = {
  // Existing shortcodes / legacy mappings
  'flux-dev': 'fal-ai/flux/dev',
  'flux-schnell': 'fal-ai/flux/schnell',
  'flux-pro': 'fal-ai/flux-pro/v1.1-ultra',
  'fal-ai/flux-pro/v1.1': 'fal-ai/flux-pro/v1.1-ultra',
  'gemini-2.5-flash-image-preview': 'fal-ai/nano-banana-2',
  'google/gemini-2.5-flash-image-preview': 'fal-ai/nano-banana-2',
  'gemini-2.5-flash-image': 'fal-ai/nano-banana-2',
  'google/gemini-2.5-flash-image': 'fal-ai/nano-banana-2',
  'gemini-2.5-flash-video': 'fal-ai/kling-video/o3/standard/text-to-video',
  'google/gemini-2.5-flash-video': 'fal-ai/kling-video/o3/standard/text-to-video',
  'veo3-fast': 'fal-ai/kling-video/o3/standard/text-to-video',
  'kling-2-1': 'fal-ai/kling-video/o3/standard/text-to-video',
  'kling-pro-16': 'fal-ai/kling-video/o3/pro/text-to-video',
  'luma-ray': 'fal-ai/kling-video/v3/pro/image-to-video',
  'luma-ray-flash': 'fal-ai/kling-video/v3/pro/image-to-video',
  'luma-dream': 'fal-ai/kling-video/v3/pro/image-to-video',
  'minimax-video-01': 'fal-ai/kling-video/o3/pro/image-to-video',
  hailuo: 'fal-ai/kling-video/o3/pro/image-to-video',
  'fal-ai/magi': 'fal-ai/magi',
  'fal-ai/magi-1': 'fal-ai/magi',
  // Keep old aliases mapped to closest maintained endpoint
  'fal-ai/kling-video/v1/standard/text-to-video': 'fal-ai/kling-video/o3/standard/text-to-video',
  'fal-ai/kling-video/v1.6/pro/text-to-video': 'fal-ai/kling-video/o3/pro/text-to-video',
  'fal-ai/kling-video/v1.5/pro/text-to-video': 'fal-ai/kling-video/o3/pro/text-to-video',
};

function maybeParseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('settings_override must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  }
  throw new Error('settings_override must be a JSON object');
}

function normalizeLegacyFalInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...inputs };
  if (normalized.aspectRatio && !normalized.aspect_ratio) {
    normalized.aspect_ratio = normalized.aspectRatio;
  }
  if (normalized.imageSize && !normalized.image_size) {
    normalized.image_size = normalized.imageSize;
  }
  if (normalized.numImages && !normalized.num_images) {
    normalized.num_images = normalized.numImages;
  }
  if (normalized.durationSeconds && !normalized.duration_seconds) {
    normalized.duration_seconds = normalized.durationSeconds;
  }
  if (normalized.generateAudio !== undefined && normalized.generate_audio === undefined) {
    normalized.generate_audio = normalized.generateAudio;
  }
  if (normalized.styleReferenceUrl && normalized.image_urls === undefined) {
    normalized.image_urls = [normalized.styleReferenceUrl];
  }
  return normalized;
}

export function normalizeFalModelId(modelId: string): string {
  if (!modelId) return modelId;
  return FAL_MODEL_ALIAS_MAP[modelId] || modelId;
}

export function getCanonicalFalModel(modelId: string): CanonicalFalModel | undefined {
  const normalized = normalizeFalModelId(modelId);
  return CANONICAL_MODEL_BY_ID.get(normalized);
}

export function inferFalMediaType(modelId: string): FalMediaType {
  const normalized = normalizeFalModelId(modelId);
  const direct = CANONICAL_MODEL_BY_ID.get(normalized);
  if (direct) return direct.media_type;

  const lower = normalized.toLowerCase();
  if (lower.includes('audio') || lower.includes('speech') || lower.includes('tts')) return 'audio';
  if (lower.includes('video') || lower.includes('kling') || lower.includes('sora') || lower.includes('seedance') || lower.includes('ltx')) return 'video';
  if (lower.includes('metadata') || lower.includes('waveform') || lower.includes('loudnorm')) return 'json';
  return 'image';
}

export function getDefaultFalModelForMedia(
  mediaType: FalMediaType,
  uiGroup: FalUiGroup = 'generation'
): CanonicalFalModel {
  const inGroup = CANONICAL_FAL_MODELS.find(
    (model) => model.media_type === mediaType && model.ui_group === uiGroup
  );
  if (inGroup) return inGroup;

  const fallbackId = DEFAULT_MODEL_BY_MEDIA[mediaType];
  const fallback = CANONICAL_MODEL_BY_ID.get(fallbackId);
  if (fallback) return fallback;

  // Absolute fallback
  return CANONICAL_FAL_MODELS[0];
}

export function resolveFalModelOrFallback(
  requestedModelId: string,
  options?: { mediaTypeHint?: FalMediaType; uiGroup?: FalUiGroup }
): {
  model: CanonicalFalModel;
  requestedModelId: string;
  normalizedModelId: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
} {
  const normalizedModelId = normalizeFalModelId(requestedModelId);
  const directModel = CANONICAL_MODEL_BY_ID.get(normalizedModelId);
  if (directModel) {
    return {
      model: directModel,
      requestedModelId,
      normalizedModelId,
      fallbackUsed: requestedModelId !== normalizedModelId,
      fallbackReason:
        requestedModelId !== normalizedModelId ? `alias:${requestedModelId}` : undefined,
    };
  }

  const mediaType = options?.mediaTypeHint || inferFalMediaType(requestedModelId);
  const fallbackModel = getDefaultFalModelForMedia(mediaType, options?.uiGroup || 'generation');
  return {
    model: fallbackModel,
    requestedModelId,
    normalizedModelId: fallbackModel.id,
    fallbackUsed: true,
    fallbackReason: `unknown_model:${requestedModelId}`,
  };
}

export function mergeFalModelInputs(
  modelId: string,
  rawInputs: Record<string, unknown>
): { modelId: string; inputs: Record<string, unknown> } {
  const resolved = resolveFalModelOrFallback(modelId);
  const normalizedInputs = normalizeLegacyFalInputs(rawInputs || {});

  const settings = maybeParseJsonObject(normalizedInputs.settings);
  const settingsOverride = maybeParseJsonObject(normalizedInputs.settings_override);

  const baseInputs = { ...normalizedInputs };
  delete baseInputs.settings;
  delete baseInputs.settings_override;

  return {
    modelId: resolved.model.id,
    inputs: {
      ...resolved.model.defaults,
      ...baseInputs,
      ...settings,
      ...settingsOverride,
    },
  };
}
