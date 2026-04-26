import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDirectorCut } from '@/hooks/useDirectorCut';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

describe('useDirectorCut', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.info.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs then starts and polls a director cut job to completion', async () => {
    let statusCalls = 0;
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      const action = args.body.action;
      if (action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 5,
              syncedAssets: 5,
              readyVideos: 3,
              fallbackImages: 2,
              missingShots: 0,
            },
          },
          error: null,
        };
      }

      if (action === 'create') {
        return {
          data: {
            jobId: 'job-1',
            progress: 8,
            provider: 'fal',
            providerStatus: 'queued',
            fallbackUsed: false,
          },
          error: null,
        };
      }

      if (action === 'status') {
        statusCalls += 1;
        if (statusCalls === 1) {
          return {
            data: {
              status: 'processing',
              progress: 52,
              provider: 'fal',
              providerStatus: 'IN_PROGRESS',
              providerPayload: { stage: 'provider_processing' },
              fallbackUsed: false,
            },
            error: null,
          };
        }
        return {
          data: {
            status: 'completed',
            progress: 100,
            outputUrl: 'https://cdn.example.com/final.mp4',
            provider: 'fal',
            providerStatus: 'COMPLETED',
            providerPayload: { stage: 'completed' },
            fallbackUsed: false,
          },
          error: null,
        };
      }

      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      await result.current.startDirectorCut();
    });

    // After startDirectorCut resolves, the first immediate poll has already run,
    // so the stage reflects the first status poll's provider_payload.stage.
    expect(result.current.job?.status).toBe('processing');
    expect(result.current.job?.jobId).toBe('job-1');
    expect(result.current.job?.stage).toBe('provider_processing');

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.job?.status).toBe('completed');
    expect(result.current.job?.outputUrl).toBe('https://cdn.example.com/final.mp4');
    expect(result.current.job?.stage).toBe('completed');
    expect(result.current.isPolling).toBe(false);
  });

  it('surfaces sync errors', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'sync failed' },
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      const response = await result.current.syncAssets();
      expect(response).toBeNull();
    });

    expect(result.current.error).toBe('sync failed');
  });

  it('extracts stage from provider payload during polling', async () => {
    let statusCalls = 0;
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      const action = args.body.action;
      if (action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 3,
              syncedAssets: 3,
              readyVideos: 3,
              fallbackImages: 0,
              missingShots: 0,
            },
          },
          error: null,
        };
      }

      if (action === 'create') {
        return {
          data: { jobId: 'job-stages', progress: 5, provider: 'fal', providerStatus: 'queued' },
          error: null,
        };
      }

      if (action === 'status') {
        statusCalls += 1;
        if (statusCalls === 1) {
          return {
            data: {
              status: 'processing',
              progress: 20,
              providerPayload: { stage: 'submitting_to_provider' },
            },
            error: null,
          };
        }
        if (statusCalls === 2) {
          return {
            data: {
              status: 'processing',
              progress: 50,
              providerPayload: { stage: 'provider_processing' },
            },
            error: null,
          };
        }
        return {
          data: {
            status: 'completed',
            progress: 100,
            outputUrl: 'https://cdn.example.com/final.mp4',
            providerPayload: { stage: 'completed' },
          },
          error: null,
        };
      }

      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      await result.current.startDirectorCut();
    });

    // The first immediate poll has already run, so stage is 'submitting_to_provider'
    expect(result.current.job?.stage).toBe('submitting_to_provider');

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.job?.stage).toBe('provider_processing');

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.job?.stage).toBe('completed');
    expect(result.current.job?.status).toBe('completed');
  });

  it('reports partial success with shot failures', async () => {
    let statusCalls = 0;
    const shotFailures = [
      { assetId: 'asset-2', orderIndex: 1, reason: 'Download failed: 404 Not Found' },
    ];

    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      const action = args.body.action;
      if (action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 4,
              syncedAssets: 4,
              readyVideos: 2,
              fallbackImages: 2,
              missingShots: 0,
            },
          },
          error: null,
        };
      }

      if (action === 'create') {
        return {
          data: { jobId: 'job-partial', progress: 5, provider: 'fal' },
          error: null,
        };
      }

      if (action === 'status') {
        statusCalls += 1;
        if (statusCalls === 1) {
          return {
            data: {
              status: 'completed',
              progress: 100,
              outputUrl: 'https://cdn.example.com/partial.mp4',
              providerPayload: {
                stage: 'completed',
                partialSuccess: true,
                shotFailures,
                failedShotCount: 1,
                totalShots: 4,
              },
            },
            error: null,
          };
        }
        return { data: {}, error: null };
      }

      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      await result.current.startDirectorCut();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.job?.status).toBe('completed');
    expect(result.current.job?.outputUrl).toBe('https://cdn.example.com/partial.mp4');
    expect(result.current.job?.partialSuccess).toBe(true);
    expect(result.current.job?.shotFailures).toHaveLength(1);
    expect(result.current.job?.shotFailures?.[0].assetId).toBe('asset-2');
    expect(result.current.job?.shotFailures?.[0].reason).toBe('Download failed: 404 Not Found');

    // Verify partial success toast
    expect(toastMock.success).toHaveBeenCalledWith(
      expect.stringContaining('1 shot(s) skipped')
    );
  });

  it('does not start when no synced assets', async () => {
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      if (args.body.action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 3,
              syncedAssets: 0,
              readyVideos: 0,
              fallbackImages: 0,
              missingShots: 3,
            },
          },
          error: null,
        };
      }
      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      const response = await result.current.startDirectorCut();
      expect(response).toBeNull();
    });

    expect(result.current.error).toBe(
      "No timeline assets available. Add shots before starting Director's Cut."
    );
  });
});
