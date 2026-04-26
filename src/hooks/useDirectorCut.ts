import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const POLL_INTERVAL_MS = 2000;

export interface DirectorCutSummary {
  totalShots: number;
  syncedAssets: number;
  readyVideos: number;
  fallbackImages: number;
  missingShots: number;
}

/**
 * Pipeline stages for the Director's Cut flow.
 * These correspond to `provider_payload.stage` values from the edge function.
 */
export type DirectorCutStage =
  | 'idle'
  | 'syncing_assets'
  | 'submitting_to_provider'
  | 'provider_processing'
  | 'downloading_assets'
  | 'uploading_final_video'
  | 'completed';

export const STAGE_LABELS: Record<DirectorCutStage, string> = {
  idle: 'Idle',
  syncing_assets: 'Syncing timeline assets',
  submitting_to_provider: 'Submitting to provider',
  provider_processing: 'Provider processing',
  downloading_assets: 'Downloading assets',
  uploading_final_video: 'Uploading final video',
  completed: 'Completed',
};

export interface ShotFailureInfo {
  assetId: string;
  orderIndex: number;
  reason: string;
}

export interface DirectorCutJobState {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage: DirectorCutStage;
  outputUrl?: string | null;
  error?: string | null;
  provider?: string | null;
  providerStatus?: string | null;
  fallbackUsed?: boolean;
  providerPayload?: Record<string, unknown> | null;
  shotFailures?: ShotFailureInfo[];
  partialSuccess?: boolean;
}

const clampProgress = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export function useDirectorCut(projectId: string | undefined) {
  const [summary, setSummary] = useState<DirectorCutSummary | null>(null);
  const [job, setJob] = useState<DirectorCutJobState | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const getStatus = useCallback(
    async (jobId: string) => {
      if (!projectId) return null;
      const { data, error: invokeError } = await supabase.functions.invoke('director-cut', {
        body: {
          action: 'status',
          projectId,
          jobId,
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message || "Failed to poll Director's Cut status");
      }

      return data as {
        status: string;
        progress: number;
        outputUrl?: string | null;
        error?: string | null;
        provider?: string | null;
        providerStatus?: string | null;
        fallbackUsed?: boolean;
        providerPayload?: Record<string, unknown> | null;
      } | null;
    },
    [projectId]
  );

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      setIsPolling(true);

      const poll = async () => {
        try {
          const statusData = await getStatus(jobId);
          if (!statusData) return;

          const payload = statusData.providerPayload ?? {};
          const nextState: DirectorCutJobState = {
            jobId,
            status: statusData.status as DirectorCutJobState['status'],
            progress: clampProgress(statusData.progress ?? 0),
            stage: (payload.stage as DirectorCutStage) ?? 'provider_processing',
            outputUrl: statusData.outputUrl ?? null,
            error: statusData.error ?? null,
            provider: statusData.provider ?? null,
            providerStatus: statusData.providerStatus ?? null,
            fallbackUsed: statusData.fallbackUsed ?? false,
            providerPayload: statusData.providerPayload ?? null,
            shotFailures: (payload.shotFailures as ShotFailureInfo[] | undefined) ?? [],
            partialSuccess: !!payload.partialSuccess,
          };
          setJob(nextState);

          if (nextState.status === 'completed') {
            stopPolling();
            if (nextState.partialSuccess && nextState.shotFailures && nextState.shotFailures.length > 0) {
              toast.success(
                `Director's Cut is ready (${nextState.shotFailures.length} shot(s) skipped due to errors)`
              );
            } else {
              toast.success("Director's Cut is ready");
            }
          } else if (nextState.status === 'failed') {
            stopPolling();
            setError(nextState.error || "Director's Cut failed");
            toast.error(nextState.error || "Director's Cut failed");
          }
        } catch (pollError) {
          console.error("Director's Cut polling error:", pollError);
        }
      };

      poll().catch(() => undefined);
      pollTimerRef.current = window.setInterval(() => {
        poll().catch(() => undefined);
      }, POLL_INTERVAL_MS);
    },
    [getStatus, stopPolling]
  );

  const syncAssets = useCallback(async () => {
    if (!projectId) return null;
    setIsSyncing(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('director-cut', {
        body: {
          action: 'sync',
          projectId,
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message || 'Failed to sync timeline assets');
      }

      const nextSummary: DirectorCutSummary = {
        totalShots: data?.summary?.totalShots ?? 0,
        syncedAssets: data?.summary?.syncedAssets ?? 0,
        readyVideos: data?.summary?.readyVideos ?? 0,
        fallbackImages: data?.summary?.fallbackImages ?? 0,
        missingShots: data?.summary?.missingShots ?? 0,
      };

      setSummary(nextSummary);
      toast.success("Timeline assets synced for Director's Cut");
      return nextSummary;
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Failed to sync timeline assets';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [projectId]);

  const startDirectorCut = useCallback(async () => {
    if (!projectId) return null;
    setIsStarting(true);
    setError(null);

    try {
      let ensuredSummary = summary;
      if (!ensuredSummary) {
        ensuredSummary = await syncAssets();
      }

      if (!ensuredSummary) {
        return null;
      }

      if (ensuredSummary.syncedAssets === 0) {
        throw new Error("No timeline assets available. Add shots before starting Director's Cut.");
      }

      const { data, error: invokeError } = await supabase.functions.invoke('director-cut', {
        body: {
          action: 'create',
          projectId,
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message || "Failed to start Director's Cut");
      }

      const jobId = data?.jobId as string | undefined;
      if (!jobId) {
        throw new Error("Director's Cut did not return a job ID");
      }

      const initialJob: DirectorCutJobState = {
        jobId,
        status: 'processing',
        progress: clampProgress(data?.progress ?? 5),
        stage: 'syncing_assets',
        provider: data?.provider ?? 'fal',
        providerStatus: data?.providerStatus ?? 'queued',
        fallbackUsed: !!data?.fallbackUsed,
        outputUrl: null,
        providerPayload: null,
        shotFailures: [],
        partialSuccess: false,
      };
      setJob(initialJob);
      startPolling(jobId);
      toast.info("Director's Cut started");
      return initialJob;
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : "Failed to start Director's Cut";
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [projectId, startPolling, summary, syncAssets]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return {
    summary,
    job,
    error,
    isSyncing,
    isStarting,
    isPolling,
    syncAssets,
    startDirectorCut,
    refreshStatus: () => (job ? getStatus(job.jobId) : Promise.resolve(null)),
    stopPolling,
  };
}

export default useDirectorCut;
