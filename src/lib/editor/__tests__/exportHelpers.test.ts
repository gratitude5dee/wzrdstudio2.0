import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFalTracks,
  ExportProcessingError,
  exportAssetToEditframeAsset,
  extractVideoUrl,
  processAssetsRemote,
  type ExportAsset,
} from '../../../../supabase/functions/_shared/export-helpers';
import { buildMixedDirectorCutExportAssets } from './exportFixtures';

describe('extractVideoUrl', () => {
  it('reads common fal top-level output shapes', () => {
    expect(extractVideoUrl({ video_url: 'https://cdn.example.com/direct.mp4' }))
      .toBe('https://cdn.example.com/direct.mp4');
    expect(extractVideoUrl({ output_url: 'https://cdn.example.com/output.mp4' }))
      .toBe('https://cdn.example.com/output.mp4');
  });

  it('reads nested video and file object output shapes', () => {
    expect(extractVideoUrl({ video: { url: 'https://cdn.example.com/video.mp4' } }))
      .toBe('https://cdn.example.com/video.mp4');
    expect(extractVideoUrl({ data: { file: { url: 'https://cdn.example.com/file.mp4' } } }))
      .toBe('https://cdn.example.com/file.mp4');
  });

  it('ignores non-output strings and missing URLs', () => {
    expect(extractVideoUrl({ response_url: 'https://queue.fal.run/result' })).toBeNull();
    expect(extractVideoUrl({ data: { video: { url: '/relative/output.mp4' } } })).toBeNull();
    expect(extractVideoUrl({ data: { logs: ['done'] } })).toBeNull();
  });
});

describe('processAssetsRemote', () => {
  const originalFetch = globalThis.fetch;
  const updates: Array<Record<string, unknown>> = [];
  const uploadMock = vi.fn(async () => ({ error: null }));

  const supabaseAdmin = {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(patch);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: () => ({ data: { publicUrl: 'https://storage.example.com/final.mp4' } }),
      }),
    },
  };

  beforeEach(() => {
    updates.length = 0;
    uploadMock.mockClear();
    (globalThis as unknown as { Deno: unknown }).Deno = {
      env: {
        get: (key: string) => key === 'FAL_KEY' ? 'fal-key' : undefined,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete (globalThis as unknown as { Deno?: unknown }).Deno;
    delete (globalThis as { __WZRD_EDITFRAME_API__?: unknown }).__WZRD_EDITFRAME_API__;
  });

  function responseJson(body: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  }

  function mp4Response() {
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'video/mp4' },
    });
  }

  it('uses one fal compose job for image timelines', async () => {
    const requests: Array<{ url: string; input?: Record<string, unknown> }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      if (url.includes('/fal-ai/ffmpeg-api/compose')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        requests.push({ url, input: body });
        return responseJson({
          request_id: 'compose-request',
          status_url: 'https://queue.fal.run/compose-status',
          response_url: 'https://queue.fal.run/compose-result',
        });
      }
      if (url.startsWith('https://queue.fal.run/compose-status')) {
        return responseJson({ status: 'COMPLETED' });
      }
      if (url === 'https://queue.fal.run/compose-result') {
        return responseJson({ video_url: 'https://cdn.example.com/composed.mp4' });
      }
      if (url === 'https://cdn.example.com/composed.mp4') return mp4Response();
      throw new Error(`Unexpected fetch ${url}`);
    }) as typeof fetch;

    const assets: ExportAsset[] = Array.from({ length: 14 }, (_, index) => ({
      id: `image-${index}`,
      type: 'image',
      url: `https://cdn.example.com/image-${index}.jpg`,
      duration_ms: 5000,
      order_index: index,
    }));

    const result = await processAssetsRemote(
      supabaseAdmin,
      'project-1',
      assets,
      'job-1',
      'final-exports',
      { includeAudio: false },
      'user-1'
    );

    const composeRequest = requests.find((request) => request.url.includes('compose'));
    const tracks = (composeRequest?.input?.tracks ?? []) as unknown[];
    expect(result.provider).toBe('fal_remote');
    expect(result.publicUrl).toBe('https://storage.example.com/final.mp4');
    expect(tracks).toHaveLength(14);
    expect(requests.some((request) => request.url.includes('merge-videos'))).toBe(false);
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/project-1\/job-1\/final_export_\d+\.mp4$/),
      expect.any(Uint8Array),
      { contentType: 'video/mp4', upsert: true }
    );
  });

  it('uses fal merge-videos for pure sequential video timelines', async () => {
    const requests: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      if (url.includes('/fal-ai/ffmpeg-api/merge-videos')) {
        requests.push(url);
        return responseJson({
          request_id: 'merge-request',
          status_url: 'https://queue.fal.run/merge-status',
          response_url: 'https://queue.fal.run/merge-result',
        });
      }
      if (url.startsWith('https://queue.fal.run/merge-status')) {
        return responseJson({ status: 'COMPLETED' });
      }
      if (url === 'https://queue.fal.run/merge-result') {
        return responseJson({ video: { url: 'https://cdn.example.com/merged.mp4' } });
      }
      if (url === 'https://cdn.example.com/merged.mp4') return mp4Response();
      throw new Error(`Unexpected fetch ${url}`);
    }) as typeof fetch;

    const result = await processAssetsRemote(
      supabaseAdmin,
      'project-1',
      [
        { id: 'video-1', type: 'video', url: 'https://cdn.example.com/1.mp4', duration_ms: 5000, order_index: 0 },
        { id: 'video-2', type: 'video', url: 'https://cdn.example.com/2.mp4', duration_ms: 5000, order_index: 1 },
      ],
      'job-2',
      'final-exports',
      { includeAudio: false }
    );

    expect(result.providerPayload.renderer).toBe('fal-ai/ffmpeg-api/merge-videos');
    expect(requests).toHaveLength(1);
  });

  it('reports fal failure and unavailable Editframe fallback clearly', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      if (url.includes('/fal-ai/ffmpeg-api/compose')) {
        return responseJson({
          request_id: 'failed-compose',
          status_url: 'https://queue.fal.run/failed-compose-status',
        });
      }
      if (url.startsWith('https://queue.fal.run/failed-compose-status')) {
        return responseJson({ status: 'FAILED', logs: [{ message: 'bad source' }] });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as typeof fetch;

    await expect(processAssetsRemote(
      supabaseAdmin,
      'project-1',
      [{ id: 'image-1', type: 'image', url: 'https://cdn.example.com/image.jpg', duration_ms: 5000, order_index: 0 }],
      'job-3',
      'final-exports',
      { includeAudio: false }
    )).rejects.toMatchObject({
      name: 'ExportProcessingError',
      providerPayload: {
        fallbackStatus: 'unavailable',
        fallbackError: 'EDITFRAME_API_KEY is not configured',
        falRequestId: 'failed-compose',
      },
    } satisfies Partial<ExportProcessingError>);
    expect(updates.some((patch) => patch.provider_job_id === 'failed-compose')).toBe(true);
  });

  it('reports fal failure and Editframe render failure separately', async () => {
    (globalThis as unknown as { Deno: unknown }).Deno = {
      env: {
        get: (key: string) => {
          if (key === 'FAL_KEY') return 'fal-key';
          if (key === 'EDITFRAME_API_KEY') return 'editframe-key';
          return undefined;
        },
      },
    };
    (globalThis as {
      __WZRD_EDITFRAME_API__?: unknown;
    }).__WZRD_EDITFRAME_API__ = {
      Client: class {
        constructor(public key: string) {}
      },
      createRender: vi.fn(async () => {
        throw new Error('render rejected');
      }),
      getRenderProgress: vi.fn(),
      downloadRender: vi.fn(),
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      if (url.includes('/fal-ai/ffmpeg-api/compose')) {
        return responseJson({
          request_id: 'failed-compose-render',
          status_url: 'https://queue.fal.run/failed-compose-render-status',
        });
      }
      if (url.startsWith('https://queue.fal.run/failed-compose-render-status')) {
        return responseJson({ status: 'FAILED', logs: [{ message: 'bad source' }] });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as typeof fetch;

    await expect(processAssetsRemote(
      supabaseAdmin,
      'project-1',
      [{ id: 'image-1', type: 'image', url: 'https://cdn.example.com/image.jpg', duration_ms: 5000, order_index: 0 }],
      'job-4',
      'final-exports',
      { includeAudio: false }
    )).rejects.toMatchObject({
      name: 'ExportProcessingError',
      message: expect.stringContaining('Editframe fallback failed: render rejected'),
      providerPayload: {
        fallbackStatus: 'failed',
        fallbackError: 'render rejected',
        falRequestId: 'failed-compose-render',
        falError: expect.stringContaining('bad source'),
      },
    });
  });

  it('rejects invalid fal compose tracks before provider submission', async () => {
    const requests: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      throw new Error(`Unexpected fetch ${url}`);
    }) as typeof fetch;

    await expect(processAssetsRemote(
      supabaseAdmin,
      'project-1',
      [{ id: 'image-1', type: 'image', url: 'https://cdn.example.com/image.jpg', duration_ms: 0, order_index: 0 }],
      'job-5',
      'final-exports',
      { includeAudio: false }
    )).rejects.toMatchObject({
      name: 'ExportProcessingError',
      message: 'Fal input validation failed before provider submission',
      providerPayload: {
        renderer: 'fal_input_validation',
        targetRenderer: 'fal-ai/ffmpeg-api/compose',
        failedShotCount: 1,
      },
    });

    expect(requests.some((url) => url.includes('queue.fal.run'))).toBe(false);
    expect(updates.some((patch) => (patch.provider_payload as Record<string, unknown>)?.renderer === 'fal_input_validation')).toBe(true);
  });
});

describe('fal and Editframe export fixtures', () => {
  it('maps a mixed Director\'s Cut timeline to deterministic fal tracks', () => {
    const assets = buildMixedDirectorCutExportAssets();
    const visualAssets = assets.filter((asset) => asset.type === 'image' || asset.type === 'video');
    const audioAssets = assets.filter((asset) => asset.type === 'audio');
    const tracks = buildFalTracks(visualAssets, audioAssets);

    expect(tracks).toMatchObject([
      {
        id: 'visual-0',
        type: 'image',
        keyframes: [{ timestamp: 0, duration: 4200 }],
      },
      {
        id: 'visual-1',
        type: 'video',
        keyframes: [{ timestamp: 4200, duration: 5200 }],
      },
      {
        id: 'voiceover-0',
        type: 'audio',
        keyframes: [{ timestamp: 0, duration: 8000 }],
      },
    ]);
  });

  it('preserves trims, transforms, transitions, effects, and audio fades for Editframe fallback', () => {
    const assets = buildMixedDirectorCutExportAssets().map(exportAssetToEditframeAsset);

    expect(assets[0]).toMatchObject({
      id: 'shot-image-1',
      type: 'image',
      startMs: 0,
      transforms: { scale: { x: 1.05, y: 1.05 }, opacity: 0.92 },
      effects: [{ id: 'brightness', params: { value: 108 } }],
      transition: { type: 'dissolve', duration: 450 },
    });
    expect(assets[1]).toMatchObject({
      type: 'video',
      trimStartMs: 800,
      trimEndMs: 6000,
      transition: { type: 'slide', duration: 300, direction: 'left' },
    });
    expect(assets[3]).toMatchObject({
      type: 'audio',
      volume: 0.84,
      fadeInMs: 300,
      fadeOutMs: 500,
    });
  });
});
