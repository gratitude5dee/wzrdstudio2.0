import { describe, expect, it } from 'vitest';
import {
  buildCompletedJobUpdate,
  buildCreateJobResponse,
  buildFailedJobUpdate,
  buildProcessingJobUpdate,
  buildQueuedExportJobInsert,
  buildStatusResponse,
} from './job-payloads.ts';

describe('director-cut job payload helpers', () => {
  it('builds the queued export job insert payload', () => {
    expect(
      buildQueuedExportJobInsert(
        'project-1',
        'user-1',
        { resolution: '1920x1080', includeAudio: true },
        '2026-05-13T21:30:00.000Z'
      )
    ).toEqual({
      project_id: 'project-1',
      user_id: 'user-1',
      status: 'processing',
      progress: 5,
      settings: { resolution: '1920x1080', includeAudio: true },
      started_at: '2026-05-13T21:30:00.000Z',
      provider: 'fal_remote',
      provider_status: 'queued',
      fallback_used: false,
      provider_payload: { stage: 'syncing_assets' },
    });

    expect(
      buildQueuedExportJobInsert(
        'project-1',
        'user-1',
        { renderBackend: 'remotion_worker' },
        '2026-05-13T21:30:00.000Z',
        {
          provider: 'remotion_worker',
          providerPayload: {
            stage: 'queued_for_remotion_worker',
            remotionManifest: { renderer: 'remotion' },
          },
        }
      )
    ).toMatchObject({
      project_id: 'project-1',
      user_id: 'user-1',
      settings: { renderBackend: 'remotion_worker' },
      provider: 'remotion_worker',
      provider_status: 'queued',
      provider_payload: {
        stage: 'queued_for_remotion_worker',
        remotionManifest: { renderer: 'remotion' },
      },
    });
  });

  it('builds status and create responses with client-facing field names', () => {
    expect(buildCreateJobResponse('job-1')).toEqual({
      success: true,
      status: 'processing',
      jobId: 'job-1',
      progress: 5,
      provider: 'fal_remote',
      providerStatus: 'queued',
      fallbackUsed: false,
    });

    expect(buildCreateJobResponse('job-2', 'remotion_worker')).toMatchObject({
      jobId: 'job-2',
      provider: 'remotion_worker',
      providerStatus: 'queued',
    });

    expect(
      buildStatusResponse({
        status: 'completed',
        progress: 100,
        output_url: 'https://example.com/final.mp4',
        error_message: null,
        provider: 'fal_remote',
        provider_status: 'completed',
        fallback_used: false,
        provider_payload: { stage: 'completed' },
      })
    ).toEqual({
      status: 'completed',
      progress: 100,
      outputUrl: 'https://example.com/final.mp4',
      error: null,
      provider: 'fal_remote',
      providerStatus: 'completed',
      fallbackUsed: false,
      providerPayload: { stage: 'completed' },
    });
  });

  it('builds processing, completed, and failed job updates', () => {
    expect(buildProcessingJobUpdate()).toEqual({
      provider: 'fal_remote',
      provider_status: 'processing',
      progress: 10,
      provider_payload: { stage: 'submitting_to_provider' },
    });

    expect(buildProcessingJobUpdate('rendering_with_remotion', 'remotion_worker')).toEqual({
      provider: 'remotion_worker',
      provider_status: 'processing',
      progress: 10,
      provider_payload: { stage: 'rendering_with_remotion' },
    });

    expect(
      buildCompletedJobUpdate({
        publicUrl: 'https://example.com/final.mp4',
        audioIncluded: true,
        audioTrackCount: 2,
        completedAt: '2026-05-13T21:31:00.000Z',
        shotFailures: [
          {
            assetId: 'bad-shot',
            orderIndex: 2,
            reason: 'Missing URL',
          },
        ],
        renderWarnings: [
          {
            assetId: 'styled-shot',
            orderIndex: 0,
            features: ['effect', 'keyframe'],
            reason: 'Unsupported by backend',
          },
        ],
      })
    ).toEqual({
      status: 'completed',
      progress: 100,
      output_url: 'https://example.com/final.mp4',
      provider: 'fal_remote',
      provider_status: 'completed',
      completed_at: '2026-05-13T21:31:00.000Z',
      provider_payload: {
        stage: 'completed',
        audioIncluded: true,
        audioTrackCount: 2,
        renderWarnings: [
          {
            assetId: 'styled-shot',
            orderIndex: 0,
            features: ['effect', 'keyframe'],
            reason: 'Unsupported by backend',
          },
        ],
        renderWarningCount: 1,
        shotFailures: [
          {
            assetId: 'bad-shot',
            orderIndex: 2,
            reason: 'Missing URL',
          },
        ],
        partialSuccess: true,
        failedShotCount: 1,
      },
    });

    expect(buildFailedJobUpdate('Provider timeout', '2026-05-13T21:32:00.000Z')).toEqual({
      status: 'failed',
      error_message: 'Provider timeout',
      provider_status: 'failed',
      completed_at: '2026-05-13T21:32:00.000Z',
    });
  });
});
