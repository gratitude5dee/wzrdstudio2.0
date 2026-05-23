import { describe, expect, it } from 'vitest';

import {
  catalogProviderAliasesForFilter,
  formatCatalogProviderLabel,
  modelMatchesCatalogStudioSurface,
  normalizeCatalogProviderKey,
  studioSurfaceForCatalogMediaType,
  type CatalogModel,
} from '../../../../shared/ai-model-catalog';

const baseModel: CatalogModel = {
  id: 'fal-ai/nano-banana-2',
  endpointId: 'fal-ai/nano-banana-2',
  provider: 'fal-ai',
  providerLabel: 'fal.ai',
  name: 'Nano Banana 2',
  description: 'Image model',
  category: 'text-to-image',
  pricingText: '',
  pricing: {},
  transportType: 'fal_queue',
  mediaType: 'image',
  workflowType: 'text-to-image',
  uiGroup: 'generation',
  supports: ['prompt'],
  payloadKeys: ['prompt'],
  requiresAssets: [],
  defaults: {},
  controls: [],
  aliases: [],
  enabled: true,
  credits: 1,
  timeLabel: '~10s',
  sortRank: 10,
  studioSurfaces: [],
  kanvasModes: [],
  rawApiExample: '',
  rawPayload: {},
  rawSourceBlock: '',
  isDefault: true,
  defaultRank: 10,
};

describe('AI model catalog surface helpers', () => {
  it('normalizes Fal provider variants used by UI filters and old rows', () => {
    expect(normalizeCatalogProviderKey('fal.ai')).toBe('fal-ai');
    expect(normalizeCatalogProviderKey('Fal')).toBe('fal-ai');
    expect(catalogProviderAliasesForFilter('fal-ai')).toEqual([
      'fal-ai',
      'fal.ai',
      'fal',
      'fal_ai',
      'falai',
    ]);
    expect(formatCatalogProviderLabel('fal.ai')).toBe('Fal');
  });

  it('infers Studio surfaces from media type for older catalog rows', () => {
    expect(studioSurfaceForCatalogMediaType('image')).toBe('studio:image');
    expect(modelMatchesCatalogStudioSurface(baseModel, 'studio:image')).toBe(true);
    expect(modelMatchesCatalogStudioSurface(baseModel, 'studio:video')).toBe(false);
  });
});
