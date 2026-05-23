import { describe, expect, it } from 'vitest';

import {
  getMarketplaceModels,
  getMarketplaceProviders,
} from '@/lib/studio/modelMarketplace';

describe('modelMarketplace', () => {
  it('defaults image marketplace models to generation-safe entries', () => {
    const models = getMarketplaceModels('image');

    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.uiGroup === 'generation')).toBe(true);
    expect(models.every((model) => model.workflowType === 'text-to-image')).toBe(true);
  });

  it('groups only generation-safe video providers by default', () => {
    const providers = getMarketplaceProviders('video');

    expect(providers.length).toBeGreaterThan(0);
    expect(
      providers.flatMap((provider) => provider.models).every((model) => model.uiGroup === 'generation')
    ).toBe(true);
  });
});
