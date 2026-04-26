import {
  AUDIO_MODELS,
  IMAGE_MODELS,
  VIDEO_MODELS,
  type StudioModel,
} from '@/lib/studio-model-constants';

type ModelInputObject = Record<string, unknown>;

const MODEL_ALIASES: Record<string, string> = {
  'google/gemini-2.5-flash-image-preview': 'fal-ai/nano-banana-2',
  'google/gemini-2.5-flash-image': 'fal-ai/nano-banana-2',
  'gemini-2.5-flash-image-preview': 'fal-ai/nano-banana-2',
  'gemini-2.5-flash-image': 'fal-ai/nano-banana-2',
  'flux-dev': 'fal-ai/flux/dev',
  'flux-schnell': 'fal-ai/flux/schnell',
  'flux-pro': 'fal-ai/flux-pro/v1.1-ultra',
  'kling-2-1': 'fal-ai/kling-video/o3/standard/text-to-video',
  'kling-pro-16': 'fal-ai/kling-video/o3/pro/text-to-video',
  'gemini-2.5-flash-video': 'fal-ai/kling-video/o3/standard/text-to-video',
  'google/gemini-2.5-flash-video': 'fal-ai/kling-video/o3/standard/text-to-video',
  'veo3-fast': 'fal-ai/kling-video/o3/standard/text-to-video',
  'luma/dream-machine': 'fal-ai/kling-video/v3/pro/image-to-video',
  'luma-dream': 'fal-ai/kling-video/v3/pro/image-to-video',
  'luma-ray': 'fal-ai/kling-video/v3/pro/image-to-video',
  hailuo: 'fal-ai/kling-video/o3/pro/image-to-video',
  'minimax-video-01': 'fal-ai/kling-video/o3/pro/image-to-video',
  'fal-ai/magi-1': 'fal-ai/magi',
  'fal-ai/kling-video/v1/standard/text-to-video': 'fal-ai/kling-video/o3/standard/text-to-video',
  'fal-ai/kling-video/v1.6/pro/text-to-video': 'fal-ai/kling-video/o3/pro/text-to-video',
  'fal-ai/kling-video/v1.5/pro/text-to-video': 'fal-ai/kling-video/o3/pro/text-to-video',
};

const MODEL_DEFAULTS = new Map<string, ModelInputObject>(
  [...IMAGE_MODELS, ...VIDEO_MODELS, ...AUDIO_MODELS]
    .filter((model: StudioModel) => Boolean(model.defaults))
    .map((model: StudioModel) => [model.id, (model.defaults || {}) as ModelInputObject])
);

function toObjectOrEmpty(value: unknown): ModelInputObject {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as ModelInputObject;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ModelInputObject;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function parseSettingsOverride(
  value: unknown
): { valid: true; data: ModelInputObject; error?: undefined } | { valid: false; error: string; data?: undefined } {
  if (!value) return { valid: true, data: {} };
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { valid: true, data: value as ModelInputObject };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return { valid: true, data: {} };
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, error: 'Override JSON must be an object.' };
      }
      if (trimmed.length > 2000) {
        return { valid: false, error: 'Override JSON is too large (max 2000 chars).' };
      }
      return { valid: true, data: parsed as ModelInputObject };
    } catch {
      return { valid: false, error: 'Invalid JSON syntax in override.' };
    }
  }
  return { valid: false, error: 'Override JSON must be a JSON object.' };
}

export function normalizeFalModelId(modelId: string): string {
  if (!modelId) return modelId;
  return MODEL_ALIASES[modelId] || modelId;
}

export function buildCanonicalFalInputs(
  modelId: string,
  rawInputs: ModelInputObject
): { modelId: string; inputs: ModelInputObject } {
  const normalizedModelId = normalizeFalModelId(modelId);
  const defaults = MODEL_DEFAULTS.get(normalizedModelId) || {};

  const inputsCopy: ModelInputObject = { ...rawInputs };
  const settings = toObjectOrEmpty(inputsCopy.settings);
  const overrideResult = parseSettingsOverride(inputsCopy.settings_override);
  if (!overrideResult.valid) {
    throw new Error(overrideResult.error);
  }
  const settingsOverride = overrideResult.data;
  delete inputsCopy.settings;
  delete inputsCopy.settings_override;

  return {
    modelId: normalizedModelId,
    inputs: {
      ...defaults,
      ...inputsCopy,
      ...settings,
      ...settingsOverride,
    },
  };
}
