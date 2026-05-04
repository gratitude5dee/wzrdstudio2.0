import { describe, expect, it } from 'vitest';

import { rowToBlueprint, rowToImage } from '@/services/characterBlueprintService';
import type { Database } from '@/integrations/supabase/types';

type BlueprintRow = Database['public']['Tables']['character_blueprints']['Row'];
type BlueprintImageRow = Database['public']['Tables']['character_blueprint_images']['Row'];

const baseBlueprintRow: BlueprintRow = {
  body_details: {},
  created_at: '2026-05-04T08:00:00.000Z',
  description: null,
  face_details: {},
  gmi_element_error: null,
  gmi_element_id: 'element-1',
  gmi_element_request_id: 'request-1',
  gmi_element_status: 'success',
  gmi_element_updated_at: '2026-05-04T08:01:00.000Z',
  id: 'blueprint-1',
  image_url: 'https://cdn.example.com/hero.png',
  is_favorite: false,
  kind: 'location',
  metadata: {},
  name: 'Neon Bazaar',
  project_id: null,
  prompt_fragment: 'LOCATION ANCHOR: neon bazaar, rain, dense stalls',
  slug: 'neon-bazaar',
  status: 'active',
  style: null,
  style_details: {},
  thumbnail_url: 'https://cdn.example.com/hero-thumb.png',
  traits: {},
  updated_at: '2026-05-04T08:00:00.000Z',
  usage_count: 3,
  user_id: 'user-1',
  visual_prompt: null,
};

describe('characterBlueprintService row mappers', () => {
  it('maps location blueprints with reference metadata and reusable element fields', () => {
    const blueprint = rowToBlueprint(baseBlueprintRow, {
      referenceAssetIds: ['asset-1'],
      referenceImageUrls: ['https://cdn.example.com/reference.png'],
    });

    expect(blueprint.kind).toBe('location');
    expect(blueprint.referenceAssetIds).toEqual(['asset-1']);
    expect(blueprint.referenceImageUrls).toEqual(['https://cdn.example.com/reference.png']);
    expect(blueprint.gmiElementId).toBe('element-1');
  });

  it('preserves legacy environment rows as valid blueprint kinds', () => {
    const blueprint = rowToBlueprint({ ...baseBlueprintRow, kind: 'environment' });

    expect(blueprint.kind).toBe('environment');
  });

  it('maps blueprint image asset linkage', () => {
    const image = rowToImage({
      asset_id: 'asset-1',
      blueprint_id: 'blueprint-1',
      created_at: '2026-05-04T08:02:00.000Z',
      generation_params: null,
      id: 'image-1',
      image_url: 'https://cdn.example.com/reference.png',
      is_primary: true,
      label: 'front reference',
      sort_order: 0,
      variant: null,
    } satisfies BlueprintImageRow);

    expect(image.assetId).toBe('asset-1');
    expect(image.isPrimary).toBe(true);
    expect(image.label).toBe('front reference');
  });
});
