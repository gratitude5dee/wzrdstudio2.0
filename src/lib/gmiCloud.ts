import { buildLtxFastPayload } from '../../shared/ltx-fast.ts';

export interface GmiMediaUrl {
  id?: string;
  url: string;
}

export interface GmiExtractedMedia {
  primaryUrl?: string;
  previewUrl?: string;
  outputs: GmiMediaUrl[];
  thumbnailUrl?: string;
  elementId?: string;
}

export type GmiChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } }
  | { type: 'audio_url'; audio_url: { url: string } };

export interface GmiChatMessage {
  role: string;
  content: string | GmiChatContentPart[];
}

type GmiQueuePayload = Record<string, unknown>;

const VALID_KLING_DURATIONS = new Set(['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15']);
const VALID_KLING_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1']);
const VALID_SEEDANCE_RESOLUTIONS = new Set(['480p', '720p', '1080p']);
const VALID_SEEDANCE_RATIOS = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']);
const VALID_WAN_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4']);
const SEEDREAM_SIZE_BY_RATIO: Record<string, Record<string, string>> = {
  '1:1': {
    '2K': '2048x2048',
    '3K': '3072x3072',
    '4K': '3200x3200',
  },
  '16:9': {
    '2K': '2560x1440',
    '3K': '3072x1728',
    '4K': '3840x2160',
  },
  '9:16': {
    '2K': '1440x2560',
    '3K': '1728x3072',
    '4K': '2160x3840',
  },
  '4:3': {
    '2K': '2304x1728',
    '3K': '3072x2304',
    '4K': '3520x2640',
  },
  '3:4': {
    '2K': '1728x2304',
    '3K': '2304x3072',
    '4K': '2640x3520',
  },
  '3:2': {
    '2K': '2352x1568',
    '3K': '3072x2048',
    '4K': '3840x2560',
  },
  '2:3': {
    '2K': '1568x2352',
    '3K': '2048x3072',
    '4K': '2560x3840',
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric !== undefined) {
    return numeric;
  }

  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function stripUndefined<T extends Record<string, unknown>>(payload: T): T {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as T;
}

function unwrapGmiResult(result: unknown): Record<string, unknown> {
  const record = asRecord(result);
  const outcome = asRecord(record.outcome);
  return Object.keys(outcome).length > 0 ? outcome : record;
}

function normalizeResolutionTier(value: unknown): '2K' | '3K' | '4K' {
  const normalized = asString(value)?.toUpperCase();
  if (normalized === '3K') {
    return '3K';
  }
  if (normalized === '4K') {
    return '4K';
  }
  return '2K';
}

function resolveSeedreamSize(payload: GmiQueuePayload): string {
  const explicit = asString(payload.size);
  if (explicit && (explicit.includes('x') || explicit === '2K' || explicit === '3K')) {
    return explicit;
  }

  const aspectRatio = asString(payload.aspect_ratio) ?? '1:1';
  const resolutionTier = normalizeResolutionTier(payload.resolution ?? payload.size);
  const byRatio = SEEDREAM_SIZE_BY_RATIO[aspectRatio] ?? SEEDREAM_SIZE_BY_RATIO['1:1'];
  return byRatio[resolutionTier] ?? byRatio['2K'] ?? '2048x2048';
}

function collectGenericImages(payload: GmiQueuePayload): string[] {
  const directImage = asString(payload.image);
  if (directImage) {
    return [directImage];
  }

  const directImages = asStringArray(payload.image);
  if (directImages.length > 0) {
    return directImages;
  }

  const imageUrl = asString(payload.image_url);
  if (imageUrl) {
    return [imageUrl];
  }

  return asStringArray(payload.image_urls);
}

function collectGenericVideos(payload: GmiQueuePayload): string[] {
  const directVideo = asString(payload.video);
  if (directVideo) {
    return [directVideo];
  }

  const directVideos = asStringArray(payload.video);
  if (directVideos.length > 0) {
    return directVideos;
  }

  const videoUrl = asString(payload.video_url);
  if (videoUrl) {
    return [videoUrl];
  }

  return asStringArray(payload.video_urls);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = asFiniteNumber(value);
  if (numeric === undefined) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeSeedanceResolution(value: unknown): '480p' | '720p' | '1080p' {
  const normalized = asString(value)?.toLowerCase();
  if (normalized && VALID_SEEDANCE_RESOLUTIONS.has(normalized)) {
    return normalized as '480p' | '720p' | '1080p';
  }
  return '720p';
}

function normalizeSeedanceRatio(value: unknown): string {
  const ratio = asString(value) ?? '16:9';
  return VALID_SEEDANCE_RATIOS.has(ratio) ? ratio : '16:9';
}

function normalizeWanResolution(value: unknown): '720P' | '1080P' {
  const normalized = asString(value)?.toUpperCase();
  return normalized === '720P' ? '720P' : '1080P';
}

function normalizeWanRatio(value: unknown): string {
  const ratio = asString(value) ?? '16:9';
  return VALID_WAN_RATIOS.has(ratio) ? ratio : '16:9';
}

function translateSeedreamPayload(payload: GmiQueuePayload): GmiQueuePayload {
  const images = collectGenericImages(payload);

  return stripUndefined({
    prompt: asString(payload.prompt) ?? '',
    image: images.length > 0 ? images : undefined,
    size: resolveSeedreamSize(payload),
    output_format: asString(payload.output_format) ?? 'jpeg',
    max_images: asNumber(payload.max_images) ?? 1,
    sequential_image_generation: asString(payload.sequential_image_generation),
    watermark: asBoolean(payload.watermark) ?? false,
  });
}

function translateKlingPayload(payload: GmiQueuePayload): GmiQueuePayload {
  const existingImages = Array.isArray(payload.image_list) ? payload.image_list : undefined;
  const existingVideos = Array.isArray(payload.video_list) ? payload.video_list : undefined;
  const existingElements = Array.isArray(payload.element_list) ? payload.element_list : undefined;

  const imageUrl = asString(payload.image_url);
  const videoUrl = asString(payload.video_url);
  const hasVideoReference = Boolean(videoUrl || (existingVideos && existingVideos.length > 0));

  const elementIds = asStringArray(payload.element_ids ?? payload.elementIds);
  const mappedElements =
    existingElements ??
    (elementIds.length > 0 ? elementIds.map((elementId) => ({ element_id: elementId })) : undefined);

  const mappedImages =
    existingImages ??
    (imageUrl ? [{ image_url: imageUrl, type: 'first_frame' }] : undefined);

  const mappedVideos =
    existingVideos ??
    (videoUrl
      ? [
          {
            video_url: videoUrl,
            refer_type: asString(payload.refer_type) ?? 'base',
            keep_original_sound: asString(payload.keep_original_sound) ?? 'yes',
          },
        ]
      : undefined);

  const soundInput = asString(payload.sound);
  const sound =
    hasVideoReference
      ? 'off'
      : soundInput === 'on' || soundInput === 'off'
        ? soundInput
        : asBoolean(payload.generate_audio)
          ? 'on'
          : 'off';

  const rawDuration = asString(payload.duration);
  const duration = rawDuration && VALID_KLING_DURATIONS.has(rawDuration) ? rawDuration : '5';
  const aspectRatio = asString(payload.aspect_ratio);

  return stripUndefined({
    prompt: asString(payload.prompt),
    mode: asString(payload.mode) === 'pro' ? 'pro' : 'std',
    duration: mappedVideos ? undefined : duration,
    aspect_ratio:
      aspectRatio && VALID_KLING_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : '16:9',
    sound,
    image_list: mappedImages,
    video_list: mappedVideos,
    element_list: mappedElements,
    multi_shot: payload.multi_shot,
    shot_type: payload.shot_type,
    multi_prompt: payload.multi_prompt,
    watermark_info: payload.watermark_info,
  });
}

function translateLtxFastPayload(payload: GmiQueuePayload): GmiQueuePayload {
  return stripUndefined(buildLtxFastPayload({
    image_uri: payload.image_uri,
    image_url: payload.image_url,
    image: payload.image,
    prompt: payload.prompt,
    duration: payload.duration,
    duration_seconds: payload.duration_seconds,
    durationSeconds: payload.durationSeconds,
    resolution: payload.resolution,
    fps: payload.fps,
    generate_audio: payload.generate_audio,
    generateAudio: payload.generateAudio,
    camera_motion: payload.camera_motion,
    cameraMotion: payload.cameraMotion,
  }));
}

function translateSeedancePayload(payload: GmiQueuePayload): GmiQueuePayload {
  const images = collectGenericImages(payload);
  const firstFrame = asString(payload.first_frame) ?? images[0];
  const referenceImages = asStringArray(payload.reference_images);
  const referenceVideos = asStringArray(payload.reference_videos);
  const referenceAudios = asStringArray(payload.reference_audios);
  const referenceAssetIds = asStringArray(payload.reference_asset_ids ?? payload.referenceAssetIds);

  return stripUndefined({
    prompt: asString(payload.prompt) ?? '',
    first_frame: firstFrame,
    last_frame: asString(payload.last_frame),
    reference_images: referenceImages.length > 0 ? referenceImages : undefined,
    reference_videos: referenceVideos.length > 0 ? referenceVideos : undefined,
    reference_audios: referenceAudios.length > 0 ? referenceAudios : undefined,
    reference_asset_ids: referenceAssetIds.length > 0 ? referenceAssetIds : undefined,
    duration: clampInteger(payload.duration, 4, 15, 5),
    resolution: normalizeSeedanceResolution(payload.resolution),
    ratio: normalizeSeedanceRatio(payload.ratio ?? payload.aspect_ratio),
    seed: asFiniteNumber(payload.seed) !== undefined
      ? clampInteger(payload.seed, 0, 4294967295, 0)
      : undefined,
    watermark: asBoolean(payload.watermark) ?? false,
    generate_audio: asBoolean(payload.generate_audio ?? payload.generateAudio) ?? true,
    web_search: asBoolean(payload.web_search) ?? false,
  });
}

function translateWanI2vPayload(payload: GmiQueuePayload): GmiQueuePayload {
  const images = collectGenericImages(payload);

  return stripUndefined({
    prompt: asString(payload.prompt),
    negative_prompt: asString(payload.negative_prompt),
    first_frame: asString(payload.first_frame) ?? images[0],
    last_frame: asString(payload.last_frame),
    driving_audio: asString(payload.driving_audio) ?? asString(payload.audio_url),
    first_clip: asString(payload.first_clip),
    resolution: normalizeWanResolution(payload.resolution),
    duration: clampInteger(payload.duration, 2, 15, 5),
    prompt_extend: asBoolean(payload.prompt_extend) ?? true,
    watermark: asBoolean(payload.watermark) ?? false,
    seed: asFiniteNumber(payload.seed) !== undefined
      ? clampInteger(payload.seed, 0, 2147483647, 0)
      : undefined,
  });
}

function translateWanR2vPayload(payload: GmiQueuePayload): GmiQueuePayload {
  const imageReferences = asStringArray(payload.reference_image);
  const videoReferences = asStringArray(payload.reference_video);
  const genericImages = collectGenericImages(payload);
  const genericVideos = collectGenericVideos(payload);

  return stripUndefined({
    prompt: asString(payload.prompt) ?? '',
    negative_prompt: asString(payload.negative_prompt),
    first_frame: asString(payload.first_frame),
    reference_image:
      imageReferences.length > 0
        ? imageReferences.slice(0, 5)
        : genericImages.length > 0
          ? genericImages.slice(0, 1)
          : undefined,
    reference_video:
      videoReferences.length > 0
        ? videoReferences.slice(0, 5)
        : genericVideos.length > 0
          ? genericVideos.slice(0, 1)
          : undefined,
    resolution: normalizeWanResolution(payload.resolution),
    ratio: normalizeWanRatio(payload.ratio ?? payload.aspect_ratio),
    duration: clampInteger(payload.duration, 2, 15, 5),
    prompt_extend: asBoolean(payload.prompt_extend) ?? true,
    watermark: asBoolean(payload.watermark) ?? false,
    seed: asFiniteNumber(payload.seed) !== undefined
      ? clampInteger(payload.seed, 0, 2147483647, 0)
      : undefined,
  });
}

function translateLtxAudioPayload(payload: GmiQueuePayload): GmiQueuePayload {
  return stripUndefined({
    audio_uri: asString(payload.audio_uri) ?? asString(payload.audio_url),
    prompt: asString(payload.prompt),
    image_uri: asString(payload.image_uri) ?? asString(payload.image_url),
    resolution: '1920x1080',
    guidance_scale: asNumber(payload.guidance_scale),
  });
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function pickGenericPayloadValue(key: string, payload: GmiQueuePayload): unknown {
  if (payload[key] !== undefined) {
    return payload[key];
  }

  const image = firstDefined(
    payload.image,
    asString(payload.image_url),
    asStringArray(payload.image_urls)[0]
  );
  const audio = firstDefined(
    payload.audio,
    asString(payload.audio_url),
    asString(payload.voice_sample)
  );
  const video = firstDefined(payload.video, asString(payload.video_url));

  switch (key) {
    case 'image':
      return image;
    case 'image_url':
      return asString(payload.image_url) ?? (typeof image === 'string' ? image : undefined);
    case 'image_urls':
      return asStringArray(payload.image_urls).length > 0
        ? asStringArray(payload.image_urls)
        : typeof image === 'string'
          ? [image]
          : undefined;
    case 'audio':
      return audio;
    case 'audio_url':
      return asString(payload.audio_url) ?? (typeof audio === 'string' ? audio : undefined);
    case 'voice_sample':
      return asString(payload.voice_sample) ?? asString(payload.audio_url);
    case 'video':
      return video;
    case 'video_url':
      return asString(payload.video_url) ?? (typeof video === 'string' ? video : undefined);
    case 'video_urls':
      return asStringArray(payload.video_urls).length > 0
        ? asStringArray(payload.video_urls)
        : typeof video === 'string'
          ? [video]
          : undefined;
    case 'aspectRatio':
      return asString(payload.aspectRatio) ?? asString(payload.aspect_ratio);
    case 'aspect_ratio':
      return asString(payload.aspect_ratio) ?? asString(payload.aspectRatio);
    case 'ratio':
      return asString(payload.ratio) ?? asString(payload.aspect_ratio) ?? asString(payload.aspectRatio);
    case 'durationSeconds':
      return firstDefined(asNumber(payload.durationSeconds), asNumber(payload.duration_seconds), asNumber(payload.duration));
    case 'duration_seconds':
      return firstDefined(asNumber(payload.duration_seconds), asNumber(payload.durationSeconds), asNumber(payload.duration));
    case 'duration':
      return firstDefined(asNumber(payload.duration), asNumber(payload.durationSeconds), asNumber(payload.duration_seconds));
    case 'generateAudio':
      return firstDefined(asBoolean(payload.generateAudio), asBoolean(payload.generate_audio));
    case 'generate_audio':
      return firstDefined(asBoolean(payload.generate_audio), asBoolean(payload.generateAudio));
    default:
      return payload[key];
  }
}

function translateGenericQueuePayload(payload: GmiQueuePayload, payloadKeys: string[]): GmiQueuePayload {
  const translated: Record<string, unknown> = {};
  for (const key of payloadKeys) {
    const value = pickGenericPayloadValue(key, payload);
    if (value !== undefined) {
      translated[key] = value;
    }
  }

  if (Object.keys(translated).length === 0) {
    return payload;
  }

  return stripUndefined(translated);
}

export function translateGmiQueuePayload(
  modelId: string,
  payload: GmiQueuePayload,
  payloadKeys: string[] = [],
): GmiQueuePayload {
  switch (modelId) {
    case 'gmi/seedream-5.0':
    case 'gmi/seedream-5.0-lite':
    case 'seedream-5.0-lite':
      return translateSeedreamPayload(payload);
    case 'gmi/kling-v3-omni':
    case 'kling-v3-omni':
      return translateKlingPayload(payload);
    case 'gmi/ltx-fast-i2v':
    case 'ltx-2-fast-image-to-video':
      return translateLtxFastPayload(payload);
    case 'gmi/ltx-pro-a2v':
    case 'ltx-2-pro-audio-to-video':
      return translateLtxAudioPayload(payload);
    case 'gmi/seedance-2.0-t2v':
    case 'gmi/seedance-2.0-i2v':
    case 'gmi/seedance-2.0-fast-t2v':
    case 'gmi/seedance-2.0-fast-i2v':
    case 'seedance-2-0-260128':
    case 'seedance-2-0-fast-260128':
      return translateSeedancePayload(payload);
    case 'gmi/wan2.7-i2v':
    case 'wan2.7-i2v':
      return translateWanI2vPayload(payload);
    case 'gmi/wan2.7-r2v':
    case 'wan2.7-r2v':
      return translateWanR2vPayload(payload);
    default:
      return translateGenericQueuePayload(payload, payloadKeys);
  }
}

export function extractGmiElementId(result: unknown): string | undefined {
  const payload = unwrapGmiResult(result);
  const direct = asString(payload.element_id);
  if (direct) {
    return direct;
  }

  const element = asRecord(payload.element);
  const nested = asString(element.element_id);
  if (nested) {
    return nested;
  }

  const elements = Array.isArray(payload.elements) ? payload.elements : [];
  for (const entry of elements) {
    const elementEntry = asRecord(entry);
    const elementId = asString(elementEntry.element_id);
    if (elementId) {
      return elementId;
    }
  }

  return undefined;
}

export function extractGmiMedia(result: unknown, mediaType: 'image' | 'video' | 'unknown' = 'unknown'): GmiExtractedMedia {
  const payload = unwrapGmiResult(result);
  const outputs: GmiMediaUrl[] = [];

  const mediaUrls = Array.isArray(payload.media_urls) ? payload.media_urls : [];
  for (const entry of mediaUrls) {
    const media = asRecord(entry);
    const url = asString(media.url);
    if (url) {
      outputs.push({ id: asString(media.id), url });
    }
  }

  const videoUrl = asString(payload.video_url);
  if (videoUrl && !outputs.some((entry) => entry.url === videoUrl)) {
    outputs.unshift({ url: videoUrl });
  }

  const directUrl = asString(payload.url);
  if (directUrl && !outputs.some((entry) => entry.url === directUrl)) {
    outputs.push({ url: directUrl });
  }

  const thumbnailUrl = asString(payload.thumbnail_image_url);
  if (thumbnailUrl && mediaType === 'image' && outputs.length === 0) {
    outputs.push({ url: thumbnailUrl });
  }

  const primaryUrl = outputs[0]?.url;
  const previewUrl = thumbnailUrl ?? primaryUrl;

  return {
    primaryUrl,
    previewUrl,
    outputs,
    thumbnailUrl,
    elementId: extractGmiElementId(payload),
  };
}
