import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase before importing the service
const mockFrom = vi.fn();
type QueryMockError = { message?: string } | null;
type QueryMockBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  then?: Promise<{ data: unknown[] | null; error: QueryMockError }>['then'];
  catch?: Promise<{ data: unknown[] | null; error: QueryMockError }>['catch'];
};
type QueryMockOptions = {
  onInsert?: (values: unknown) => void;
  onUpdate?: (values: unknown) => void;
  onDelete?: () => void;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
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
function createQueryMock(
  data: unknown[] | null,
  error: QueryMockError = null,
  options: QueryMockOptions = {}
) {
  const builder: QueryMockBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: data ? data[0] : null, error }),
    single: vi.fn().mockResolvedValue({ data: data ? data[0] : null, error }),
    update: vi.fn((values: unknown) => {
      options.onUpdate?.(values);
      return builder;
    }),
    upsert: vi.fn().mockResolvedValue({ error }),
    insert: vi.fn((values: unknown) => {
      options.onInsert?.(values);
      return builder;
    }),
    delete: vi.fn(() => {
      options.onDelete?.();
      return builder;
    }),
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
    it('skips Supabase asset queries for the local dev auth bypass project', async () => {
      vi.stubEnv('VITE_BYPASS_AUTH_FOR_TESTS', 'true');
      try {
        const { videoEditorService } = await import('../videoEditorService');

        await expect(videoEditorService.getMediaLibrary('local-editor')).resolves.toEqual([]);
        expect(mockFrom).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });

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
        {
          id: 'pa-2',
          project_id: 'proj-1',
          asset_type: 'video',
          original_file_name: 'Cached Studio Output.mp4',
          cdn_url: 'https://cdn.example.com/cached.mp4',
          thumbnail_url: 'https://cdn.example.com/cached-thumb.jpg',
          preview_url: 'https://cdn.example.com/cached-preview.mp4',
          media_metadata: { duration_ms: 12000, width: 1920, height: 1080 },
          asset_category: 'generated',
          processing_status: 'completed',
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

      expect(result).toHaveLength(5);

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

      // Verify asset-management schema entry with cached metadata
      const cachedAsset = result.find((i) => i.id === 'pa-2');
      expect(cachedAsset).toBeDefined();
      expect(cachedAsset!.name).toBe('Cached Studio Output.mp4');
      expect(cachedAsset!.url).toBe('https://cdn.example.com/cached.mp4');
      expect(cachedAsset!.thumbnailUrl).toBe('https://cdn.example.com/cached-thumb.jpg');
      expect(cachedAsset!.previewUrl).toBe('https://cdn.example.com/cached-preview.mp4');
      expect(cachedAsset!.durationSeconds).toBe(12);
      expect(cachedAsset!.mediaMetadata?.width).toBe(1920);

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

  describe('syncTimelineAssetsForDirectorCut', () => {
    it('writes timeline assets with cached preview, thumbnail, media metadata, and keyframes', async () => {
      const { videoEditorService } = await import('../videoEditorService');
      const insertedRows: unknown[] = [];

      mockFrom.mockImplementation((table: string) => {
        switch (table) {
          case 'timelines':
            return createQueryMock([
              {
                id: 'timeline-1',
                project_id: 'proj-1',
                user_id: 'test-user',
                duration_ms: 5000,
                resolution: '1920x1080',
                frame_rate: 30,
                composition_data: {
                  clips: [
                    {
                      id: 'clip-1',
                      mediaItemId: 'asset-1',
                      type: 'video',
                      name: 'Styled Clip',
                      url: 'https://storage.example.com/source.mp4',
                      thumbnailUrl: 'https://storage.example.com/source-thumb.jpg',
                      previewUrl: 'https://storage.example.com/source-preview.mp4',
                      mediaMetadata: { duration_ms: 5000, width: 1920, height: 1080 },
                      startTime: 0,
                      duration: 5000,
                      endTime: 5000,
                      layer: 0,
                      trimStart: 500,
                      transforms: {
                        position: { x: 10, y: 0 },
                        scale: { x: 1, y: 1 },
                        rotation: 0,
                        opacity: 1,
                      },
                    },
                  ],
                  audioTracks: [
                    {
                      id: 'audio-1',
                      type: 'audio',
                      name: 'Voiceover main',
                      url: 'https://storage.example.com/voice.mp3',
                      previewUrl: 'https://storage.example.com/voice-preview.mp3',
                      mediaMetadata: { duration_ms: 5000, sample_rate: 44100 },
                      startTime: 0,
                      duration: 5000,
                      endTime: 5000,
                      volume: 0.8,
                      isMuted: false,
                    },
                  ],
                  keyframes: [
                    {
                      id: 'kf-1',
                      targetId: 'clip-1',
                      time: 1000,
                      properties: {
                        transforms: {
                          position: { x: 50, y: 0 },
                          scale: { x: 1, y: 1 },
                          rotation: 0,
                          opacity: 1,
                        },
                      },
                    },
                  ],
                  composition: {
                    width: 1920,
                    height: 1080,
                    fps: 30,
                    aspectRatio: '16:9',
                    duration: 5000,
                    backgroundColor: '#000000',
                  },
                },
              },
            ]);
          case 'timeline_assets':
            return createQueryMock([], null, {
              onInsert: (values) => insertedRows.push(values),
            });
          default:
            return createQueryMock([]);
        }
      });

      const summary = await videoEditorService.syncTimelineAssetsForDirectorCut('proj-1');
      const rows = insertedRows[0] as Array<{ asset_type: string; metadata: Record<string, unknown> }>;
      const visual = rows[0];
      const audio = rows[1];

      expect(summary.syncedAssets).toBe(2);
      expect(visual.asset_type).toBe('video');
      expect(visual.metadata.thumbnail_url).toBe('https://storage.example.com/source-thumb.jpg');
      expect(visual.metadata.preview_url).toBe('https://storage.example.com/source-preview.mp4');
      expect(visual.metadata.media_metadata).toEqual({ duration_ms: 5000, width: 1920, height: 1080 });
      expect(visual.metadata.keyframes).toHaveLength(1);
      expect(audio.asset_type).toBe('audio');
      expect(audio.metadata.asset_role).toBe('voiceover');
      expect(audio.metadata.preview_url).toBe('https://storage.example.com/voice-preview.mp3');
      expect(audio.metadata.media_metadata).toEqual({ duration_ms: 5000, sample_rate: 44100 });
    });
  });
});
