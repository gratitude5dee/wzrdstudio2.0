import { describe, expect, it, vi } from 'vitest';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import {
  getRenderWarningsFromProviderPayload,
  runExportFromEditorStore,
  runExportRequest,
  type ExportRenderWarning,
} from '../useExport';

type ExportDependencies = Parameters<typeof runExportRequest>[0];
type ExportContext = Parameters<typeof runExportRequest>[1];
type ExportOptions = Parameters<typeof runExportRequest>[2];

const createContext = (overrides: Partial<ExportContext> = {}): ExportContext => ({
  projectId: 'project-1',
  clips: [
    {
      id: 'clip-1',
      type: 'video',
      name: 'Clip',
      url: 'https://example.com/clip.mp4',
      startTime: 0,
      duration: 3000,
      layer: 0,
      transforms: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
      },
    },
  ],
  audioTracks: [],
  composition: {
    width: 1280,
    height: 720,
    fps: 30,
    aspectRatio: '16:9',
    duration: 3000,
    backgroundColor: '#000000',
  },
  ...overrides,
});

const createOptions = (overrides: Partial<ExportOptions> = {}): ExportOptions => ({
  format: 'mp4',
  quality: 'high',
  ...overrides,
});

const createDeps = (responses: Array<{ data: unknown; error: { message?: string } | null }>) => {
  const invoke = vi.fn(async () => {
    const next = responses.shift();
    if (!next) {
      throw new Error('No mock response queued');
    }
    return next;
  });
  const onProgress = vi.fn();
  const wait = vi.fn(async () => undefined);

  return {
    deps: {
      invoke: invoke as unknown as ExportDependencies['invoke'],
      wait,
      onProgress,
    },
    invoke,
    wait,
    onProgress,
  };
};

describe('runExportRequest', () => {
  it('rejects unsupported formats before invoking Director\'s Cut', async () => {
    const { deps, invoke } = createDeps([]);

    const result = await runExportRequest(
      deps,
      createContext(),
      createOptions({ format: 'webm' })
    );

    expect(result.error).toBe('Director\'s Cut export currently renders MP4.');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects timelines whose visual clips cannot be fetched by remote renderers', async () => {
    const { deps, invoke } = createDeps([]);

    const result = await runExportRequest(
      deps,
      createContext({
        clips: [
          {
            ...createContext().clips[0],
            url: 'blob:http://localhost/clip',
          },
        ],
      }),
      createOptions()
    );

    expect(result.error).toBe('Add at least one visual clip with a public HTTP(S) URL before exporting.');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('creates and polls a Director\'s Cut export job', async () => {
    const warning: ExportRenderWarning = {
      assetId: 'clip-1',
      orderIndex: 0,
      features: ['effect', 'keyframe'],
      reason: 'FAL compose renders timing and media URLs only.',
    };
    const { deps, invoke, onProgress, wait } = createDeps([
      { data: { jobId: 'job-1', progress: 5 }, error: null },
      { data: { status: 'processing', progress: 45 }, error: null },
      {
        data: {
          status: 'completed',
          progress: 100,
          outputUrl: 'https://example.com/final.mp4',
          providerPayload: { renderWarnings: [warning] },
        },
        error: null,
      },
    ]);

    const result = await runExportRequest(deps, createContext(), createOptions());

    expect(result).toEqual({
      url: 'https://example.com/final.mp4',
      renderWarnings: [warning],
    });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenNthCalledWith(1, 'director-cut', {
      body: {
        action: 'create',
        projectId: 'project-1',
        settings: {
          resolution: '1280x720',
          fps: 30,
          quality: 'high',
          includeAudio: true,
          codec: 'h264',
          renderBackend: 'fal_remote',
        },
      },
    });
    expect(wait).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(5);
    expect(onProgress).toHaveBeenCalledWith(45);
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it('can request the Remotion worker backend', async () => {
    const { deps, invoke } = createDeps([
      { data: { jobId: 'job-1', progress: 5, provider: 'remotion_worker' }, error: null },
      {
        data: {
          status: 'completed',
          progress: 100,
          outputUrl: 'https://example.com/styled.mp4',
          provider: 'remotion_worker',
        },
        error: null,
      },
    ]);

    await expect(
      runExportRequest(
        deps,
        createContext(),
        createOptions({ renderBackend: 'remotion_worker' })
      )
    ).resolves.toEqual({
      url: 'https://example.com/styled.mp4',
      renderWarnings: [],
    });

    expect(invoke).toHaveBeenNthCalledWith(1, 'director-cut', {
      body: {
        action: 'create',
        projectId: 'project-1',
        settings: expect.objectContaining({
          renderBackend: 'remotion_worker',
        }),
      },
    });
  });

  it('returns provider errors from job creation and failed status polling', async () => {
    const createFailure = createDeps([{ data: null, error: { message: 'Create failed' } }]);

    await expect(
      runExportRequest(createFailure.deps, createContext(), createOptions())
    ).resolves.toEqual({ error: 'Create failed' });

    const statusFailure = createDeps([
      { data: { jobId: 'job-1', progress: 5 }, error: null },
      { data: { status: 'failed', progress: 20, error: 'Render failed' }, error: null },
    ]);

    await expect(
      runExportRequest(statusFailure.deps, createContext(), createOptions())
    ).resolves.toEqual({ error: 'Render failed' });
  });

  it('requires completed jobs to include a downloadable URL', async () => {
    const { deps } = createDeps([
      { data: { jobId: 'job-1', progress: 5 }, error: null },
      { data: { status: 'completed', progress: 100 }, error: null },
    ]);

    await expect(runExportRequest(deps, createContext(), createOptions())).resolves.toEqual({
      error: 'Export completed without a downloadable URL.',
    });
  });
});

describe('runExportFromEditorStore', () => {
  it('preserves the selected render backend from the editor store wrapper', async () => {
    const context = createContext();
    useVideoEditorStore.setState({
      project: {
        id: 'project-1',
        name: 'Project 1',
        duration: 3000,
        fps: 30,
        resolution: { width: 1280, height: 720 },
        transforms: {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
      },
      clips: context.clips,
      audioTracks: context.audioTracks,
      composition: context.composition,
    });
    expect(useVideoEditorStore.getState().project.id).toBe('project-1');
    expect(useVideoEditorStore.getState().clips).toHaveLength(1);

    const { deps, invoke } = createDeps([
      { data: { jobId: 'job-1', progress: 5, provider: 'remotion_worker' }, error: null },
      {
        data: {
          status: 'completed',
          progress: 100,
          outputUrl: 'https://example.com/styled.mp4',
          provider: 'remotion_worker',
          providerPayload: { renderWarnings: [] },
        },
        error: null,
      },
    ]);

    await expect(
      runExportFromEditorStore(deps, {
        format: 'mp4',
        quality: 'high',
        renderBackend: 'remotion_worker',
      })
    ).resolves.toEqual({
      url: 'https://example.com/styled.mp4',
      renderWarnings: [],
    });

    expect(invoke).toHaveBeenNthCalledWith(1, 'director-cut', {
      body: {
        action: 'create',
        projectId: 'project-1',
        settings: expect.objectContaining({
          renderBackend: 'remotion_worker',
        }),
      },
    });
  });
});

describe('getRenderWarningsFromProviderPayload', () => {
  it('returns only well-formed render warnings from provider payloads', () => {
    const warning: ExportRenderWarning = {
      assetId: 'clip-1',
      orderIndex: 0,
      features: ['transform'],
      reason: 'Unsupported transform.',
    };

    expect(
      getRenderWarningsFromProviderPayload({
        renderWarnings: [
          warning,
          null,
          { assetId: 'bad', orderIndex: '0', features: ['effect'], reason: 'bad' },
        ],
      })
    ).toEqual([warning]);
  });
});
