import type { ExportSettings, RenderWarning, ShotFailure } from '../_shared/export-helpers.ts';

export type DirectorCutProvider = 'fal_remote' | 'remotion_worker';

export interface DirectorCutJobStatusRow {
  status: string | null;
  progress: number | null;
  output_url: string | null;
  error_message: string | null;
  provider: string | null;
  provider_status: string | null;
  fallback_used: boolean | null;
  provider_payload: Record<string, unknown> | null;
}

export interface CompletedPayloadInput {
  publicUrl: string;
  shotFailures: ShotFailure[];
  audioIncluded: boolean;
  audioTrackCount: number;
  renderWarnings: RenderWarning[];
  completedAt?: string;
}

export interface QueuedExportJobOptions {
  provider?: DirectorCutProvider;
  providerPayload?: Record<string, unknown>;
}

export function buildQueuedExportJobInsert(
  projectId: string,
  userId: string,
  settings: ExportSettings | undefined,
  startedAt = new Date().toISOString(),
  options: QueuedExportJobOptions = {}
) {
  const provider = options.provider ?? 'fal_remote';

  return {
    project_id: projectId,
    user_id: userId,
    status: 'processing',
    progress: 5,
    settings: settings ?? {},
    started_at: startedAt,
    provider,
    provider_status: 'queued',
    fallback_used: false,
    provider_payload: options.providerPayload ?? { stage: 'syncing_assets' },
  };
}

export function buildProcessingJobUpdate(stage = 'submitting_to_provider', provider: DirectorCutProvider = 'fal_remote') {
  return {
    provider,
    provider_status: 'processing',
    progress: 10,
    provider_payload: { stage },
  };
}

export function buildCompletedJobUpdate({
  publicUrl,
  shotFailures,
  audioIncluded,
  audioTrackCount,
  renderWarnings,
  completedAt = new Date().toISOString(),
}: CompletedPayloadInput) {
  const providerPayload: Record<string, unknown> = {
    stage: 'completed',
    audioIncluded,
    audioTrackCount,
    renderWarnings,
    renderWarningCount: renderWarnings.length,
  };

  if (shotFailures.length > 0) {
    providerPayload.shotFailures = shotFailures;
    providerPayload.partialSuccess = true;
    providerPayload.failedShotCount = shotFailures.length;
  }

  return {
    status: 'completed',
    progress: 100,
    output_url: publicUrl,
    provider: 'fal_remote',
    provider_status: 'completed',
    completed_at: completedAt,
    provider_payload: providerPayload,
  };
}

export function buildFailedJobUpdate(message: string, completedAt = new Date().toISOString()) {
  return {
    status: 'failed',
    error_message: message,
    provider_status: 'failed',
    completed_at: completedAt,
  };
}

export function buildCreateJobResponse(jobId: string, provider: DirectorCutProvider = 'fal_remote') {
  return {
    success: true,
    status: 'processing',
    jobId,
    progress: 5,
    provider,
    providerStatus: 'queued',
    fallbackUsed: false,
  };
}

export function buildStatusResponse(job: DirectorCutJobStatusRow) {
  return {
    status: job.status,
    progress: job.progress,
    outputUrl: job.output_url,
    error: job.error_message,
    provider: job.provider,
    providerStatus: job.provider_status,
    fallbackUsed: job.fallback_used,
    providerPayload: job.provider_payload,
  };
}
