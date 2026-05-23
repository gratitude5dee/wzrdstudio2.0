import { describe, expect, it } from 'vitest';

import {
  buildExecutionSelection,
  buildFalCatalogPayload,
  createNotImplementedArtifact,
  expandBatchInputs,
  isNotImplementedResult,
  normalizeFalCatalogOutput,
} from '../../../../supabase/functions/_shared/compute-action-helpers';
import type { CatalogModel } from '../../../../shared/ai-model-catalog';

const catalogModel = (overrides: Partial<CatalogModel> = {}): CatalogModel => ({
  id: 'fal-ai/nano-banana-2',
  endpointId: 'fal-ai/nano-banana-2',
  provider: 'fal-ai',
  providerLabel: 'fal.ai',
  name: 'Nano Banana 2',
  description: 'Image generation',
  category: 'text-to-image',
  pricingText: '$0.01 / image USD',
  pricing: {},
  transportType: 'fal_queue',
  mediaType: 'image',
  workflowType: 'text-to-image',
  uiGroup: 'generation',
  supports: ['prompt', 'num_images', 'aspect_ratio'],
  payloadKeys: ['prompt', 'num_images', 'aspect_ratio', 'image_url', 'image_urls'],
  requiresAssets: [],
  defaults: { num_images: 1 },
  controls: [],
  aliases: [],
  enabled: true,
  credits: 1,
  timeLabel: '~10s',
  sortRank: 1,
  studioSurfaces: ['studio:image'],
  kanvasModes: [],
  rawApiExample: '',
  rawPayload: {},
  rawSourceBlock: '',
  isDefault: true,
  defaultRank: 1,
  ...overrides,
});

describe('compute action helpers', () => {
  it('selects only target nodes and upstream dependencies', () => {
    const selection = buildExecutionSelection('target'.split(','), [
      { source_node_id: 'source', target_node_id: 'mid' },
      { source_node_id: 'mid', target_node_id: 'target' },
      { source_node_id: 'target', target_node_id: 'downstream' },
    ]);

    expect(Array.from(selection).sort()).toEqual(['mid', 'source', 'target']);
  });

  it('builds Fal payloads from defaults, params, and bound inputs', () => {
    const payload = buildFalCatalogPayload({
      model: catalogModel(),
      mediaType: 'image',
      params: { numImages: 2, aspectRatio: '16:9' },
      inputs: { prompt: 'a silver tower', image: 'https://example.com/ref.png' },
      prompt: 'a silver tower',
      referenceUrls: ['https://example.com/ref.png'],
    });

    expect(payload).toMatchObject({
      prompt: 'a silver tower',
      num_images: 2,
      aspect_ratio: '16:9',
      image_url: 'https://example.com/ref.png',
      image_urls: ['https://example.com/ref.png'],
    });
    expect(payload).not.toHaveProperty('numImages');
  });

  it('expands batch policies deterministically', () => {
    expect(expandBatchInputs({ prompt: ['a', 'b'], image: 'ref' }, 'map')).toEqual([
      { prompt: 'a', image: 'ref' },
      { prompt: 'b', image: 'ref' },
    ]);
    expect(expandBatchInputs({ prompt: ['a', 'b'], image: ['x', 'y'] }, 'zip')).toEqual([
      { prompt: 'a', image: 'x' },
      { prompt: 'b', image: 'y' },
    ]);
    expect(expandBatchInputs({ prompt: ['a', 'b'], image: ['x', 'y'] }, 'cartesian')).toEqual([
      { prompt: 'a', image: 'x' },
      { prompt: 'a', image: 'y' },
      { prompt: 'b', image: 'x' },
      { prompt: 'b', image: 'y' },
    ]);
  });

  it('normalizes Fal outputs into variants', () => {
    const output = normalizeFalCatalogOutput({
      result: { data: { images: [{ url: 'https://example.com/a.png' }, { url: 'https://example.com/b.png' }] } },
      mediaType: 'image',
      requestedModel: 'fal-ai/nano-banana-2',
      endpointModel: 'fal-ai/nano-banana-2',
      prompt: 'test',
    });

    expect(output).toMatchObject({
      type: 'image',
      url: 'https://example.com/a.png',
      urls: ['https://example.com/a.png', 'https://example.com/b.png'],
      model: 'fal-ai/nano-banana-2',
      endpoint_model: 'fal-ai/nano-banana-2',
    });
    expect(output.variants).toHaveLength(2);
  });

  it('marks unsupported utility stubs clearly', () => {
    const result = createNotImplementedArtifact({
      actionId: 'embed.remotion',
      mediaType: 'video',
      reason: 'renderer unavailable',
    });

    expect(isNotImplementedResult(result)).toBe(true);
    expect(result).toMatchObject({
      type: 'video',
      data: {
        notImplemented: true,
        action_id: 'embed.remotion',
      },
    });
  });
});
