import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(),
  },
}));

import { supabase } from '@/integrations/supabase/client';
import {
  editBlueprintImage,
  rowToBlueprint,
} from '@/services/characterBlueprintService';
import type { Database } from '@/integrations/supabase/types';

type BlueprintRow = Database['public']['Tables']['character_blueprints']['Row'] & Record<string, any>;
type BlueprintImageRow = Database['public']['Tables']['character_blueprint_images']['Row'] & Record<string, any>;

const updatedBlueprintRow: BlueprintRow = {
  body_details: {},
  created_at: '2026-05-04T08:00:00.000Z',
  description: null,
  face_details: {},
  gmi_element_error: null,
  gmi_element_id: null,
  gmi_element_request_id: null,
  gmi_element_status: null,
  gmi_element_updated_at: null,
  id: 'blueprint-1',
  image_url: 'https://cdn.example.com/flannel.png',
  is_favorite: false,
  kind: 'character',
  metadata: {},
  name: 'Mira',
  project_id: null,
  prompt_fragment: 'Mira, cinematic portrait',
  slug: 'mira',
  status: 'active',
  style: null,
  style_details: {},
  thumbnail_url: 'https://cdn.example.com/flannel.png',
  traits: {},
  updated_at: '2026-05-04T08:05:00.000Z',
  usage_count: 0,
  user_id: 'user-1',
  visual_prompt: null,
};

function mockUpdateChain(row: BlueprintRow) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error: null }),
    insert: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    in: vi.fn().mockReturnThis(),
  };
}

function mockInsertChain(row: BlueprintImageRow) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
}

describe('editBlueprintImage', () => {
  it('invokes edit-character-image, updates blueprint image fields, and stores generated reference', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: true,
        edited_image_url: 'https://cdn.example.com/flannel.png',
      },
      error: null,
    } as never);

    const updateChain = mockUpdateChain(updatedBlueprintRow);
    const insertChain = mockInsertChain({
      asset_id: null,
      blueprint_id: 'blueprint-1',
      created_at: '2026-05-04T08:06:00.000Z',
      generation_params: null,
      id: 'image-1',
      image_url: 'https://cdn.example.com/flannel.png',
      is_primary: true,
      label: 'Voice edit: wear a flannel',
      sort_order: 0,
      variant: 'voice-edit',
    });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(updateChain as never)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as never)
      .mockReturnValueOnce(insertChain as never);

    const result = await editBlueprintImage({
      blueprint: rowToBlueprint({
        ...updatedBlueprintRow,
        image_url: 'https://cdn.example.com/original.png',
        thumbnail_url: 'https://cdn.example.com/original.png',
      }),
      editPrompt: 'wear a flannel',
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('edit-character-image', {
      body: {
        character_id: 'blueprint-1',
        source_image_url: 'https://cdn.example.com/original.png',
        edit_prompt: 'wear a flannel',
        style_reference_url: undefined,
        preferred_model: 'gmi/nanobanana-2',
      },
    });
    expect(updateChain.update).toHaveBeenCalledWith({
      image_url: 'https://cdn.example.com/flannel.png',
      thumbnail_url: 'https://cdn.example.com/flannel.png',
    });
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        blueprint_id: 'blueprint-1',
        image_url: 'https://cdn.example.com/flannel.png',
        is_primary: true,
        label: 'Voice edit: wear a flannel',
      }),
    );
    expect(result.blueprint.imageUrl).toBe('https://cdn.example.com/flannel.png');
    expect(result.image.imageUrl).toBe('https://cdn.example.com/flannel.png');
  });
});
