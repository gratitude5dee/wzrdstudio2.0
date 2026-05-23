/**
 * Unified Generation Service
 *
 * Provides a consistent interface for all AI generation across the application.
 * Routes to the correct backend (fal.ai via fal-stream, Gemini, Groq, ElevenLabs)
 * based on model selection, handles queue submission & polling uniformly,
 * stores generated assets to Supabase Storage automatically,
 * and returns results in a standard format { url, metadata, status }.
 *
 * Existing flows wired through this service:
 * - Project-setup: concept images, storyline text, breakdown, timeline shots, Director's Cut
 * - Studio: node processing (Text, Image, Video, Audio)
 * - Editor: AI generation panel
 */

import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/integrations/supabase/config';
import {
  getDefaultImageToVideoModel,
  getDefaultVideoModel,
  getDefaultVideoReferenceModel,
  getModelById,
  getModelsByTypeAndGroup,
  type StudioModel,
  type StudioModelMediaType,
} from '@/lib/studio-model-constants';
import { buildCanonicalFalInputs, normalizeFalModelId } from '@/lib/falModelNormalization';
import {
  extractInsufficientCreditsError,
  extractInsufficientCreditsFromResponse,
  routeToBillingTopUp,
} from '@/lib/billing-errors';
import { extractGmiMedia, translateGmiQueuePayload } from '@/lib/gmiCloud';

// ─── Standard Input Schema ──────────────────────────────────────────────────

export interface GenerationInput {
  /** Model ID from the studio-model-constants catalog or a provider-specific ID */
  model: string;
  /** Primary prompt / instruction text */
  prompt: string;
  /** Additional generation parameters (model-specific) */
  parameters?: Record<string, unknown>;
  /** Reference assets (input images, videos, audio for conditioning) */
  referenceAssets?: ReferenceAsset[];
  /** Output configuration */
  outputConfig?: OutputConfig;
  /** Metadata for tracking / context */
  metadata?: GenerationMetadata;
}

export interface ReferenceAsset {
  /** URL of the reference asset */
  url: string;
  /** Type of the reference asset */
  type: 'image' | 'video' | 'audio' | 'text' | 'model';
  /** Role of this asset in generation (e.g., 'input_image', 'style_reference') */
  role?: string;
}

export interface OutputConfig {
  /** Desired output format (e.g., 'png', 'mp4', 'mp3') */
  format?: string;
  /** Number of outputs to generate */
  count?: number;
  /** Where to store the result */
  storageBucket?: string;
  /** Storage path prefix */
  storagePathPrefix?: string;
  /** Whether to automatically store in Supabase Storage */
  autoStore?: boolean;
}

export interface GenerationMetadata {
  /** Source context */
  source?: 'project-setup' | 'studio' | 'editor' | 'storyboard' | 'timeline';
  /** Associated project ID */
  projectId?: string;
  /** Associated node / shot / clip ID */
  entityId?: string;
  /** Custom key-value metadata */
  custom?: Record<string, unknown>;
}

// ─── Standard Result Schema ─────────────────────────────────────────────────

export type GenerationStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface GenerationResult {
  /** URL of the generated asset (may be temporary fal.ai URL or Supabase Storage URL) */
  url: string;
  /** Generation metadata */
  metadata: GenerationResultMetadata;
  /** Current status */
  status: GenerationStatus;
}

export interface GenerationResultMetadata {
  /** Unique generation ID */
  generationId: string;
  /** The model that was actually used (may differ from requested due to fallback) */
  resolvedModel: string;
  /** The model that was originally requested */
  requestedModel: string;
  /** Whether a fallback model was used */
  fallbackUsed: boolean;
  /** Reason for fallback, if applicable */
  fallbackReason?: string;
  /** Media type of the output */
  mediaType: StudioModelMediaType | 'unknown';
  /** Credits consumed */
  credits?: number;
  /** Duration in seconds (for video/audio) */
  durationSeconds?: number;
  /** Raw provider response (for debugging / extraction) */
  raw?: unknown;
  /** Supabase Storage URL if stored */
  storageUrl?: string;
  /** Width (for images/video) */
  width?: number;
  /** Height (for images/video) */
  height?: number;
}

// ─── Progress Callback ──────────────────────────────────────────────────────

export interface GenerationProgress {
  /** Progress percentage (0-100) */
  percent: number;
  /** Human-readable status message */
  message?: string;
  /** Provider-specific status (e.g., 'IN_QUEUE', 'IN_PROGRESS') */
  providerStatus?: string;
}

export type OnProgress = (progress: GenerationProgress) => void;

// ─── Error Types ────────────────────────────────────────────────────────────

export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

export class InsufficientCreditsError extends GenerationError {
  constructor(
    public readonly required: number,
    public readonly available: number
  ) {
    super(
      `Insufficient credits. Required ${Math.ceil(required)} / available ${Math.ceil(available)}.`,
      'insufficient_credits'
    );
    this.name = 'InsufficientCreditsError';
  }
}

// ─── Internal Route Types ───────────────────────────────────────────────────

type GenerationRoute =
  | 'fal-stream'
  | 'falai-execute'
  | 'gmi-cloud'
  | 'gemini-text'
  | 'groq-text'
  | 'elevenlabs-tts'
  | 'elevenlabs-sfx'
  | 'elevenlabs-music'
  | 'edge-function';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

function determineMediaType(model: StudioModel | undefined, modelId: string): StudioModelMediaType | 'unknown' {
  if (model) return model.mediaType;

  // Infer from model ID patterns
  const id = modelId.toLowerCase();
  if (id.includes('image') || id.includes('flux') || id.includes('ideogram') || id.includes('seedream') || id.includes('banana') || id.includes('qwen-image')) return 'image';
  if (id.includes('video') || id.includes('kling') || id.includes('sora') || id.includes('magi') || id.includes('seedance') || id.includes('ltx')) return 'video';
  if (id.includes('audio') || id.includes('tts') || id.includes('speech') || id.includes('music') || id.includes('sfx') || id.includes('ffmpeg-api/merge-audio') || id.includes('ffmpeg-api/loudnorm') || id.includes('ffmpeg-api/waveform') || id.includes('audio-compressor') || id.includes('impulse-response')) return 'audio';
  if (id.includes('gemini') || id.includes('gpt') || id.includes('llama') || id.includes('groq')) return 'text';

  return 'unknown';
}

function determineRoute(model: StudioModel | undefined, modelId: string, input: GenerationInput): GenerationRoute {
  // Check for ElevenLabs audio models (handled by edge functions)
  if (modelId === 'elevenlabs-tts' || modelId === 'elevenlabs-music' || modelId === 'elevenlabs-sfx') {
    return modelId as GenerationRoute;
  }

  // Check for GMI Cloud models
  if (model?.provider === 'gmi-cloud' || modelId.startsWith('gmi/')) {
    return 'gmi-cloud';
  }

  // Check for Groq models
  if (modelId.startsWith('groq/') || modelId.startsWith('llama-')) {
    return 'groq-text';
  }

  // Check for Gemini/GPT text models (use gemini-text-generation edge function)
  if (model?.provider === 'lovable-ai' && model?.mediaType === 'text') {
    return 'gemini-text';
  }
  if (modelId.startsWith('google/gemini') || modelId.startsWith('openai/gpt')) {
    return 'gemini-text';
  }

  // Custom edge function route
  if (input.parameters?._edgeFunction && typeof input.parameters._edgeFunction === 'string') {
    return 'edge-function';
  }

  // Default: fal.ai streaming endpoint
  return 'fal-stream';
}

function resolveFalVideoModelForReferences(
  modelId: string,
  model: StudioModel | undefined,
  input: GenerationInput
): {
  modelId: string;
  model: StudioModel | undefined;
  fallbackUsed: boolean;
  fallbackReason?: string;
} {
  const mediaType = determineMediaType(model, modelId);
  const isFal = model?.provider === 'fal-ai' || modelId.startsWith('fal-ai/');
  if (!isFal || mediaType !== 'video') {
    return { modelId, model, fallbackUsed: false };
  }

  const referenceImages = input.referenceAssets?.filter((asset) => asset.type === 'image') ?? [];
  const referenceVideos = input.referenceAssets?.filter((asset) => asset.type === 'video') ?? [];
  const hasImageReferences = referenceImages.length > 0;
  const hasVideoReferences = referenceVideos.length > 0;

  const isCompatible =
    hasVideoReferences
      ? ['reference-to-video', 'video-reference', 'video-edit'].includes(model?.workflowType ?? '')
      : hasImageReferences
        ? ['image-to-video', 'reference-to-video'].includes(model?.workflowType ?? '')
        : (model?.workflowType ?? '') === 'text-to-video';

  if (isCompatible) {
    return { modelId, model, fallbackUsed: false };
  }

  const fallbackModelId = hasVideoReferences
    ? getDefaultVideoReferenceModel()
    : hasImageReferences
      ? getDefaultImageToVideoModel()
      : getDefaultVideoModel();
  const fallbackModel = getModelById(fallbackModelId);

  if (!fallbackModel) {
    return { modelId, model, fallbackUsed: false };
  }

  return {
    modelId: fallbackModelId,
    model: fallbackModel,
    fallbackUsed: true,
    fallbackReason:
      `${hasImageReferences || hasVideoReferences ? 'incompatible_with_reference_input' : 'incompatible_with_text_only'}:` +
      `${model?.workflowType ?? `unknown_model:${modelId}`}->default:${fallbackModelId}`,
  };
}

function extractImageUrl(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;

  // images[0].url
  if (Array.isArray(r.images) && r.images.length > 0) {
    const first = r.images[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && 'url' in first && typeof (first as Record<string, unknown>).url === 'string') {
      return (first as Record<string, unknown>).url as string;
    }
  }

  // image.url
  if (r.image && typeof r.image === 'object' && 'url' in r.image) {
    return (r.image as Record<string, unknown>).url as string;
  }

  // data.images[0].url
  if (r.data && typeof r.data === 'object') {
    const d = r.data as Record<string, unknown>;
    if (Array.isArray(d.images) && d.images.length > 0) {
      const first = d.images[0];
      if (first && typeof first === 'object' && 'url' in first) {
        return (first as Record<string, unknown>).url as string;
      }
    }
  }

  // url
  if (typeof r.url === 'string') return r.url;

  return undefined;
}

function extractVideoUrl(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;

  // video.url
  if (r.video && typeof r.video === 'object' && 'url' in r.video) {
    return (r.video as Record<string, unknown>).url as string;
  }

  // videos[0].url
  if (Array.isArray(r.videos) && r.videos.length > 0) {
    const first = r.videos[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && 'url' in first) {
      return (first as Record<string, unknown>).url as string;
    }
  }

  // data.video.url
  if (r.data && typeof r.data === 'object') {
    const d = r.data as Record<string, unknown>;
    if (d.video && typeof d.video === 'object' && 'url' in d.video) {
      return (d.video as Record<string, unknown>).url as string;
    }
  }

  // url
  if (typeof r.url === 'string') return r.url;

  return undefined;
}

function extractAudioUrl(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;

  // audio.url or audio_url
  if (r.audio && typeof r.audio === 'object' && 'url' in r.audio) {
    return (r.audio as Record<string, unknown>).url as string;
  }
  if (typeof r.audio_url === 'string') return r.audio_url;

  // url
  if (typeof r.url === 'string') return r.url;

  return undefined;
}

function extractResultUrl(result: unknown, mediaType: StudioModelMediaType | 'unknown'): string | undefined {
  switch (mediaType) {
    case 'image':
      return extractImageUrl(result);
    case 'video':
      return extractVideoUrl(result);
    case 'audio':
      return extractAudioUrl(result);
    case 'text':
      return undefined; // Text results don't have URLs
    default:
      return extractImageUrl(result) ?? extractVideoUrl(result) ?? extractAudioUrl(result);
  }
}

function extractDimensions(result: unknown): { width?: number; height?: number } {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;

  // images[0].width/height
  if (Array.isArray(r.images) && r.images.length > 0) {
    const first = r.images[0] as Record<string, unknown> | undefined;
    if (first) {
      return {
        width: typeof first.width === 'number' ? first.width : undefined,
        height: typeof first.height === 'number' ? first.height : undefined,
      };
    }
  }

  return {};
}

// ─── Core Execution Functions ───────────────────────────────────────────────

async function executeFalStream(
  modelId: string,
  inputs: Record<string, unknown>,
  onProgress?: OnProgress
): Promise<{ result: unknown; resolvedModelId: string; fallbackUsed: boolean; fallbackReason?: string }> {
  const token = await getAuthToken();
  const canonical = buildCanonicalFalInputs(modelId, inputs);

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/fal-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      modelId: canonical.modelId,
      inputs: canonical.inputs,
    }),
  });

  if (!response.ok) {
    const insufficient = await extractInsufficientCreditsFromResponse(response);
    if (insufficient) {
      routeToBillingTopUp(insufficient);
      throw new InsufficientCreditsError(insufficient.required, insufficient.available);
    }
    const errorText = await response.text();
    throw new GenerationError(
      errorText || `Generation failed (HTTP ${response.status})`,
      'stream_error'
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new GenerationError('No response body from generation stream', 'no_body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let resolvedModelId = canonical.modelId;
  let fallbackUsed = false;
  let fallbackReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const payload = line.slice(6).trim();
      if (!payload) continue;

      try {
        const parsed = JSON.parse(payload);

        if (parsed.type === 'meta') {
          resolvedModelId = typeof parsed.resolved_model === 'string'
            ? parsed.resolved_model
            : resolvedModelId;
          fallbackUsed = Boolean(parsed.fallback_used);
          fallbackReason = typeof parsed.fallback_reason === 'string'
            ? parsed.fallback_reason
            : fallbackReason;
        }

        if (parsed.type === 'fallback') {
          fallbackUsed = true;
          fallbackReason = typeof parsed.reason === 'string' ? parsed.reason : fallbackReason;
          resolvedModelId = typeof parsed.fallback_model === 'string'
            ? parsed.fallback_model
            : resolvedModelId;
        }

        if (parsed.type === 'progress') {
          const percent = Math.max(5, Math.round((parsed.event?.progress ?? 0.1) * 100));
          const providerStatus = parsed.event?.status;
          onProgress?.({
            percent,
            message: providerStatus === 'IN_QUEUE' ? 'Queued...' : 'Generating...',
            providerStatus,
          });
        }

        if (parsed.type === 'done') {
          onProgress?.({ percent: 100, message: 'Complete' });
          return {
            result: parsed.result,
            resolvedModelId: typeof parsed.model === 'string' ? parsed.model : resolvedModelId,
            fallbackUsed: typeof parsed.fallback_used === 'boolean' ? parsed.fallback_used : fallbackUsed,
            fallbackReason: typeof parsed.fallback_reason === 'string' ? parsed.fallback_reason : fallbackReason,
          };
        }

        if (parsed.type === 'error') {
          throw new GenerationError(
            parsed.error || 'Generation failed',
            'provider_error',
            parsed
          );
        }
      } catch (e) {
        if (e instanceof GenerationError) throw e;
        // Ignore parse errors for partial data
      }
    }
  }

  throw new GenerationError('Generation finished without a result', 'no_result');
}

async function executeGeminiText(
  modelId: string,
  prompt: string,
  onProgress?: OnProgress
): Promise<string> {
  const token = await getAuthToken();

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/gemini-text-generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt, model: modelId, stream: true }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new GenerationError(message || 'Text generation failed', 'text_error');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new GenerationError('No text stream returned', 'no_body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim();
        if (payload !== '[DONE]') {
          try {
            const parsed = JSON.parse(payload);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (typeof chunk === 'string' && chunk.length > 0) {
              output += chunk;
              onProgress?.({
                percent: Math.min(92, 10 + output.length / 16),
                message: 'Generating text...',
              });
            }
          } catch {
            // Ignore partial chunks
          }
        }
      }

      newlineIndex = buffer.indexOf('\n');
    }
  }

  onProgress?.({ percent: 100, message: 'Complete' });
  return output;
}

async function executeGroqText(
  modelId: string,
  prompt: string,
  onProgress?: OnProgress
): Promise<string> {
  onProgress?.({ percent: 10, message: 'Generating text...' });

  const cleanModelId = modelId.replace(/^groq\//, '');
  const { data, error } = await supabase.functions.invoke('groq-chat', {
    body: {
      prompt,
      model: cleanModelId,
      temperature: 0.7,
      maxTokens: 1024,
    },
  });

  if (error) {
    throw new GenerationError(error.message || 'Text generation failed', 'groq_error');
  }

  onProgress?.({ percent: 100, message: 'Complete' });

  // Extract text from Groq response
  if (typeof data === 'string') return data;
  if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
  if (data?.text) return data.text;
  if (data?.content) return data.content;

  return JSON.stringify(data);
}

async function executeElevenLabs(
  functionName: string,
  body: Record<string, unknown>,
  onProgress?: OnProgress
): Promise<string> {
  const token = await getAuthToken();
  onProgress?.({ percent: 10, message: 'Generating audio...' });

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new GenerationError(errorText || 'Audio generation failed', 'audio_error');
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);

  onProgress?.({ percent: 100, message: 'Complete' });
  return audioUrl;
}

async function executeEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
  onProgress?: OnProgress
): Promise<unknown> {
  onProgress?.({ percent: 10, message: 'Processing...' });

  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    throw new GenerationError(
      error.message || 'Edge function call failed',
      'edge_function_error'
    );
  }

  onProgress?.({ percent: 100, message: 'Complete' });
  return data;
}

// ─── GMI Cloud Execution ────────────────────────────────────────────────────

async function executeGmiCloud(
  modelId: string,
  input: GenerationInput,
  mediaType: StudioModelMediaType | 'unknown',
  onProgress?: OnProgress
): Promise<{
  url?: string;
  text?: string;
  raw: unknown;
  resolvedModelId: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}> {
  onProgress?.({ percent: 5, message: 'Connecting to GMI Cloud...' });

  const isText = mediaType === 'text';

  if (isText) {
    // Synchronous text generation via gmi-execute
    const { data, error } = await supabase.functions.invoke('gmi-execute', {
      body: {
        modelId,
        inputs: {
          prompt: input.prompt,
          max_tokens: (input.parameters?.max_tokens as number) ?? 2000,
          temperature: (input.parameters?.temperature as number) ?? 0.7,
        },
        action: 'submit',
        metadata: { source: input.metadata?.source, projectId: input.metadata?.projectId },
      },
    });

    if (error) {
      const insufficient = await extractInsufficientCreditsError(error);
      if (insufficient) {
        routeToBillingTopUp(insufficient);
        throw new InsufficientCreditsError(insufficient.required, insufficient.available);
      }
      throw new GenerationError(error.message || 'GMI text generation failed', 'gmi_error');
    }
    onProgress?.({ percent: 100, message: 'Complete' });

    const text = data?.data?.choices?.[0]?.message?.content ?? '';
    return {
      text,
      raw: data,
      resolvedModelId: modelId,
      fallbackUsed: false,
    };
  }

  // Queue-based image/video generation
  onProgress?.({ percent: 10, message: 'Submitting to GMI Cloud...' });

  const referenceImages = input.referenceAssets?.filter((asset) => asset.type === 'image') ?? [];
  const referenceVideos = input.referenceAssets?.filter((asset) => asset.type === 'video') ?? [];

  function getModelFamilyKey(value: string): string {
    const suffixes = ['/reference-to-video', '/image-to-video', '/text-to-video', '-r2v', '-i2v', '-t2v'];
    for (const suffix of suffixes) {
      if (value.endsWith(suffix)) {
        return value.slice(0, -suffix.length);
      }
    }
    return value;
  }

  function resolveGmiVideoModel(): {
    resolvedModelId: string;
    fallbackUsed: boolean;
    fallbackReason?: string;
  } {
    if (mediaType !== 'video') {
      return { resolvedModelId: modelId, fallbackUsed: false };
    }

    const requestedModel = getModelById(modelId);
    const hasImageReferences = referenceImages.length > 0;
    const hasVideoReferences = referenceVideos.length > 0;
    const compatibleModels = getModelsByTypeAndGroup('video', 'generation').filter(
      (model) => {
        if (model.provider !== 'gmi-cloud') {
          return false;
        }
        if (hasVideoReferences) {
          return model.workflowType === 'reference-to-video';
        }
        if (hasImageReferences) {
          return model.workflowType === 'image-to-video' || model.workflowType === 'reference-to-video';
        }
        return model.workflowType === 'text-to-video';
      }
    );

    const preferredDefaultModelId = hasVideoReferences
      ? 'gmi/wan2.7-r2v'
      : hasImageReferences
        ? 'gmi/ltx-fast-i2v'
        : 'gmi/kling-v3-omni';
    const defaultCompatibleModel =
      compatibleModels.find((model) => model.id === preferredDefaultModelId) ?? compatibleModels[0];

    if (!defaultCompatibleModel) {
      return { resolvedModelId: modelId, fallbackUsed: false };
    }

    const requestedIsCompatible =
      requestedModel?.provider === 'gmi-cloud' &&
      compatibleModels.some((model) => model.id === requestedModel.id);

    if (requestedIsCompatible) {
      return { resolvedModelId: requestedModel.id, fallbackUsed: false };
    }

    if (requestedModel?.provider === 'gmi-cloud') {
      const sameFamilyCompatibleModel = compatibleModels.find(
        (model) =>
          model.id !== requestedModel.id &&
          getModelFamilyKey(model.id) === getModelFamilyKey(requestedModel.id),
      );
      if (sameFamilyCompatibleModel) {
        return {
          resolvedModelId: sameFamilyCompatibleModel.id,
          fallbackUsed: true,
          fallbackReason:
            (hasImageReferences || hasVideoReferences
              ? `incompatible_with_reference_input:${requestedModel.workflowType}`
              : `incompatible_with_text_only:${requestedModel.workflowType}`) +
            `->same_family:${sameFamilyCompatibleModel.id}`,
        };
      }
    }

    const requestedDescriptor = requestedModel
      ? requestedModel.provider === 'gmi-cloud'
        ? requestedModel.workflowType
        : `provider:${requestedModel.provider}`
      : `unknown_model:${modelId}`;

    return {
      resolvedModelId: defaultCompatibleModel.id,
      fallbackUsed: true,
      fallbackReason:
        `${hasImageReferences || hasVideoReferences ? 'incompatible_with_reference_input' : 'incompatible_with_text_only'}:` +
        `${requestedDescriptor}->default:${defaultCompatibleModel.id}`,
    };
  }

  const resolvedExecutionModel = resolveGmiVideoModel();
  const resolvedModelId = resolvedExecutionModel.resolvedModelId;

  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    ...input.parameters,
  };

  if (referenceImages.length > 0) {
    payload.image = referenceImages.length === 1
      ? referenceImages[0].url
      : referenceImages.map((asset) => asset.url);
  }
  if (referenceVideos.length > 0) {
    payload.video = referenceVideos.length === 1
      ? referenceVideos[0].url
      : referenceVideos.map((asset) => asset.url);
  }

  const translatedPayload = translateGmiQueuePayload(resolvedModelId, payload);

  const { data: submitData, error: submitError } = await supabase.functions.invoke('gmi-execute', {
    body: {
      modelId: resolvedModelId,
      inputs: translatedPayload,
      action: 'submit',
      metadata: { source: input.metadata?.source, projectId: input.metadata?.projectId },
    },
  });

  if (submitError) {
    const insufficient = await extractInsufficientCreditsError(submitError);
    if (insufficient) {
      routeToBillingTopUp(insufficient);
      throw new InsufficientCreditsError(insufficient.required, insufficient.available);
    }
    throw new GenerationError(submitError.message || 'GMI submission failed', 'gmi_error');
  }

  const requestId = submitData?.requestId;
  if (!requestId) throw new GenerationError('No request ID from GMI Cloud', 'gmi_error');

  // Poll for completion
  const MAX_POLLS = 120;
  const POLL_INTERVAL = 3000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const { data: pollData, error: pollError } = await supabase.functions.invoke('gmi-execute', {
      body: { modelId: resolvedModelId, action: 'poll', requestId },
    });

    if (pollError) {
      console.warn('[GMI] Poll error:', pollError.message);
      continue;
    }

    const status = pollData?.status ?? pollData?.data?.status;
    const percent = Math.min(90, 15 + (i / MAX_POLLS) * 75);
    onProgress?.({ percent, message: `Processing (${status ?? 'waiting'})...`, providerStatus: status });

    if (status === 'success') {
      onProgress?.({ percent: 100, message: 'Complete' });
      const media = extractGmiMedia(pollData?.data, mediaType as 'image' | 'video' | 'unknown');
      return {
        url: media.primaryUrl,
        raw: pollData,
        resolvedModelId,
        fallbackUsed: resolvedExecutionModel.fallbackUsed,
        fallbackReason: resolvedExecutionModel.fallbackReason,
      };
    }

    if (status === 'failed' || status === 'cancelled') {
      throw new GenerationError(`GMI generation ${status}`, 'gmi_error', pollData);
    }
  }

  throw new GenerationError('GMI generation timed out', 'gmi_timeout');
}

// ─── Asset Storage ──────────────────────────────────────────────────────────

async function storeAssetToSupabase(
  url: string,
  mediaType: StudioModelMediaType | 'unknown',
  projectId?: string,
  bucket?: string,
  pathPrefix?: string
): Promise<string | null> {
  if (!projectId) return null;
  if (url.startsWith('blob:') || url.startsWith('data:')) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    const contentType = blob.type || 'application/octet-stream';
    const ext = inferExtension(contentType, mediaType);
    const storageBucket = bucket ?? (mediaType === 'audio' ? 'audio' : 'project-assets');
    const prefix = pathPrefix ?? projectId;
    const fileName = `${prefix}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(storageBucket)
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });

    if (uploadError) {
      console.warn('[UnifiedGen] Asset storage failed:', uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(storageBucket)
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (e) {
    console.warn('[UnifiedGen] Asset storage failed:', e);
    return null;
  }
}

function inferExtension(contentType: string, mediaType: StudioModelMediaType | 'unknown'): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('webm')) return 'webm';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('ogg')) return 'ogg';

  switch (mediaType) {
    case 'image': return 'png';
    case 'video': return 'mp4';
    case 'audio': return 'mp3';
    default: return 'bin';
  }
}

// ─── Build Inputs Helpers ───────────────────────────────────────────────────

function buildFalInputs(input: GenerationInput, model: StudioModel | undefined): Record<string, unknown> {
  const inputs: Record<string, unknown> = {
    prompt: input.prompt,
    ...input.parameters,
  };

  // Map reference assets to model-specific input fields
  if (input.referenceAssets?.length) {
    const imageAssets = input.referenceAssets.filter(a => a.type === 'image');
    const videoAssets = input.referenceAssets.filter(a => a.type === 'video');

    if (imageAssets.length === 1) {
      inputs.image_url = imageAssets[0].url;
    }
    if (imageAssets.length > 0) {
      inputs.image_urls = imageAssets.map(a => a.url);
    }
    if (videoAssets.length > 0) {
      inputs.video_url = videoAssets[0].url;
    }
  }

  // Apply format from outputConfig
  if (input.outputConfig?.format) {
    inputs.output_format = input.outputConfig.format;
  }
  if (input.outputConfig?.count) {
    inputs.num_images = input.outputConfig.count;
  }

  return inputs;
}

function buildElevenLabsBody(input: GenerationInput): { functionName: string; body: Record<string, unknown> } {
  const params = input.parameters ?? {};

  if (input.model === 'elevenlabs-tts') {
    return {
      functionName: 'elevenlabs-tts',
      body: {
        text: input.prompt,
        voiceId: (params.voiceId as string) ?? 'JBFqnCBsd6RMkjVDRZzb',
      },
    };
  }

  if (input.model === 'elevenlabs-music') {
    return {
      functionName: 'elevenlabs-music',
      body: {
        prompt: input.prompt,
        duration: (params.duration as number) ?? 30,
      },
    };
  }

  // Default: SFX
  return {
    functionName: 'elevenlabs-sfx',
    body: {
      prompt: input.prompt,
      duration: (params.duration as number) ?? 5,
    },
  };
}

// ─── Main Service ───────────────────────────────────────────────────────────

export const unifiedGenerationService = {
  /**
   * Generate content using the unified interface.
   *
   * Routes to the correct provider based on model selection, handles
   * queue/polling uniformly, optionally stores assets to Supabase Storage,
   * and returns results in a standard format.
   */
  async generate(
    input: GenerationInput,
    onProgress?: OnProgress
  ): Promise<GenerationResult> {
    const generationId = crypto.randomUUID();
    let normalizedModelId = normalizeFalModelId(input.model);
    let model = getModelById(normalizedModelId);
    let mediaType = determineMediaType(model, normalizedModelId);
    const falVideoModel = resolveFalVideoModelForReferences(normalizedModelId, model, input);
    if (falVideoModel.modelId !== normalizedModelId) {
      normalizedModelId = falVideoModel.modelId;
      model = falVideoModel.model;
      mediaType = determineMediaType(model, normalizedModelId);
    }
    const route = determineRoute(model, normalizedModelId, input);

    const baseMetadata: GenerationResultMetadata = {
      generationId,
      requestedModel: input.model,
      resolvedModel: normalizedModelId,
      fallbackUsed: input.model !== normalizedModelId || falVideoModel.fallbackUsed,
      fallbackReason: falVideoModel.fallbackReason ?? (input.model !== normalizedModelId ? 'model_alias_resolved' : undefined),
      mediaType,
      credits: model?.credits,
    };

    try {
      onProgress?.({ percent: 0, message: 'Starting generation...' });

      switch (route) {
        case 'fal-stream': {
          const falInputs = buildFalInputs(input, model);
          const streamResult = await executeFalStream(normalizedModelId, falInputs, onProgress);

          const url = extractResultUrl(streamResult.result, mediaType) ?? '';
          const dimensions = extractDimensions(streamResult.result);

          let storageUrl: string | null = null;
          if (input.outputConfig?.autoStore !== false && url && input.metadata?.projectId) {
            storageUrl = await storeAssetToSupabase(
              url,
              mediaType,
              input.metadata.projectId,
              input.outputConfig?.storageBucket,
              input.outputConfig?.storagePathPrefix
            );
          }

          return {
            url: storageUrl ?? url,
            metadata: {
              ...baseMetadata,
              resolvedModel: streamResult.resolvedModelId,
              fallbackUsed: streamResult.fallbackUsed,
              fallbackReason: streamResult.fallbackReason,
              raw: streamResult.result,
              storageUrl: storageUrl ?? undefined,
              ...dimensions,
            },
            status: url ? 'completed' : 'failed',
          };
        }

        case 'gemini-text': {
          const text = await executeGeminiText(normalizedModelId, input.prompt, onProgress);
          return {
            url: '', // Text results don't have URLs
            metadata: {
              ...baseMetadata,
              raw: { text },
            },
            status: text ? 'completed' : 'failed',
          };
        }

        case 'groq-text': {
          const text = await executeGroqText(normalizedModelId, input.prompt, onProgress);
          return {
            url: '',
            metadata: {
              ...baseMetadata,
              raw: { text },
            },
            status: text ? 'completed' : 'failed',
          };
        }

        case 'elevenlabs-tts':
        case 'elevenlabs-sfx':
        case 'elevenlabs-music': {
          const { functionName, body } = buildElevenLabsBody(input);
          const audioUrl = await executeElevenLabs(functionName, body, onProgress);

          return {
            url: audioUrl,
            metadata: {
              ...baseMetadata,
              mediaType: 'audio',
            },
            status: audioUrl ? 'completed' : 'failed',
          };
        }

        case 'gmi-cloud': {
          const gmiResult = await executeGmiCloud(normalizedModelId, input, mediaType, onProgress);
          const gmiUrl = gmiResult.url ?? '';

          let gmiStorageUrl: string | null = null;
          if (input.outputConfig?.autoStore !== false && gmiUrl && input.metadata?.projectId) {
            gmiStorageUrl = await storeAssetToSupabase(
              gmiUrl,
              mediaType,
              input.metadata.projectId,
              input.outputConfig?.storageBucket,
              input.outputConfig?.storagePathPrefix
            );
          }

          return {
            url: gmiStorageUrl ?? gmiUrl,
            metadata: {
              ...baseMetadata,
              resolvedModel: gmiResult.resolvedModelId,
              fallbackUsed: gmiResult.fallbackUsed,
              fallbackReason: gmiResult.fallbackReason,
              raw: gmiResult.raw,
              storageUrl: gmiStorageUrl ?? undefined,
            },
            status: gmiUrl || gmiResult.text ? 'completed' : 'failed',
          };
        }

        case 'edge-function': {
          const functionName = input.parameters?._edgeFunction as string;
          const body = { ...input.parameters };
          delete body._edgeFunction;
          body.prompt = input.prompt;

          const data = await executeEdgeFunction(functionName, body, onProgress);
          const url = extractResultUrl(data, mediaType) ?? '';

          return {
            url,
            metadata: {
              ...baseMetadata,
              raw: data,
            },
            status: 'completed',
          };
        }

        default: {
          throw new GenerationError(`Unknown generation route: ${route}`, 'unknown_route');
        }
      }
    } catch (error) {
      if (error instanceof GenerationError) {
        return {
          url: '',
          metadata: {
            ...baseMetadata,
            raw: error.details,
          },
          status: 'failed',
        };
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        url: '',
        metadata: {
          ...baseMetadata,
          raw: { error: message },
        },
        status: 'failed',
      };
    }
  },

  /**
   * Generate an image through the unified service.
   * Convenience wrapper that sets appropriate defaults.
   */
  async generateImage(
    prompt: string,
    options?: {
      model?: string;
      parameters?: Record<string, unknown>;
      referenceAssets?: ReferenceAsset[];
      projectId?: string;
      source?: GenerationMetadata['source'];
      autoStore?: boolean;
      onProgress?: OnProgress;
    }
  ): Promise<GenerationResult> {
    return this.generate(
      {
        model: options?.model ?? 'fal-ai/flux/schnell',
        prompt,
        parameters: options?.parameters,
        referenceAssets: options?.referenceAssets,
        outputConfig: {
          format: 'png',
          autoStore: options?.autoStore,
        },
        metadata: {
          source: options?.source,
          projectId: options?.projectId,
        },
      },
      options?.onProgress
    );
  },

  /**
   * Generate a video through the unified service.
   * Convenience wrapper that sets appropriate defaults.
   */
  async generateVideo(
    prompt: string,
    options?: {
      model?: string;
      parameters?: Record<string, unknown>;
      referenceAssets?: ReferenceAsset[];
      projectId?: string;
      source?: GenerationMetadata['source'];
      autoStore?: boolean;
      onProgress?: OnProgress;
    }
  ): Promise<GenerationResult> {
    return this.generate(
      {
        model: options?.model ?? 'fal-ai/kling-video/o3/standard/text-to-video',
        prompt,
        parameters: options?.parameters,
        referenceAssets: options?.referenceAssets,
        outputConfig: {
          format: 'mp4',
          autoStore: options?.autoStore,
        },
        metadata: {
          source: options?.source,
          projectId: options?.projectId,
        },
      },
      options?.onProgress
    );
  },

  /**
   * Generate audio through the unified service.
   * Convenience wrapper that sets appropriate defaults.
   */
  async generateAudio(
    prompt: string,
    options?: {
      model?: string;
      parameters?: Record<string, unknown>;
      projectId?: string;
      source?: GenerationMetadata['source'];
      onProgress?: OnProgress;
    }
  ): Promise<GenerationResult> {
    return this.generate(
      {
        model: options?.model ?? 'elevenlabs-sfx',
        prompt,
        parameters: options?.parameters,
        metadata: {
          source: options?.source,
          projectId: options?.projectId,
        },
      },
      options?.onProgress
    );
  },

  /**
   * Generate text through the unified service.
   * Convenience wrapper that sets appropriate defaults.
   */
  async generateText(
    prompt: string,
    options?: {
      model?: string;
      parameters?: Record<string, unknown>;
      source?: GenerationMetadata['source'];
      onProgress?: OnProgress;
    }
  ): Promise<GenerationResult> {
    return this.generate(
      {
        model: options?.model ?? 'google/gemini-2.5-flash',
        prompt,
        parameters: options?.parameters,
        metadata: {
          source: options?.source,
        },
      },
      options?.onProgress
    );
  },

  /**
   * Call a Supabase edge function through the unified interface.
   * For flows that use dedicated edge functions (e.g., generate-shot-image).
   */
  async invokeEdgeFunction(
    functionName: string,
    body: Record<string, unknown>,
    onProgress?: OnProgress
  ): Promise<GenerationResult> {
    const generationId = crypto.randomUUID();

    try {
      const data = await executeEdgeFunction(functionName, body, onProgress);

      return {
        url: extractResultUrl(data, 'unknown') ?? '',
        metadata: {
          generationId,
          requestedModel: functionName,
          resolvedModel: functionName,
          fallbackUsed: false,
          mediaType: 'unknown',
          raw: data,
        },
        status: 'completed',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Edge function call failed';
      return {
        url: '',
        metadata: {
          generationId,
          requestedModel: functionName,
          resolvedModel: functionName,
          fallbackUsed: false,
          mediaType: 'unknown',
          raw: { error: message },
        },
        status: 'failed',
      };
    }
  },

  /**
   * Get the credit cost for a model.
   */
  getModelCredits(modelId: string): number | undefined {
    const normalized = normalizeFalModelId(modelId);
    return getModelById(normalized)?.credits;
  },

  /**
   * Get model info by ID.
   */
  getModel(modelId: string): StudioModel | undefined {
    const normalized = normalizeFalModelId(modelId);
    return getModelById(normalized);
  },
};

export default unifiedGenerationService;
