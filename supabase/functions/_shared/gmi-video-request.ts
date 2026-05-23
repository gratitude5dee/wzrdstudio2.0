import type { CatalogModel } from './ai-model-catalog.ts';
import { buildLtxFastPayload, isLtxFastEndpointModel } from './ltx-fast.ts';

export type QueueVideoModel = Pick<
  CatalogModel,
  'id' | 'endpointId' | 'provider' | 'mediaType' | 'workflowType' | 'payloadKeys'
>;

export interface BuildGmiVideoQueueRequestInput {
  prompt: string;
  imageUrl?: string;
  videoUrl?: string;
  duration?: unknown;
  duration_seconds?: unknown;
  durationSeconds?: unknown;
  resolution?: unknown;
  fps?: unknown;
  generate_audio?: unknown;
  generateAudio?: unknown;
  camera_motion?: unknown;
  cameraMotion?: unknown;
  aspect_ratio?: unknown;
  ratio?: unknown;
  watermark?: unknown;
  seed?: unknown;
  prompt_extend?: unknown;
}

export interface GmiVideoQueueRequest {
  modelId: string;
  endpointModelId: string;
  payloadKeys: string[];
  payload: Record<string, unknown>;
  normalizedSettings: Record<string, unknown>;
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stripUndefined<T extends Record<string, unknown>>(payload: T): T {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as T;
}

function buildBaseVideoPayload(
  input: BuildGmiVideoQueueRequestInput,
): Record<string, unknown> {
  const aspectRatio = asTrimmedString(input.aspect_ratio);
  const ratio = asTrimmedString(input.ratio ?? input.aspect_ratio);

  return stripUndefined({
    prompt: input.prompt,
    duration: input.duration ?? input.duration_seconds ?? input.durationSeconds,
    resolution: input.resolution,
    fps: input.fps,
    generate_audio: input.generate_audio ?? input.generateAudio,
    camera_motion: asTrimmedString(input.camera_motion ?? input.cameraMotion),
    aspect_ratio: aspectRatio,
    ratio,
    watermark: input.watermark,
    seed: input.seed,
    prompt_extend: input.prompt_extend,
  });
}

function buildGenericVideoPayload(
  model: QueueVideoModel,
  input: BuildGmiVideoQueueRequestInput,
): Record<string, unknown> {
  const basePayload = buildBaseVideoPayload(input);

  switch (model.workflowType) {
    case 'text-to-video':
      return basePayload;
    case 'image-to-video':
      return stripUndefined({
        image_url: input.imageUrl,
        ...basePayload,
      });
    case 'reference-to-video':
      return stripUndefined({
        image_url: input.imageUrl,
        video_url: input.videoUrl,
        ...basePayload,
      });
    default:
      throw new Error(`Model ${model.id} does not support video generation workflow ${model.workflowType}.`);
  }
}

export function buildGmiVideoQueueRequest(
  model: QueueVideoModel,
  input: BuildGmiVideoQueueRequestInput,
): GmiVideoQueueRequest {
  if (model.provider !== 'gmi-cloud') {
    throw new Error(`Model ${model.id} is not a GMI Cloud model.`);
  }

  if (model.mediaType !== 'video') {
    throw new Error(`Model ${model.id} is not a video model.`);
  }

  if (
    model.workflowType !== 'text-to-video' &&
    model.workflowType !== 'image-to-video' &&
    model.workflowType !== 'reference-to-video'
  ) {
    throw new Error(`Model ${model.id} does not support video generation.`);
  }

  if (model.workflowType === 'image-to-video' && !input.imageUrl) {
    throw new Error('Image URL is required for image-to-video generation.');
  }

  if (model.workflowType === 'reference-to-video' && !input.imageUrl && !input.videoUrl) {
    throw new Error('Reference-to-video generation requires an image or video URL.');
  }

  const payload = isLtxFastEndpointModel(model.endpointId)
    ? buildLtxFastPayload({
        image_uri: input.imageUrl,
        prompt: input.prompt,
        duration: input.duration,
        duration_seconds: input.duration_seconds,
        durationSeconds: input.durationSeconds,
        resolution: input.resolution,
        fps: input.fps,
        generate_audio: input.generate_audio,
        generateAudio: input.generateAudio,
        camera_motion: input.camera_motion,
        cameraMotion: input.cameraMotion,
      })
    : buildGenericVideoPayload(model, input);

  const {
    image_uri: _imageUri,
    image_url: _imageUrl,
    video_url: _videoUrl,
    prompt: _prompt,
    ...normalizedSettings
  } = payload;

  return {
    modelId: model.id,
    endpointModelId: model.endpointId,
    payloadKeys: model.payloadKeys,
    payload,
    normalizedSettings,
  };
}
