import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const POLL_INTERVAL_MS = 2000;

export interface DirectorCutSummary {
  totalShots: number;
  syncedAssets: number;
  visualAssets: number;
  readyShots: number;
  readyVideos: number;
  fallbackImages: number;
  missingShots: number;
  missingShotDetails: DirectorCutMissingShotDetail[];
  audioAssets: number;
  canExport: boolean;
  blockingReason: string | null;
}

export interface DirectorCutMissingShotDetail {
  shotId: string;
  sceneId: string | null;
  sceneNumber: number | null;
  shotNumber: number | null;
  reason: string;
  imageStatus?: string | null;
  videoStatus?: string | null;
}

/**
 * Pipeline stages for the Director's Cut flow.
 * These correspond to `provider_payload.stage` values from the edge function.
 */
export type DirectorCutStage =
  | 'idle'
  | 'syncing_assets'
  | 'preflighting_assets'
  | 'submitting_to_provider'
  | 'provider_processing'
  | 'fallback_processing'
  | 'downloading_assets'
  | 'uploading_final_video'
  | 'failed'
  | 'completed';

export const STAGE_LABELS: Record<DirectorCutStage, string> = {
  idle: 'Idle',
  syncing_assets: 'Syncing timeline assets',
  preflighting_assets: 'Checking media URLs',
  submitting_to_provider: 'Submitting to provider',
  provider_processing: 'Provider processing',
  fallback_processing: 'Editframe fallback',
  downloading_assets: 'Downloading assets',
  uploading_final_video: 'Uploading final video',
  failed: 'Failed',
  completed: 'Completed',
};

export interface ShotFailureInfo {
  assetId: string;
  orderIndex: number;
  reason: string;
}

export interface DirectorCutDebugSummary {
  renderer?: string | null;
  stage?: string | null;
  falRequestId?: string | null;
  providerJobId?: string | null;
  fallbackReason?: string | null;
  fallbackStatus?: string | null;
  fallbackError?: string | null;
  falError?: string | null;
  failedShotCount?: number | null;
  visualTracks?: number | null;
  audioTracks?: number | null;
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
  renderer?: string | null;
  falRequestId?: string | null;
  providerJobId?: string | null;
  fallbackReason?: string | null;
  fallbackStatus?: string | null;
  fallbackError?: string | null;
  falError?: string | null;
  failedShotCount?: number | null;
  debugSummary?: DirectorCutDebugSummary;
}

const clampProgress = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizeShotFailures = (value: unknown): ShotFailureInfo[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((failure) => {
      if (!failure || typeof failure !== 'object') return null;
      const record = failure as Record<string, unknown>;
      const assetId = asString(record.assetId);
      const orderIndex = asNumber(record.orderIndex);
      const reason = asString(record.reason);
      if (!assetId || orderIndex === null || !reason) return null;
      return { assetId, orderIndex, reason };
    })
    .filter((failure): failure is ShotFailureInfo => Boolean(failure));
};

const normalizeMissingShotDetails = (value: unknown): DirectorCutMissingShotDetail[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const shotId = asString(record.shotId);
      const sceneId = asString(record.sceneId);
      const sceneNumber = asNumber(record.sceneNumber);
      const shotNumber = asNumber(record.shotNumber);
      const reason = asString(record.reason) ?? 'Missing shot image or video';
      if (!shotId) return null;
      return {
        shotId,
        sceneId,
        sceneNumber,
        shotNumber,
        reason,
        imageStatus: asString(record.imageStatus),
        videoStatus: asString(record.videoStatus),
      };
    })
    .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail)) as DirectorCutMissingShotDetail[];
};

const normalizeDirectorCutSummary = (value: unknown): DirectorCutSummary => {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const readyVideos = asNumber(record.readyVideos) ?? 0;
  const fallbackImages = asNumber(record.fallbackImages) ?? 0;
  const visualAssets = asNumber(record.visualAssets) ?? readyVideos + fallbackImages;
  const missingShots = asNumber(record.missingShots) ?? 0;
  const totalShots = asNumber(record.totalShots) ?? 0;
  const blockingReason =
    asString(record.blockingReason) ??
    (totalShots === 0
      ? "No ordered shots are available for Director's Cut."
      : missingShots > 0
        ? `${missingShots} ordered ${missingShots === 1 ? 'shot is' : 'shots are'} missing an image or video. Generate all visuals before starting Director's Cut.`
        : visualAssets === 0
          ? "No shot image or video assets are available for Director's Cut."
          : null);
  const canExport =
    typeof record.canExport === 'boolean'
      ? record.canExport
      : totalShots > 0 && visualAssets > 0 && missingShots === 0;

  return {
    totalShots,
    syncedAssets: asNumber(record.syncedAssets) ?? 0,
    visualAssets,
    readyShots: asNumber(record.readyShots) ?? visualAssets,
    readyVideos,
    fallbackImages,
    missingShots,
    missingShotDetails: normalizeMissingShotDetails(record.missingShotDetails),
    audioAssets: asNumber(record.audioAssets) ?? 0,
    canExport,
    blockingReason: canExport ? null : blockingReason,
  };
};

async function extractDirectorCutFunctionError(
  error: unknown,
  fallback: string
): Promise<{ message: string; summary?: DirectorCutSummary }> {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const response =
    record.context instanceof Response
      ? record.context
      : record.response instanceof Response
        ? record.response
        : null;

  if (response) {
    try {
      const body = (await response.clone().json()) as Record<string, unknown>;
      const message = asString(body.message) ?? asString(body.error) ?? fallback;
      return {
        message,
        summary: body.summary ? normalizeDirectorCutSummary(body.summary) : undefined,
      };
    } catch {
      // Fall through to the generic message extraction below.
    }
  }

  return {
    message:
      error instanceof Error && error.message
        ? error.message
        : asString(record.message) ?? asString(record.error) ?? fallback,
  };
}

const buildDebugSummary = (payload: Record<string, unknown>, providerJobId?: string | null): DirectorCutDebugSummary => ({
  renderer: asString(payload.renderer),
  stage: asString(payload.stage),
  falRequestId: asString(payload.falRequestId),
  providerJobId: providerJobId ?? asString(payload.providerJobId) ?? asString(payload.provider_job_id),
  fallbackReason: asString(payload.fallbackReason),
  fallbackStatus: asString(payload.fallbackStatus),
  fallbackError: asString(payload.fallbackError),
  falError: asString(payload.falError),
  failedShotCount: asNumber(payload.failedShotCount),
  visualTracks: asNumber(payload.visualTracks),
  audioTracks: asNumber(payload.audioTracks),
});

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
        providerJobId?: string | null;
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
          const debugSummary = buildDebugSummary(payload, statusData.providerJobId);
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
            shotFailures: normalizeShotFailures(payload.shotFailures),
            partialSuccess: !!payload.partialSuccess,
            renderer: debugSummary.renderer,
            falRequestId: debugSummary.falRequestId,
            providerJobId: debugSummary.providerJobId,
            fallbackReason: debugSummary.fallbackReason,
            fallbackStatus: debugSummary.fallbackStatus,
            fallbackError: debugSummary.fallbackError,
            falError: debugSummary.falError,
            failedShotCount: debugSummary.failedShotCount,
            debugSummary,
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
        const details = await extractDirectorCutFunctionError(invokeError, 'Failed to sync timeline assets');
        if (details.summary) setSummary(details.summary);
        throw new Error(details.message);
      }

      const nextSummary = normalizeDirectorCutSummary(data?.summary);

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

  const startDirectorCut = useCallback(async (options: { reuseSyncedAssets?: boolean } = {}) => {
    if (!projectId) return null;
    setIsStarting(true);
    setError(null);

    try {
      let ensuredSummary = summary;
      if (!ensuredSummary || !options.reuseSyncedAssets) {
        ensuredSummary = await syncAssets();
      }

      if (!ensuredSummary) {
        return null;
      }

      if (!ensuredSummary.canExport) {
        throw new Error(
          ensuredSummary.blockingReason ??
            "Director's Cut is blocked until every ordered shot has an image or video."
        );
      }

      const { data, error: invokeError } = await supabase.functions.invoke('director-cut', {
        body: {
          action: options.reuseSyncedAssets ? 'retry' : 'create',
          projectId,
        },
      });

      if (invokeError) {
        const details = await extractDirectorCutFunctionError(invokeError, "Failed to start Director's Cut");
        if (details.summary) setSummary(details.summary);
        throw new Error(details.message);
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
