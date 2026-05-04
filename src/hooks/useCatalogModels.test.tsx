import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke,
    },
  },
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast }),
}));

import { useCatalogModels } from './useCatalogModels';

describe('useCatalogModels', () => {
  beforeEach(() => {
    invoke.mockReset();
    toast.mockReset();
    invoke.mockResolvedValue({
      data: {
        total: 42,
        models: [
          {
            id: 'fal-ai/nano-banana-2/edit',
            name: 'Nano Banana 2 Edit',
            description: 'Image editing model',
            category: 'image-to-image',
            media_type: 'image',
            workflow_type: 'image-to-image',
            ui_group: 'advanced',
            supports: ['prompt', 'image_urls'],
            defaults: {},
            controls: [],
            aliases: ['nano-banana-edit'],
            provider: 'fal-ai',
            provider_label: 'fal.ai',
            endpoint_id: 'fal-ai/nano-banana-2/edit',
            tags: ['edit'],
          },
        ],
      },
      error: null,
    });
  });

  it('sends search, paging, advanced, and workflow filters to the catalog function', async () => {
    const { result } = renderHook(() => useCatalogModels({
      mediaType: 'image',
      provider: 'fal-ai',
      studioSurface: 'studio:image',
      includeAdvanced: true,
      search: 'nano banana edit',
      limit: 250,
      offset: 0,
      workflowTypes: ['text-to-image', 'image-to-image'],
    }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('model-catalog', {
        body: expect.objectContaining({
          media_type: 'image',
          provider: 'fal-ai',
          studio_surface: 'studio:image',
          includeAdvanced: true,
          diagnostics: true,
          search: 'nano banana edit',
          limit: 250,
          offset: 0,
          workflow_types: ['text-to-image', 'image-to-image'],
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.models).toHaveLength(1);
      expect(result.current.total).toBe(42);
    });
  });

  it('normalizes Fal provider aliases before invoking the catalog function', async () => {
    renderHook(() => useCatalogModels({
      mediaType: 'image',
      provider: 'fal.ai',
      studioSurface: 'studio:image',
    }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('model-catalog', {
        body: expect.objectContaining({
          provider: 'fal-ai',
          diagnostics: true,
        }),
      });
    });
  });
});
