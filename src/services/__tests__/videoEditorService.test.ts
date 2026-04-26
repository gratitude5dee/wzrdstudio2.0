import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LibraryMediaItem } from '@/store/videoEditorStore';

// Mock supabase before importing the service
const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.url' } }),
      }),
    },
  },
}));

// Helper to build chainable query mock
function createQueryMock(data: any[] | null, error: any = null) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: data ? data[0] : null, error }),
    upsert: vi.fn().mockResolvedValue({ error }),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    then: undefined,
  };

  // Make the builder itself resolve to { data, error } when awaited
  const promise = Promise.resolve({ data, error });
  Object.setPrototypeOf(builder, promise);
  builder.then = promise.then.bind(promise);
  builder.catch = promise.catch.bind(promise);

  return builder;
}

describe('videoEditorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMediaLibrary', () => {
    it('aggregates items from media_items, project_assets, generation_outputs, and final_project_assets', async () => {
      // Import after mocks are set up
      const { videoEditorService } = await import('../videoEditorService');

      const mediaItems = [
        {
          id: 'mi-1',
          project_id: 'proj-1',
          media_type: 'image',
          name: 'Uploaded Image',
          url: 'https://storage/img1.png',
          duration_seconds: null,
          source_type: 'uploaded',
          status: 'completed',
          thumbnail_url: 'https://storage/img1-thumb.png',
        },
      ];

      const projectAssets = [
        {
          id: 'pa-1',
          project_id: 'proj-1',
          type: 'video',
          name: 'Studio Output',
          url: 'https://storage/video1.mp4',
          thumbnail_url: null,
        },
      ];

      const generationOutputs = [
        {
          id: 'go-1',
          project_id: 'proj-1',
          output_type: 'image',
          output_url: 'https://storage/gen-img.png',
          prompt: 'A sunset over the ocean with golden light',
          thumbnail_url: null,
        },
      ];

      const finalAssets = [
        {
          id: 'fa-1',
          project_id: 'proj-1',
          asset_type: 'image',
          file_url: 'https://storage/shot1.png',
          name: 'Shot 1',
          duration_ms: 5000,
        },
      ];

      // Set up mock to return different data per table
      mockFrom.mockImplementation((table: string) => {
        switch (table) {
          case 'media_items':
            return createQueryMock(mediaItems);
          case 'project_assets':
            return createQueryMock(projectAssets);
          case 'generation_outputs':
            return createQueryMock(generationOutputs);
          case 'final_project_assets':
            return createQueryMock(finalAssets);
          default:
            return createQueryMock([]);
        }
      });

      const result = await videoEditorService.getMediaLibrary('proj-1');

      expect(result).toHaveLength(4);

      // Verify media_items entry
      const uploaded = result.find((i) => i.id === 'mi-1');
      expect(uploaded).toBeDefined();
      expect(uploaded!.mediaType).toBe('image');
      expect(uploaded!.sourceType).toBe('uploaded');
      expect(uploaded!.name).toBe('Uploaded Image');

      // Verify project_assets entry
      const studioAsset = result.find((i) => i.id === 'pa-1');
      expect(studioAsset).toBeDefined();
      expect(studioAsset!.mediaType).toBe('video');
      expect(studioAsset!.sourceType).toBe('ai-generated');

      // Verify generation_outputs entry
      const genOutput = result.find((i) => i.id === 'go-1');
      expect(genOutput).toBeDefined();
      expect(genOutput!.mediaType).toBe('image');
      expect(genOutput!.sourceType).toBe('ai-generated');
      expect(genOutput!.name).toContain('A sunset over the ocean');

      // Verify final_project_assets entry
      const finalAsset = result.find((i) => i.id === 'fa-1');
      expect(finalAsset).toBeDefined();
      expect(finalAsset!.mediaType).toBe('image');
      expect(finalAsset!.durationSeconds).toBe(5);
      expect(finalAsset!.name).toBe('Shot 1');
    });

    it('deduplicates items with the same URL', async () => {
      const { videoEditorService } = await import('../videoEditorService');

      const sharedUrl = 'https://storage/shared-image.png';

      mockFrom.mockImplementation((table: string) => {
        switch (table) {
          case 'media_items':
            return createQueryMock([
              {
                id: 'mi-dup',
                project_id: 'proj-1',
                media_type: 'image',
                name: 'Image A',
                url: sharedUrl,
                source_type: 'uploaded',
                status: 'completed',
              },
            ]);
          case 'project_assets':
            return createQueryMock([
              {
                id: 'pa-dup',
                project_id: 'proj-1',
                type: 'image',
                name: 'Image B',
                url: sharedUrl,
              },
            ]);
          case 'generation_outputs':
            return createQueryMock([]);
          case 'final_project_assets':
            return createQueryMock([]);
          default:
            return createQueryMock([]);
        }
      });

      const result = await videoEditorService.getMediaLibrary('proj-1');

      // Only one item should exist since both share the same URL
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mi-dup'); // media_items wins (first source)
    });

    it('handles errors gracefully and returns partial results', async () => {
      const { videoEditorService } = await import('../videoEditorService');

      mockFrom.mockImplementation((table: string) => {
        switch (table) {
          case 'media_items':
            return createQueryMock(
              [
                {
                  id: 'mi-ok',
                  project_id: 'proj-1',
                  media_type: 'video',
                  name: 'OK Video',
                  url: 'https://storage/ok.mp4',
                  source_type: 'uploaded',
                  status: 'completed',
                },
              ],
              null
            );
          case 'project_assets':
            return createQueryMock(null, { message: 'table not found' });
          case 'generation_outputs':
            return createQueryMock(null, { message: 'table not found' });
          case 'final_project_assets':
            return createQueryMock(null, { message: 'table not found' });
          default:
            return createQueryMock([]);
        }
      });

      const result = await videoEditorService.getMediaLibrary('proj-1');

      // Should still return the media_items result
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mi-ok');
    });

    it('returns empty array when all sources return errors', async () => {
      const { videoEditorService } = await import('../videoEditorService');

      mockFrom.mockImplementation(() =>
        createQueryMock(null, { message: 'connection error' })
      );

      const result = await videoEditorService.getMediaLibrary('proj-1');
      expect(result).toEqual([]);
    });
  });
});
