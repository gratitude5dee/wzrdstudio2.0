import { describe, expect, it } from 'vitest';
import {
  buildLiveInspectionReport,
  buildSkippedStorageChecks,
  extractStoragePathFromPublicUrl,
  getOutputStoragePath,
  isOutputPathScopedToJob,
  isStyledTimelineAsset,
  parseArgs,
  summarizeTimelineAssets,
} from './inspect-director-cut-live.mjs';

const remotionManifest = {
  renderer: 'remotion',
  entryPoint: 'remotion/index.ts',
  compositionId: 'VideoEditorComposition',
  inputProps: {
    clips: [],
    audioTracks: [],
    composition: {},
    keyframes: [],
    selectedClipIds: [],
  },
};

const falJob = {
  id: 'fal-job',
  project_id: 'project-1',
  user_id: 'user-1',
  provider: 'fal_remote',
  status: 'completed',
  provider_status: 'completed',
  output_url: 'https://example.supabase.co/storage/v1/object/public/final-exports/project-1/fal-job/final.mp4',
  error_message: null,
  provider_payload: {
    stage: 'completed',
    audioIncluded: true,
    audioTrackCount: 1,
    renderWarnings: [{ assetId: 'clip-1', features: ['effect'] }],
  },
  created_at: '2026-05-13T00:00:00.000Z',
  updated_at: '2026-05-13T00:01:00.000Z',
  completed_at: '2026-05-13T00:01:00.000Z',
};

const remotionJob = {
  id: 'remotion-job',
  project_id: 'project-1',
  user_id: 'user-1',
  provider: 'remotion_worker',
  status: 'completed',
  provider_status: 'completed',
  output_url: 'https://example.supabase.co/storage/v1/object/public/final-exports/user-1/project-1/remotion-job/final.mp4',
  error_message: null,
  provider_payload: {
    stage: 'completed',
    remotionManifest,
    outputPath: 'user-1/project-1/remotion-job/final.mp4',
    renderWarnings: [],
  },
  created_at: '2026-05-13T00:02:00.000Z',
  updated_at: '2026-05-13T00:03:00.000Z',
  completed_at: '2026-05-13T00:03:00.000Z',
};

const assets = [
  {
    id: 'clip-1',
    asset_type: 'video',
    source_url: 'https://example.com/source.mp4',
    duration_ms: 1500,
    position_order: 0,
    metadata: {
      source: 'editor_timeline',
      asset_role: 'shot_visual',
      trim_start_ms: 250,
      trim_end_ms: 1750,
      media_metadata: { duration_ms: 2000 },
      transforms: { position: { x: 12, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, opacity: 1 },
      effects: [{ id: 'fx-1', type: 'brightness' }],
    },
  },
  {
    id: 'audio-1',
    asset_type: 'audio',
    source_url: 'https://example.com/audio.mp3',
    duration_ms: 1500,
    position_order: 1,
    metadata: {
      source: 'editor_timeline',
      asset_role: 'music',
      media_metadata: { duration_ms: 1500 },
    },
  },
];

describe('inspect-director-cut-live helpers', () => {
  it('parses live inspection arguments', () => {
    expect(
      parseArgs([
        '--project-id',
        'project-1',
        '--job-id',
        'fal-job',
        '--job-id',
        'remotion-job',
        '--bucket',
        'final-exports',
        '--limit',
        '5',
        '--json',
      ])
    ).toEqual({
      projectId: 'project-1',
      jobIds: ['fal-job', 'remotion-job'],
      bucket: 'final-exports',
      limit: 5,
      json: true,
      skipStorageCheck: false,
    });

    expect(() => parseArgs(['--project-id', 'project-1', '--limit', '0'])).toThrow(
      '--limit must be a positive integer.'
    );
  });

  it('summarizes editor timeline assets that prove the live fixture shape', () => {
    expect(summarizeTimelineAssets(assets)).toEqual({
      total: 2,
      visual: 1,
      video: 1,
      image: 0,
      audio: 1,
      editorTimelineAssets: 2,
      trimmedVideoAssets: 1,
      cachedMetadataAssets: 2,
      styledVisualAssets: 1,
    });

    expect(isStyledTimelineAsset(assets[0])).toBe(true);
    expect(isStyledTimelineAsset(assets[1])).toBe(false);
  });

  it('extracts storage paths from Supabase public or signed URLs', () => {
    expect(
      extractStoragePathFromPublicUrl(
        'https://example.supabase.co/storage/v1/object/public/final-exports/user-1/project-1/job-1/final.mp4'
      )
    ).toBe('user-1/project-1/job-1/final.mp4');

    expect(
      extractStoragePathFromPublicUrl(
        'https://example.supabase.co/storage/v1/object/sign/final-exports/project-1/job-1/final%20file.mp4?token=abc'
      )
    ).toBe('project-1/job-1/final file.mp4');

    expect(getOutputStoragePath(remotionJob)).toBe('user-1/project-1/remotion-job/final.mp4');
    expect(isOutputPathScopedToJob(remotionJob)).toBe(true);
    expect(isOutputPathScopedToJob(falJob)).toBe(true);
  });

  it('builds a passing completion report only when jobs, assets, and storage are all verified', () => {
    const report = buildLiveInspectionReport({
      projectId: 'project-1',
      jobs: [falJob, remotionJob],
      assets,
      storageChecks: [
        { jobId: 'fal-job', ok: true, bytes: 10 },
        { jobId: 'remotion-job', ok: true, bytes: 10 },
      ],
    });

    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => [check.id, check.ok])).toContainEqual([
      'remotion_manifest_present',
      true,
    ]);
  });

  it('fails the storage gate when output downloads are skipped', () => {
    const report = buildLiveInspectionReport({
      projectId: 'project-1',
      jobs: [falJob, remotionJob],
      assets,
      storageChecks: buildSkippedStorageChecks([falJob, remotionJob]),
    });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'storage_outputs_verified')?.ok).toBe(false);
  });

  it('requires both Fast/FAL and Styled/Remotion completed exports for signoff', () => {
    const falOnlyReport = buildLiveInspectionReport({
      projectId: 'project-1',
      jobs: [falJob],
      assets,
      storageChecks: [{ jobId: 'fal-job', ok: true, bytes: 10 }],
    });
    const remotionOnlyReport = buildLiveInspectionReport({
      projectId: 'project-1',
      jobs: [remotionJob],
      assets,
      storageChecks: [{ jobId: 'remotion-job', ok: true, bytes: 10 }],
    });

    expect(falOnlyReport.ok).toBe(false);
    expect(falOnlyReport.checks.find((check) => check.id === 'remotion_export_completed')?.ok).toBe(false);
    expect(remotionOnlyReport.ok).toBe(false);
    expect(remotionOnlyReport.checks.find((check) => check.id === 'fal_export_completed')?.ok).toBe(false);
  });

  it('fails when inspected jobs are not scoped to the inspected project', () => {
    const report = buildLiveInspectionReport({
      projectId: 'project-1',
      jobs: [
        falJob,
        {
          ...remotionJob,
          project_id: 'project-2',
          provider_payload: {
            ...remotionJob.provider_payload,
            outputPath: 'user-1/project-2/remotion-job/final.mp4',
          },
        },
      ],
      assets,
      storageChecks: [
        { jobId: 'fal-job', ok: true, bytes: 10 },
        { jobId: 'remotion-job', ok: true, bytes: 10 },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'jobs_match_inspected_project')?.ok).toBe(false);
  });

  it('fails when any inspected completed renderer job has incomplete completion evidence', () => {
    const weakFalJob = {
      ...falJob,
      id: 'fal-job-weak',
      output_url: 'https://example.supabase.co/storage/v1/object/public/final-exports/project-1/fal-job-weak/final.mp4',
      provider_payload: {
        ...falJob.provider_payload,
        audioIncluded: false,
        audioTrackCount: 0,
        renderWarnings: [],
      },
    };
    const weakRemotionJob = {
      ...remotionJob,
      id: 'remotion-job-weak',
      output_url: 'https://example.supabase.co/storage/v1/object/public/final-exports/user-1/project-1/remotion-job-weak/final.mp4',
      provider_payload: {
        ...remotionJob.provider_payload,
        remotionManifest: { renderer: 'remotion' },
        outputPath: 'user-1/project-1/remotion-job-weak/final.mp4',
        renderWarnings: [{ feature: 'effect' }],
      },
    };

    const report = buildLiveInspectionReport({
      projectId: 'project-1',
      jobs: [falJob, weakFalJob, remotionJob, weakRemotionJob],
      assets,
      storageChecks: [
        { jobId: 'fal-job', ok: true, bytes: 10 },
        { jobId: 'fal-job-weak', ok: true, bytes: 10 },
        { jobId: 'remotion-job', ok: true, bytes: 10 },
        { jobId: 'remotion-job-weak', ok: true, bytes: 10 },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'fal_export_audio_payload')?.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'fal_export_styled_warning_payload')?.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'remotion_manifest_present')?.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'remotion_export_no_render_warnings')?.ok).toBe(false);
  });
});
