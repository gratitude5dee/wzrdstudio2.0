#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { loadDirectorCutEnv } from './director-cut-env-files.mjs';

const DEFAULT_BUCKET = 'final-exports';
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_LIMIT = 1;
const DEFAULT_STALE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MAX_REQUEUES = 2;
const JOB_COLUMNS = [
  'id',
  'project_id',
  'user_id',
  'status',
  'provider',
  'provider_status',
  'provider_payload',
  'settings',
  'created_at',
  'updated_at',
].join(',');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, '..');
const remotionBinaryName = process.platform === 'win32' ? 'remotion.cmd' : 'remotion';

const printUsage = () => {
  console.log(`
Usage:
  npm run director-cut:remotion-worker -- --once
  npm run director-cut:remotion-worker -- --job-id <export_job_id>

Required environment:
  Values are read from .env.example, .env, .env.local, and then this shell.
  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for live worker runs.

Options:
  --job-id             Process one export_jobs row.
  --once               Poll queued jobs once and exit.
  --limit              Number of queued jobs to claim per poll. Defaults to ${DEFAULT_LIMIT}.
  --poll-interval-ms   Poll interval for daemon mode. Defaults to ${DEFAULT_POLL_INTERVAL_MS}.
  --requeue-stale      Requeue or fail stale processing jobs before claiming queued jobs.
  --stale-timeout-ms   Stale processing threshold. Defaults to ${DEFAULT_STALE_TIMEOUT_MS}.
  --max-requeues       Failed stale jobs after this many requeues. Defaults to ${DEFAULT_MAX_REQUEUES}.
  --bucket             Supabase Storage bucket. Defaults to ${DEFAULT_BUCKET}.
  --repo-root          Repository root containing remotion/index.ts.
  --concurrency        Optional Remotion concurrency.
  --crf                Optional h264 CRF value.
  --x264-preset        Optional x264 preset.
  --dry-run            Print the render command for a job without claiming or uploading it.
`);
};

export const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === 'once' || key === 'dry-run' || key === 'help' || key === 'requeue-stale') {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

const numberArg = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const requireEnv = (env = process.env) => {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return { supabaseUrl, serviceRoleKey };
};

export const getRemotionBinPath = (repoRoot = defaultRepoRoot) =>
  path.resolve(repoRoot, 'node_modules', '.bin', remotionBinaryName);

export const validateWorkerRuntime = ({ repoRoot = defaultRepoRoot } = {}) => {
  const absoluteRepoRoot = path.resolve(repoRoot);
  const renderScriptPath = path.join(absoluteRepoRoot, 'scripts', 'render-editor-composition.mjs');
  const remotionBinPath = getRemotionBinPath(absoluteRepoRoot);

  if (!existsSync(renderScriptPath)) {
    throw new Error(`Missing Remotion render script: ${renderScriptPath}`);
  }
  if (!existsSync(remotionBinPath)) {
    throw new Error(`Missing Remotion CLI binary: ${remotionBinPath}`);
  }
  try {
    accessSync(remotionBinPath, constants.X_OK);
  } catch {
    throw new Error(`Remotion CLI binary is not executable: ${remotionBinPath}`);
  }

  return {
    repoRoot: absoluteRepoRoot,
    renderScriptPath,
    remotionBinPath,
  };
};

export const getRemotionManifestFromJob = (job) => {
  const payload = isRecord(job?.provider_payload) ? job.provider_payload : {};
  const manifest = payload.remotionManifest;
  if (!isRecord(manifest)) {
    throw new Error(`Job ${job?.id ?? '<unknown>'} is missing provider_payload.remotionManifest.`);
  }
  if (manifest.renderer !== 'remotion' || !isRecord(manifest.inputProps)) {
    throw new Error(`Job ${job?.id ?? '<unknown>'} has an invalid Remotion manifest.`);
  }
  return manifest;
};

export const buildStoragePath = (job, now = Date.now()) =>
  `${job.user_id}/${job.project_id}/${job.id}/final_export_${now}.mp4`;

export const buildRenderScriptArgs = ({
  manifestPath,
  outputPath,
  manifest,
  concurrency,
  crf,
  x264Preset,
}) => {
  const args = [
    'scripts/render-editor-composition.mjs',
    '--manifest',
    manifestPath,
    '--out',
    outputPath,
  ];

  if (typeof manifest.entryPoint === 'string') args.push('--entry', manifest.entryPoint);
  if (typeof manifest.compositionId === 'string') args.push('--composition', manifest.compositionId);
  if (isRecord(manifest.output) && typeof manifest.output.codec === 'string') {
    args.push('--codec', manifest.output.codec);
  }
  if (crf) args.push('--crf', crf);
  if (x264Preset) args.push('--x264-preset', x264Preset);
  if (concurrency) args.push('--concurrency', concurrency);

  return args;
};

export const buildCompletedProviderPayload = (providerPayload, { bucket, storagePath, publicUrl }) => ({
  ...(isRecord(providerPayload) ? providerPayload : {}),
  stage: 'completed',
  renderer: 'remotion',
  outputBucket: bucket,
  outputPath: storagePath,
  outputUrl: publicUrl,
  renderWarnings: [],
  renderWarningCount: 0,
});

export const getRemotionWorkerRequeueCount = (providerPayload) => {
  if (!isRecord(providerPayload)) return 0;
  const count = providerPayload.remotionWorkerRequeueCount;
  return typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0;
};

export const buildRequeuedProviderPayload = (
  providerPayload,
  { requeuedAt = new Date().toISOString(), staleTimeoutMs = DEFAULT_STALE_TIMEOUT_MS } = {}
) => {
  const previousPayload = isRecord(providerPayload) ? providerPayload : {};

  return {
    ...previousPayload,
    stage: 'queued_for_remotion_worker',
    previousStage: previousPayload.stage,
    staleReason: 'worker_timeout',
    staleTimeoutMs,
    remotionWorkerRequeueCount: getRemotionWorkerRequeueCount(previousPayload) + 1,
    remotionWorkerRequeuedAt: requeuedAt,
  };
};

export const buildStaleFailureProviderPayload = (
  providerPayload,
  { failedAt = new Date().toISOString(), staleTimeoutMs = DEFAULT_STALE_TIMEOUT_MS } = {}
) => ({
  ...(isRecord(providerPayload) ? providerPayload : {}),
  stage: 'failed',
  staleReason: 'worker_timeout',
  staleTimeoutMs,
  remotionWorkerFailedAt: failedAt,
});

const createSupabaseAdmin = (env = process.env) => {
  const { supabaseUrl, serviceRoleKey } = requireEnv(env);
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const loadJobs = async (supabaseAdmin, args) => {
  if (args['job-id']) {
    const { data, error } = await supabaseAdmin
      .from('export_jobs')
      .select(JOB_COLUMNS)
      .eq('id', args['job-id'])
      .single();
    if (error || !data) throw new Error(`Failed to load export job: ${error?.message ?? 'not found'}`);
    return [data];
  }

  const { data, error } = await supabaseAdmin
    .from('export_jobs')
    .select(JOB_COLUMNS)
    .eq('provider', 'remotion_worker')
    .eq('provider_status', 'queued')
    .eq('status', 'processing')
    .order('created_at', { ascending: true })
    .limit(numberArg(args.limit, DEFAULT_LIMIT));

  if (error) throw new Error(`Failed to load queued Remotion jobs: ${error.message}`);
  return data ?? [];
};

const loadStaleJobs = async (supabaseAdmin, { staleTimeoutMs, limit }) => {
  const cutoff = new Date(Date.now() - staleTimeoutMs).toISOString();
  const { data, error } = await supabaseAdmin
    .from('export_jobs')
    .select(JOB_COLUMNS)
    .eq('provider', 'remotion_worker')
    .eq('provider_status', 'processing')
    .eq('status', 'processing')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load stale Remotion jobs: ${error.message}`);
  return data ?? [];
};

const claimJob = async (supabaseAdmin, job) => {
  const providerPayload = {
    ...(isRecord(job.provider_payload) ? job.provider_payload : {}),
    stage: 'rendering_with_remotion',
  };
  const { data, error } = await supabaseAdmin
    .from('export_jobs')
    .update({
      provider_status: 'processing',
      progress: 10,
      provider_payload: providerPayload,
    })
    .eq('id', job.id)
    .eq('provider_status', 'queued')
    .select(JOB_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to claim Remotion job ${job.id}: ${error?.message ?? 'not queued'}`);
  }
  return data;
};

const updateJobFailure = async (supabaseAdmin, job, message) => {
  const providerPayload = {
    ...(isRecord(job.provider_payload) ? job.provider_payload : {}),
    stage: 'failed',
    error: message,
  };
  await supabaseAdmin
    .from('export_jobs')
    .update({
      status: 'failed',
      provider_status: 'failed',
      progress: 100,
      error_message: message,
      completed_at: new Date().toISOString(),
      provider_payload: providerPayload,
    })
    .eq('id', job.id);
};

export const requeueStaleJobs = async ({ supabaseAdmin, args }) => {
  const staleTimeoutMs = numberArg(args['stale-timeout-ms'], DEFAULT_STALE_TIMEOUT_MS);
  const maxRequeues = numberArg(args['max-requeues'], DEFAULT_MAX_REQUEUES);
  const jobs = await loadStaleJobs(supabaseAdmin, {
    staleTimeoutMs,
    limit: numberArg(args.limit, DEFAULT_LIMIT),
  });

  const result = { requeued: 0, failed: 0 };
  for (const job of jobs) {
    try {
      getRemotionManifestFromJob(job);
      if (getRemotionWorkerRequeueCount(job.provider_payload) >= maxRequeues) {
        await updateJobFailure(
          supabaseAdmin,
          {
            ...job,
            provider_payload: buildStaleFailureProviderPayload(job.provider_payload, { staleTimeoutMs }),
          },
          `Remotion worker job exceeded ${maxRequeues} stale requeues.`
        );
        result.failed += 1;
        continue;
      }

      await supabaseAdmin
        .from('export_jobs')
        .update({
          provider_status: 'queued',
          progress: 5,
          error_message: null,
          provider_payload: buildRequeuedProviderPayload(job.provider_payload, { staleTimeoutMs }),
        })
        .eq('id', job.id)
        .eq('provider_status', 'processing');
      result.requeued += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid stale Remotion worker job';
      await updateJobFailure(supabaseAdmin, job, message);
      result.failed += 1;
    }
  }

  return result;
};

const renderManifest = async ({ repoRoot, manifest, outputPath, args }) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'worldstudio-director-cut-'));
  const manifestPath = path.join(tempDir, 'remotion-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const renderArgs = buildRenderScriptArgs({
    manifestPath,
    outputPath,
    manifest,
    concurrency: args.concurrency,
    crf: args.crf,
    x264Preset: args['x264-preset'],
  });

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, renderArgs, { cwd: repoRoot, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Remotion worker render failed with exit code ${code}`));
      }
    });
  }).finally(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });
};

const uploadOutput = async ({ supabaseAdmin, bucket, job, outputPath }) => {
  if (!existsSync(outputPath)) {
    throw new Error(`Rendered output does not exist: ${outputPath}`);
  }

  const storagePath = buildStoragePath(job);
  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, readFileSync(outputPath), {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload Remotion output: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
  return { storagePath, publicUrl };
};

const completeJob = async ({ supabaseAdmin, job, bucket, storagePath, publicUrl }) => {
  await supabaseAdmin
    .from('export_jobs')
    .update({
      status: 'completed',
      progress: 100,
      output_url: publicUrl,
      provider: 'remotion_worker',
      provider_status: 'completed',
      completed_at: new Date().toISOString(),
      provider_payload: buildCompletedProviderPayload(job.provider_payload, {
        bucket,
        storagePath,
        publicUrl,
      }),
    })
    .eq('id', job.id);
};

const processJob = async ({ supabaseAdmin, job, args }) => {
  const repoRoot = path.resolve(args['repo-root'] ?? defaultRepoRoot);
  const bucket = args.bucket ?? DEFAULT_BUCKET;
  const manifest = getRemotionManifestFromJob(job);
  const outputDir = mkdtempSync(path.join(tmpdir(), 'worldstudio-render-output-'));
  const outputPath = path.join(outputDir, `${job.id}.mp4`);

  if (args['dry-run']) {
    const manifestPath = path.join(outputDir, 'remotion-manifest.json');
    console.log(JSON.stringify({
      jobId: job.id,
      command: process.execPath,
      args: buildRenderScriptArgs({
        manifestPath,
        outputPath,
        manifest,
        concurrency: args.concurrency,
        crf: args.crf,
        x264Preset: args['x264-preset'],
      }),
    }, null, 2));
    rmSync(outputDir, { recursive: true, force: true });
    return;
  }

  const claimedJob = await claimJob(supabaseAdmin, job);
  try {
    await renderManifest({ repoRoot, manifest, outputPath, args });
    const { storagePath, publicUrl } = await uploadOutput({
      supabaseAdmin,
      bucket,
      job: claimedJob,
      outputPath,
    });
    await completeJob({ supabaseAdmin, job: claimedJob, bucket, storagePath, publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Remotion worker failed';
    await updateJobFailure(supabaseAdmin, claimedJob, message);
    throw error;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
};

export const runOnce = async ({ supabaseAdmin, args }) => {
  if (args['requeue-stale'] && !args['dry-run']) {
    await requeueStaleJobs({ supabaseAdmin, args });
  }

  const jobs = await loadJobs(supabaseAdmin, args);
  for (const job of jobs) {
    await processJob({ supabaseAdmin, job, args });
  }
  return jobs.length;
};

export const main = async (argv = process.argv.slice(2), env = loadDirectorCutEnv()) => {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return;
  }

  validateWorkerRuntime({ repoRoot: args['repo-root'] ?? defaultRepoRoot });
  const supabaseAdmin = createSupabaseAdmin(env);
  const pollIntervalMs = numberArg(args['poll-interval-ms'], DEFAULT_POLL_INTERVAL_MS);

  if (args.once || args['job-id'] || args['dry-run']) {
    const count = await runOnce({ supabaseAdmin, args });
    console.log(`Processed ${count} Remotion export job${count === 1 ? '' : 's'}.`);
    return;
  }

  for (;;) {
    const count = await runOnce({ supabaseAdmin, args });
    if (count === 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
};

const isCliEntrypoint = () => process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exit(1);
  });
}
