import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCompletedProviderPayload,
  buildRenderScriptArgs,
  buildRequeuedProviderPayload,
  buildStoragePath,
  buildStaleFailureProviderPayload,
  getRemotionWorkerRequeueCount,
  getRemotionManifestFromJob,
  parseArgs,
  requeueStaleJobs,
  requireEnv,
  validateWorkerRuntime,
} from './director-cut-remotion-worker.mjs';

const manifest = {
  renderer: 'remotion',
  entryPoint: 'remotion/index.ts',
  compositionId: 'VideoEditorComposition',
  inputProps: {
    clips: [],
    audioTracks: [],
    composition: {},
    selectedClipIds: [],
    keyframes: [],
  },
  output: {
    codec: 'h264',
  },
};

const createFakeSupabase = (staleJobs) => {
  const updates = [];
  const createBuilder = () => {
    let mode = 'select';

    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      lt() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      update(values) {
        mode = 'update';
        updates.push(values);
        return this;
      },
      then(resolve, reject) {
        const result = mode === 'select' ? { data: staleJobs, error: null } : { data: null, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
  };

  return {
    updates,
    from() {
      return createBuilder();
    },
  };
};

describe('director-cut remotion worker helpers', () => {
  it('parses CLI arguments', () => {
    expect(
      parseArgs([
        '--once',
        '--limit',
        '2',
        '--requeue-stale',
        '--stale-timeout-ms',
        '900000',
        '--max-requeues',
        '3',
        '--bucket',
        'final-exports',
        '--concurrency',
        '4',
      ])
    ).toEqual({
      once: true,
      limit: '2',
      'requeue-stale': true,
      'stale-timeout-ms': '900000',
      'max-requeues': '3',
      bucket: 'final-exports',
      concurrency: '4',
    });
  });

  it('requires Supabase service credentials', () => {
    expect(() => requireEnv({})).toThrow('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    expect(
      requireEnv({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      })
    ).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'service-role',
    });
  });

  it('preflights local Remotion worker runtime before polling live jobs', () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), 'worldstudio-worker-runtime-'));
    const renderScriptPath = path.join(repoRoot, 'scripts', 'render-editor-composition.mjs');
    const remotionBinPath = path.join(
      repoRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'remotion.cmd' : 'remotion'
    );

    try {
      expect(() => validateWorkerRuntime({ repoRoot })).toThrow('Missing Remotion render script');

      mkdirSync(path.dirname(renderScriptPath), { recursive: true });
      writeFileSync(renderScriptPath, '#!/usr/bin/env node\n');
      expect(() => validateWorkerRuntime({ repoRoot })).toThrow('Missing Remotion CLI binary');

      mkdirSync(path.dirname(remotionBinPath), { recursive: true });
      writeFileSync(remotionBinPath, '#!/usr/bin/env node\n');
      expect(() => validateWorkerRuntime({ repoRoot })).toThrow('Remotion CLI binary is not executable');

      chmodSync(remotionBinPath, 0o755);
      expect(validateWorkerRuntime({ repoRoot })).toEqual({
        repoRoot: path.resolve(repoRoot),
        renderScriptPath,
        remotionBinPath,
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('reads and validates the queued Remotion manifest from provider payload', () => {
    expect(
      getRemotionManifestFromJob({
        id: 'job-1',
        provider_payload: { remotionManifest: manifest },
      })
    ).toBe(manifest);

    expect(() =>
      getRemotionManifestFromJob({
        id: 'job-2',
        provider_payload: { remotionManifest: { renderer: 'other' } },
      })
    ).toThrow('invalid Remotion manifest');
  });

  it('builds an owner-scoped final export storage path', () => {
    expect(
      buildStoragePath(
        {
          id: 'job-1',
          project_id: 'project-1',
          user_id: 'user-1',
        },
        177000
      )
    ).toBe('user-1/project-1/job-1/final_export_177000.mp4');
  });

  it('builds the render script invocation from the manifest', () => {
    expect(
      buildRenderScriptArgs({
        manifestPath: '/tmp/manifest.json',
        outputPath: '/tmp/out.mp4',
        manifest,
        concurrency: '2',
        crf: '18',
        x264Preset: 'slow',
      })
    ).toEqual([
      'scripts/render-editor-composition.mjs',
      '--manifest',
      '/tmp/manifest.json',
      '--out',
      '/tmp/out.mp4',
      '--entry',
      'remotion/index.ts',
      '--composition',
      'VideoEditorComposition',
      '--codec',
      'h264',
      '--crf',
      '18',
      '--x264-preset',
      'slow',
      '--concurrency',
      '2',
    ]);
  });

  it('preserves the queued manifest while marking completion metadata', () => {
    expect(
      buildCompletedProviderPayload(
        {
          stage: 'queued_for_remotion_worker',
          remotionManifest: manifest,
        },
        {
          bucket: 'final-exports',
          storagePath: 'user-1/project-1/job-1/final.mp4',
          publicUrl: 'https://example.com/final.mp4',
        }
      )
    ).toEqual({
      stage: 'completed',
      renderer: 'remotion',
      outputBucket: 'final-exports',
      outputPath: 'user-1/project-1/job-1/final.mp4',
      outputUrl: 'https://example.com/final.mp4',
      remotionManifest: manifest,
      renderWarnings: [],
      renderWarningCount: 0,
    });
  });

  it('builds stale requeue and stale failure payloads without dropping the manifest', () => {
    const providerPayload = {
      stage: 'rendering_with_remotion',
      remotionManifest: manifest,
      remotionWorkerRequeueCount: 1,
    };

    expect(getRemotionWorkerRequeueCount(providerPayload)).toBe(1);
    expect(
      buildRequeuedProviderPayload(providerPayload, {
        requeuedAt: '2026-05-13T22:30:00.000Z',
        staleTimeoutMs: 900000,
      })
    ).toEqual({
      stage: 'queued_for_remotion_worker',
      previousStage: 'rendering_with_remotion',
      staleReason: 'worker_timeout',
      staleTimeoutMs: 900000,
      remotionWorkerRequeueCount: 2,
      remotionWorkerRequeuedAt: '2026-05-13T22:30:00.000Z',
      remotionManifest: manifest,
    });

    expect(
      buildStaleFailureProviderPayload(providerPayload, {
        failedAt: '2026-05-13T22:45:00.000Z',
        staleTimeoutMs: 900000,
      })
    ).toEqual({
      stage: 'failed',
      staleReason: 'worker_timeout',
      staleTimeoutMs: 900000,
      remotionWorkerFailedAt: '2026-05-13T22:45:00.000Z',
      remotionManifest: manifest,
      remotionWorkerRequeueCount: 1,
    });
  });

  it('requeues stale processing jobs before they are claimed again', async () => {
    const supabaseAdmin = createFakeSupabase([
      {
        id: 'job-1',
        provider_payload: {
          stage: 'rendering_with_remotion',
          remotionManifest: manifest,
        },
      },
    ]);

    await expect(
      requeueStaleJobs({
        supabaseAdmin,
        args: {
          limit: '1',
          'stale-timeout-ms': '900000',
          'max-requeues': '2',
        },
      })
    ).resolves.toEqual({ requeued: 1, failed: 0 });

    expect(supabaseAdmin.updates).toHaveLength(1);
    expect(supabaseAdmin.updates[0]).toMatchObject({
      provider_status: 'queued',
      progress: 5,
      error_message: null,
      provider_payload: {
        stage: 'queued_for_remotion_worker',
        previousStage: 'rendering_with_remotion',
        staleReason: 'worker_timeout',
        staleTimeoutMs: 900000,
        remotionWorkerRequeueCount: 1,
        remotionManifest: manifest,
      },
    });
  });

  it('fails stale jobs once the requeue cap is reached', async () => {
    const supabaseAdmin = createFakeSupabase([
      {
        id: 'job-1',
        provider_payload: {
          stage: 'rendering_with_remotion',
          remotionManifest: manifest,
          remotionWorkerRequeueCount: 2,
        },
      },
    ]);

    await expect(
      requeueStaleJobs({
        supabaseAdmin,
        args: {
          limit: '1',
          'stale-timeout-ms': '900000',
          'max-requeues': '2',
        },
      })
    ).resolves.toEqual({ requeued: 0, failed: 1 });

    expect(supabaseAdmin.updates).toHaveLength(1);
    expect(supabaseAdmin.updates[0]).toMatchObject({
      status: 'failed',
      provider_status: 'failed',
      progress: 100,
      error_message: 'Remotion worker job exceeded 2 stale requeues.',
      provider_payload: {
        stage: 'failed',
        staleReason: 'worker_timeout',
        staleTimeoutMs: 900000,
        remotionManifest: manifest,
        remotionWorkerRequeueCount: 2,
      },
    });
  });
});
