#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { loadDirectorCutEnv } from './director-cut-env-files.mjs';

const DEFAULT_BUCKET = 'final-exports';
const DEFAULT_JOB_LIMIT = 20;
const JOB_COLUMNS = [
  'id',
  'project_id',
  'user_id',
  'status',
  'progress',
  'output_url',
  'error_message',
  'provider',
  'provider_status',
  'provider_payload',
  'settings',
  'created_at',
  'updated_at',
  'completed_at',
].join(',');
const ASSET_COLUMNS = [
  'id',
  'project_id',
  'user_id',
  'position_order',
  'asset_type',
  'source_url',
  'duration_ms',
  'metadata',
  'created_at',
  'updated_at',
].join(',');

const printUsage = () => {
  console.log(`
Usage:
  npm run director-cut:inspect-live -- --project-id <project_id>
  npm run director-cut:inspect-live -- --project-id <project_id> --job-id <fal_job_id> --job-id <remotion_job_id> --json

Required environment:
  Values are read from .env.example, .env, .env.local, and then this shell.
  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for live inspection.

Options:
  --project-id             Project whose Director's Cut rows should be inspected.
  --job-id                 Export job to inspect. Can be passed more than once.
  --limit                  Recent project jobs to inspect when --job-id is omitted. Defaults to ${DEFAULT_JOB_LIMIT}.
  --bucket                 Storage bucket for final MP4 outputs. Defaults to ${DEFAULT_BUCKET}.
  --skip-storage-check     Skip service-role storage downloads. This leaves the storage check failing.
  --json                   Print machine-readable JSON.
`);
};

const parsePositiveIntegerOption = (key, value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${key} must be a positive integer.`);
  }
  return Math.floor(parsed);
};

export const parseArgs = (argv) => {
  const args = {
    jobIds: [],
    limit: DEFAULT_JOB_LIMIT,
    bucket: DEFAULT_BUCKET,
    json: false,
    skipStorageCheck: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === 'json' || key === 'help') {
      args[key] = true;
      continue;
    }
    if (key === 'skip-storage-check') {
      args.skipStorageCheck = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    if (key === 'job-id') {
      args.jobIds.push(value);
    } else if (key === 'limit') {
      args.limit = parsePositiveIntegerOption(key, value);
    } else if (key === 'project-id') {
      args.projectId = value;
    } else if (key === 'bucket') {
      args.bucket = value;
    } else {
      throw new Error(`Unsupported option: --${key}`);
    }
    index += 1;
  }

  if (!args.help && !args.projectId && args.jobIds.length === 0) {
    throw new Error('Provide --project-id or at least one --job-id.');
  }

  return args;
};

export const requireEnv = (env = process.env) => {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return { supabaseUrl, serviceRoleKey };
};

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const objectKeys = (value) => (isRecord(value) ? Object.keys(value) : []);

const getPayload = (job) => (isRecord(job?.provider_payload) ? job.provider_payload : {});

const getMetadata = (asset) => (isRecord(asset?.metadata) ? asset.metadata : {});

const hasMaterialTransform = (metadata) => {
  const transforms = metadata.transforms;
  if (!isRecord(transforms)) return false;
  const position = isRecord(transforms.position) ? transforms.position : {};
  const scale = isRecord(transforms.scale) ? transforms.scale : {};
  const numberOr = (value, fallback) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  return (
    numberOr(position.x, 0) !== 0 ||
    numberOr(position.y, 0) !== 0 ||
    numberOr(scale.x, 1) !== 1 ||
    numberOr(scale.y, 1) !== 1 ||
    numberOr(transforms.rotation, 0) !== 0 ||
    numberOr(transforms.opacity, 1) !== 1
  );
};

export const isStyledTimelineAsset = (asset) => {
  const metadata = getMetadata(asset);
  return (
    hasMaterialTransform(metadata) ||
    (isRecord(metadata.transition) && metadata.transition.type !== 'none') ||
    (Array.isArray(metadata.effects) && metadata.effects.length > 0) ||
    (Array.isArray(metadata.keyframes) && metadata.keyframes.length > 0)
  );
};

export const summarizeTimelineAssets = (assets = []) => {
  const visuals = assets.filter((asset) => asset.asset_type === 'image' || asset.asset_type === 'video');
  const audio = assets.filter((asset) => asset.asset_type === 'audio');
  const editorTimelineAssets = assets.filter((asset) => getMetadata(asset).source === 'editor_timeline');
  const trimmedVideoAssets = visuals.filter((asset) => {
    const metadata = getMetadata(asset);
    return asset.asset_type === 'video' && (metadata.trim_start_ms > 0 || metadata.trim_end_ms > 0);
  });
  const cachedMetadataAssets = assets.filter((asset) => objectKeys(getMetadata(asset).media_metadata).length > 0);
  const styledVisualAssets = visuals.filter(isStyledTimelineAsset);

  return {
    total: assets.length,
    visual: visuals.length,
    video: visuals.filter((asset) => asset.asset_type === 'video').length,
    image: visuals.filter((asset) => asset.asset_type === 'image').length,
    audio: audio.length,
    editorTimelineAssets: editorTimelineAssets.length,
    trimmedVideoAssets: trimmedVideoAssets.length,
    cachedMetadataAssets: cachedMetadataAssets.length,
    styledVisualAssets: styledVisualAssets.length,
  };
};

const isCompletedJob = (job) =>
  job.status === 'completed' && job.provider_status === 'completed' && typeof job.output_url === 'string';

const isValidRemotionManifest = (manifest) =>
  isRecord(manifest) &&
  manifest.renderer === 'remotion' &&
  isRecord(manifest.inputProps) &&
  typeof manifest.entryPoint === 'string' &&
  typeof manifest.compositionId === 'string';

const renderWarningCount = (job) => {
  const payload = getPayload(job);
  if (Array.isArray(payload.renderWarnings)) return payload.renderWarnings.length;
  return typeof payload.renderWarningCount === 'number' ? payload.renderWarningCount : 0;
};

export const extractStoragePathFromPublicUrl = (url, bucket = DEFAULT_BUCKET) => {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    const parsed = new URL(url);
    const publicMarker = `/storage/v1/object/public/${bucket}/`;
    const signedMarker = `/storage/v1/object/sign/${bucket}/`;
    const marker = parsed.pathname.includes(publicMarker) ? publicMarker : signedMarker;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
};

export const getOutputStoragePath = (job, bucket = DEFAULT_BUCKET) => {
  const payload = getPayload(job);
  if (typeof payload.outputPath === 'string' && payload.outputPath.length > 0) {
    return payload.outputPath;
  }
  return extractStoragePathFromPublicUrl(job?.output_url, bucket);
};

export const isOutputPathScopedToJob = (job, bucket = DEFAULT_BUCKET) => {
  const storagePath = getOutputStoragePath(job, bucket);
  if (!storagePath) return false;
  if (job.provider === 'remotion_worker') {
    return storagePath.startsWith(`${job.user_id}/${job.project_id}/${job.id}/`);
  }
  if (job.provider === 'fal_remote') {
    return storagePath.startsWith(`${job.project_id}/${job.id}/`);
  }
  return true;
};

const getBlobSize = async (value) => {
  if (!value) return 0;
  if (typeof value.size === 'number') return value.size;
  if (typeof value.arrayBuffer === 'function') {
    const buffer = await value.arrayBuffer();
    return buffer.byteLength;
  }
  if (value instanceof Uint8Array) return value.byteLength;
  return 0;
};

export const buildSkippedStorageChecks = (jobs, bucket = DEFAULT_BUCKET) =>
  jobs.filter(isCompletedJob).map((job) => ({
    jobId: job.id,
    provider: job.provider,
    bucket,
    path: getOutputStoragePath(job, bucket),
    ok: false,
    skipped: true,
    reason: 'storage check skipped',
  }));

export const verifyStorageOutputs = async (supabaseAdmin, jobs, bucket = DEFAULT_BUCKET) => {
  const checks = [];
  for (const job of jobs.filter(isCompletedJob)) {
    const storagePath = getOutputStoragePath(job, bucket);
    if (!storagePath) {
      checks.push({
        jobId: job.id,
        provider: job.provider,
        bucket,
        path: null,
        ok: false,
        reason: 'output_url does not resolve to a Supabase Storage path',
      });
      continue;
    }

    const { data, error } = await supabaseAdmin.storage.from(bucket).download(storagePath);
    const size = error ? 0 : await getBlobSize(data);
    checks.push({
      jobId: job.id,
      provider: job.provider,
      bucket,
      path: storagePath,
      ok: !error && size > 0,
      bytes: size,
      reason: error?.message ?? null,
    });
  }
  return checks;
};

const buildCheck = (id, ok, evidence, expected) => ({ id, ok, evidence, expected });

export const buildLiveInspectionReport = ({
  projectId,
  jobs = [],
  assets = [],
  storageChecks = [],
  bucket = DEFAULT_BUCKET,
}) => {
  const assetSummary = summarizeTimelineAssets(assets);
  const mismatchedJobs = projectId
    ? jobs.filter((job) => job.project_id !== projectId)
    : [];
  const falCompleted = jobs.filter((job) => job.provider === 'fal_remote' && isCompletedJob(job));
  const remotionCompleted = jobs.filter((job) => job.provider === 'remotion_worker' && isCompletedJob(job));
  const completedJobs = jobs.filter(isCompletedJob);
  const storageCheckByJob = new Map(storageChecks.map((check) => [check.jobId, check]));

  const checks = [
    buildCheck(
      'jobs_match_inspected_project',
      mismatchedJobs.length === 0,
      mismatchedJobs.map((job) => ({ jobId: job.id, projectId: job.project_id })),
      'all inspected export jobs belong to the inspected project'
    ),
    buildCheck(
      'timeline_assets_hydrated_from_editor',
      assetSummary.editorTimelineAssets > 0,
      assetSummary.editorTimelineAssets,
      'at least one timeline_assets row with metadata.source=editor_timeline'
    ),
    buildCheck('timeline_has_visual_clip', assetSummary.visual > 0, assetSummary.visual, 'at least one visual asset'),
    buildCheck('timeline_has_trimmed_video', assetSummary.trimmedVideoAssets > 0, assetSummary.trimmedVideoAssets, 'at least one trimmed video asset'),
    buildCheck('timeline_has_audio', assetSummary.audio > 0, assetSummary.audio, 'at least one audio asset'),
    buildCheck(
      'timeline_has_cached_metadata',
      assetSummary.cachedMetadataAssets > 0,
      assetSummary.cachedMetadataAssets,
      'at least one asset with cached media metadata'
    ),
    buildCheck(
      'timeline_has_styled_clip',
      assetSummary.styledVisualAssets > 0,
      assetSummary.styledVisualAssets,
      'at least one visual asset with transforms, transition, effects, or keyframes'
    ),
    buildCheck('fal_export_completed', falCompleted.length > 0, falCompleted.map((job) => job.id), 'completed fal_remote job'),
    buildCheck(
      'fal_export_audio_payload',
      falCompleted.length > 0 &&
        falCompleted.every((job) => getPayload(job).audioIncluded === true && getPayload(job).audioTrackCount > 0),
      falCompleted.map((job) => ({
        jobId: job.id,
        audioIncluded: getPayload(job).audioIncluded,
        audioTrackCount: getPayload(job).audioTrackCount,
      })),
      'all completed fal_remote jobs have audioIncluded=true and audioTrackCount > 0'
    ),
    buildCheck(
      'fal_export_styled_warning_payload',
      falCompleted.length > 0 && falCompleted.every((job) => renderWarningCount(job) > 0),
      falCompleted.map((job) => ({ jobId: job.id, renderWarningCount: renderWarningCount(job) })),
      'all completed fal_remote jobs have render warnings for styled editor features'
    ),
    buildCheck(
      'remotion_export_completed',
      remotionCompleted.length > 0,
      remotionCompleted.map((job) => job.id),
      'completed remotion_worker job'
    ),
    buildCheck(
      'remotion_manifest_present',
      remotionCompleted.length > 0 &&
        remotionCompleted.every((job) => isValidRemotionManifest(getPayload(job).remotionManifest)),
      remotionCompleted.map((job) => ({
        jobId: job.id,
        validManifest: isValidRemotionManifest(getPayload(job).remotionManifest),
      })),
      'all completed remotion_worker jobs have provider_payload.remotionManifest'
    ),
    buildCheck(
      'remotion_export_no_render_warnings',
      remotionCompleted.length > 0 && remotionCompleted.every((job) => renderWarningCount(job) === 0),
      remotionCompleted.map((job) => ({ jobId: job.id, renderWarningCount: renderWarningCount(job) })),
      'all completed remotion_worker jobs have zero render warnings'
    ),
    buildCheck(
      'storage_outputs_verified',
      completedJobs.length > 0 && completedJobs.every((job) => storageCheckByJob.get(job.id)?.ok === true),
      completedJobs.map((job) => storageCheckByJob.get(job.id) ?? { jobId: job.id, ok: false }),
      `all completed jobs download from ${bucket} with nonzero bytes`
    ),
    buildCheck(
      'storage_paths_scoped_to_jobs',
      completedJobs.length > 0 && completedJobs.every((job) => isOutputPathScopedToJob(job, bucket)),
      completedJobs.map((job) => ({
        jobId: job.id,
        provider: job.provider,
        path: getOutputStoragePath(job, bucket),
        scoped: isOutputPathScopedToJob(job, bucket),
      })),
      'FAL paths use <project_id>/<job_id>/ and Remotion paths use <user_id>/<project_id>/<job_id>/'
    ),
  ];

  return {
    ok: checks.every((check) => check.ok),
    projectId: projectId ?? jobs[0]?.project_id ?? null,
    bucket,
    jobCount: jobs.length,
    completedJobCount: completedJobs.length,
    jobs: jobs.map((job) => ({
      id: job.id,
      projectId: job.project_id,
      provider: job.provider,
      status: job.status,
      providerStatus: job.provider_status,
      outputUrlSet: typeof job.output_url === 'string' && job.output_url.length > 0,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at,
    })),
    assetSummary,
    storageChecks,
    checks,
  };
};

const createSupabaseAdmin = (env = process.env) => {
  const { supabaseUrl, serviceRoleKey } = requireEnv(env);
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const loadJobById = async (supabaseAdmin, jobId) => {
  const { data, error } = await supabaseAdmin
    .from('export_jobs')
    .select(JOB_COLUMNS)
    .eq('id', jobId)
    .single();
  if (error || !data) throw new Error(`Failed to load export job ${jobId}: ${error?.message ?? 'not found'}`);
  return data;
};

const loadProjectJobs = async (supabaseAdmin, projectId, limit = DEFAULT_JOB_LIMIT) => {
  const { data, error } = await supabaseAdmin
    .from('export_jobs')
    .select(JOB_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load export jobs for project ${projectId}: ${error.message}`);
  return data ?? [];
};

const loadExportJobs = async (supabaseAdmin, args) => {
  const jobs = [];
  for (const jobId of args.jobIds) {
    jobs.push(await loadJobById(supabaseAdmin, jobId));
  }
  if (args.projectId && args.jobIds.length === 0) {
    jobs.push(...await loadProjectJobs(supabaseAdmin, args.projectId, args.limit));
  }
  return [...new Map(jobs.map((job) => [job.id, job])).values()];
};

const loadTimelineAssets = async (supabaseAdmin, projectId) => {
  if (!projectId) return [];
  const { data, error } = await supabaseAdmin
    .from('timeline_assets')
    .select(ASSET_COLUMNS)
    .eq('project_id', projectId)
    .order('position_order', { ascending: true });
  if (error) throw new Error(`Failed to load timeline_assets for project ${projectId}: ${error.message}`);
  return data ?? [];
};

export const inspectLiveDirectorCut = async ({ supabaseAdmin, args }) => {
  const jobs = await loadExportJobs(supabaseAdmin, args);
  const projectId = args.projectId ?? jobs[0]?.project_id ?? null;
  const assets = await loadTimelineAssets(supabaseAdmin, projectId);
  const storageChecks = args.skipStorageCheck
    ? buildSkippedStorageChecks(jobs, args.bucket)
    : await verifyStorageOutputs(supabaseAdmin, jobs, args.bucket);

  return buildLiveInspectionReport({
    projectId,
    jobs,
    assets,
    storageChecks,
    bucket: args.bucket,
  });
};

const printTextReport = (report) => {
  console.log(`Director's Cut live inspection`);
  console.log(`projectId=${report.projectId ?? 'unknown'}`);
  console.log(`jobs=${report.jobCount}`);
  console.log(`completedJobs=${report.completedJobCount}`);
  console.log(`assets.total=${report.assetSummary.total}`);
  console.log(`assets.visual=${report.assetSummary.visual}`);
  console.log(`assets.audio=${report.assetSummary.audio}`);
  console.log(`assets.trimmedVideo=${report.assetSummary.trimmedVideoAssets}`);
  console.log(`assets.styledVisual=${report.assetSummary.styledVisualAssets}`);
  for (const check of report.checks) {
    console.log(`${check.id}=${check.ok ? 'ok' : 'fail'}`);
  }
  console.log(report.ok ? 'status=ready' : 'status=incomplete');
};

export const main = async (argv = process.argv.slice(2), env = loadDirectorCutEnv()) => {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  const report = await inspectLiveDirectorCut({
    supabaseAdmin: createSupabaseAdmin(env),
    args,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }

  return report.ok ? 0 : 1;
};

const isCliEntrypoint = () => process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;

if (isCliEntrypoint()) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exitCode = 1;
  }
}
