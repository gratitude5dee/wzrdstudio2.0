import {
  getModelById,
  getModelsByType,
  getModelsByTypeAndGroup,
  type StudioModel,
  type StudioModelMediaType,
  type StudioModelUiGroup,
} from '@/lib/studio-model-constants';

export interface MarketplaceModel extends StudioModel {
  capabilities: string[];
  isNew?: boolean;
  isPinned?: boolean;
  multiModelEligible: boolean;
  providerKey: string;
  providerLabel: string;
}

export interface MarketplaceProviderGroup {
  key: string;
  label: string;
  models: MarketplaceModel[];
}

const PROVIDER_LABELS: Record<string, string> = {
  'fal-ai': 'Fal',
  'lovable-ai': 'Lovable',
  'gmi-cloud': 'GMI Cloud',
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const PINNED_MODELS: Partial<Record<StudioModelMediaType, string[]>> = {
  image: [
    'gmi/seedream-5.0-lite',
    'gmi/gemini-3.1-flash-image-preview',
    'fal-ai/nano-banana-pro',
    'fal-ai/seedream/v5/lite/text-to-image',
    'fal-ai/ideogram/v3',
  ],
  video: [
    'gmi/veo3',
    'gmi/kling-v3-omni',
    'fal-ai/kling-video/o3/standard/text-to-video',
    'fal-ai/kling-video/o3/pro/text-to-video',
    'fal-ai/sora-2/text-to-video',
  ],
  text: [
    'gmi/deepseek-r1',
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
    'openai/gpt-5',
  ],
};

const NEW_MODELS = new Set<string>([
  'gmi/seedream-5.0-lite',
  'gmi/gemini-3.1-flash-image-preview',
  'gmi/kling-v3-omni',
  'gmi/deepseek-r1',
  'gmi/openai-o4-mini',
  'gmi/wan2.6-t2v',
  'gmi/minimax-hailuo-2.3',
  'gmi/pixverse-v5-t2v',
  'gmi/veo3',
  'gmi/veo3-fast',
  'gmi/luma-ray2',
  'gmi/kling-i2v-v2.1-master',
  'gmi/kling-t2v-v2.1-master',
  'fal-ai/seedream/v5/lite/text-to-image',
  'fal-ai/seedream/v5/lite/edit',
  'fal-ai/nano-banana-pro',
  'google/gemini-2.5-pro',
  'openai/gpt-5',
  'fal-ai/sora-2/text-to-video',
]);

function inferProviderLabel(model: StudioModel): string {
  const explicit = PROVIDER_LABELS[model.provider];
  if (explicit) {
    return explicit;
  }

  if (model.id.startsWith('gmi/')) {
    return 'GMI Cloud';
  }
  if (model.id.startsWith('google/')) {
    return 'Google';
  }
  if (model.id.startsWith('openai/')) {
    return 'OpenAI';
  }
  if (model.id.startsWith('anthropic/')) {
    return 'Anthropic';
  }

  return model.provider;
}

function inferCapabilities(model: StudioModel): string[] {
  const capabilities = new Set<string>();

  if (model.mediaType === 'text') {
    capabilities.add('T');
  }
  if (model.mediaType === 'image') {
    capabilities.add('I');
  }
  if (model.mediaType === 'video') {
    capabilities.add('V');
  }

  const supports = model.supports ?? [];
  if (supports.includes('image_url') || supports.includes('image_urls')) {
    capabilities.add('R');
  }
  if (supports.includes('num_images') || supports.includes('batch')) {
    capabilities.add('B');
  }
  if (supports.includes('style') || model.workflowType.includes('edit')) {
    capabilities.add('S');
  }
  if (supports.includes('prompt')) {
    capabilities.add('P');
  }

  return Array.from(capabilities);
}

function toMarketplaceModel(
  mediaType: StudioModelMediaType,
  model: StudioModel
): MarketplaceModel {
  const providerLabel = inferProviderLabel(model);
  const providerKey = providerLabel.toLowerCase();

  return {
    ...model,
    capabilities: inferCapabilities(model),
    isPinned: (PINNED_MODELS[mediaType] ?? []).includes(model.id),
    isNew: NEW_MODELS.has(model.id),
    multiModelEligible: model.uiGroup === 'generation',
    providerKey,
    providerLabel,
  };
}

export function getMarketplaceModels(
  mediaType: StudioModelMediaType,
  uiGroup: StudioModelUiGroup = 'generation'
): MarketplaceModel[] {
  return getModelsByTypeAndGroup(mediaType, uiGroup).map((model) =>
    toMarketplaceModel(mediaType, model)
  );
}

export function getPinnedMarketplaceModels(
  mediaType: StudioModelMediaType,
  uiGroup: StudioModelUiGroup = 'generation'
): MarketplaceModel[] {
  return getMarketplaceModels(mediaType, uiGroup).filter((model) => model.isPinned);
}

export function getMarketplaceProviders(
  mediaType: StudioModelMediaType,
  uiGroup: StudioModelUiGroup = 'generation'
): MarketplaceProviderGroup[] {
  const grouped = new Map<string, MarketplaceProviderGroup>();

  getMarketplaceModels(mediaType, uiGroup).forEach((model) => {
    const existing = grouped.get(model.providerKey);
    if (existing) {
      existing.models.push(model);
      return;
    }

    grouped.set(model.providerKey, {
      key: model.providerKey,
      label: model.providerLabel,
      models: [model],
    });
  });

  return Array.from(grouped.values()).sort((left, right) =>
    left.label.localeCompare(right.label)
  );
}

export function getMarketplaceModelById(
  modelId: string
): MarketplaceModel | undefined {
  const model = getModelById(modelId);
  if (!model) {
    return undefined;
  }

  return toMarketplaceModel(model.mediaType, model);
}
