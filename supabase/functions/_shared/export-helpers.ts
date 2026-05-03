// ============================================================================
// SHARED: export-helpers.ts
// PURPOSE: Remote video stitching via fal first, Editframe fallback.
// ============================================================================

import {
  buildEditframeCompositionHtml,
  type EditframeCompositionAsset,
} from '../../../shared/editframeComposition.ts';

export interface ExportAsset {
  id: string;
  type: 'image' | 'video' | 'audio';
  subtype?: 'voiceover' | 'sfx' | 'music' | 'visual';
  url: string;
  duration_ms?: number;
  order_index: number;
  metadata?: Record<string, unknown>;
}

export interface ExportSettings {
  resolution?: string;
  fps?: number;
  codec?: string;
  quality?: string;
  includeAudio?: boolean;
  provider?: 'auto' | 'fal' | 'editframe';
}

export interface ShotFailure {
  assetId: string;
  orderIndex: number;
  reason: string;
}

export interface ProcessAssetsResult {
  publicUrl: string;
  shotFailures: ShotFailure[];
  provider: 'fal_remote' | 'editframe_remote';
  fallbackUsed: boolean;
  providerPayload: Record<string, unknown>;
}

export class ExportProcessingError extends Error {
  providerPayload: Record<string, unknown>;
  shotFailures: ShotFailure[];

  constructor(message: string, providerPayload: Record<string, unknown> = {}, shotFailures: ShotFailure[] = []) {
    super(message);
    this.name = 'ExportProcessingError';
    this.providerPayload = providerPayload;
    this.shotFailures = shotFailures;
  }
}

class FalRenderError extends Error {
  requestId: string;
  modelId: string;

  constructor(message: string, requestId: string, modelId: string) {
    super(message);
    this.name = 'FalRenderError';
    this.requestId = requestId;
    this.modelId = modelId;
  }
}

const FAL_QUEUE_URL = 'https://queue.fal.run';
const MERGE_MODEL = 'fal-ai/ffmpeg-api/merge-videos';
const COMPOSE_MODEL = 'fal-ai/ffmpeg-api/compose';
const EDITFRAME_RENDERER = 'editframe/render-api';
const MAX_POLL = 180;
const POLL_MS = 3000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseResolution(resolution = '1920x1080') {
  const [rawWidth, rawHeight] = resolution.split('x').map(Number);
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? Math.round(rawWidth) : 1920;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? Math.round(rawHeight) : 1080;
  return { width, height };
}

function assetDuration(asset: ExportAsset): number {
  return asset.duration_ms ?? getNumber(asset.metadata?.duration_ms, asset.type === 'video' ? 6000 : 5000);
}

function assetStartMs(asset: ExportAsset, fallback: number): number {
  return getNumber(asset.metadata?.start_ms, getNumber(asset.metadata?.startTime, fallback));
}

function normalizeUrl(url: string): string {
  return url.trim();
}

export function extractVideoUrl(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractVideoUrl(item);
      if (found) return found;
    }
    return null;
  }

  const o = obj as Record<string, unknown>;
  const directCandidates = [o.video_url, o.output_url, o.file_url, o.url];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.startsWith('http')) {
      return candidate;
    }
  }

  for (const v of Object.values(o)) {
    if (!v || typeof v !== 'object') continue;
    const found = extractVideoUrl(v);
    if (found) return found;
  }
  return null;
}

async function falQueueSubmit(modelId: string, input: Record<string, unknown>, falKey: string) {
  const res = await fetch(`${FAL_QUEUE_URL}/${modelId}`, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`FAL submit failed (${res.status}): ${text}`);
  return JSON.parse(text) as { request_id: string; status_url?: string; response_url?: string };
}

async function falPollUntilDone(requestId: string, statusUrl: string | undefined, falKey: string) {
  const base = statusUrl || `${FAL_QUEUE_URL}/requests/${requestId}/status`;
  for (let i = 0; i < MAX_POLL; i++) {
    const res = await fetch(`${base}?logs=1`, {
      headers: { Authorization: `Key ${falKey}` },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`FAL poll failed (${res.status}) for ${requestId}: ${text}`);
    const data = JSON.parse(text);
    if (data.status === 'COMPLETED') return data;
    if (data.status === 'FAILED') {
      const logMessage = Array.isArray(data.logs)
        ? data.logs.map((log: Record<string, unknown>) => log.message).filter(Boolean).join(' ')
        : '';
      throw new Error(`FAL job failed for ${requestId}${logMessage ? `: ${logMessage}` : ''}`);
    }
    await wait(POLL_MS);
  }
  throw new Error(`FAL poll timeout for ${requestId}`);
}

async function falGetResult(responseUrl: string, falKey: string) {
  const res = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } });
  if (!res.ok) throw new Error(`FAL result fetch failed (${res.status})`);
  return res.json();
}

async function runFalForVideoUrl(
  modelId: string,
  input: Record<string, unknown>,
  falKey: string
): Promise<{ url: string; requestId: string }> {
  const sub = await falQueueSubmit(modelId, input, falKey);
  try {
    const status = await falPollUntilDone(sub.request_id, sub.status_url, falKey);

    let videoUrl: string | null = extractVideoUrl(status);
    if (!videoUrl && sub.response_url) {
      const result = await falGetResult(sub.response_url, falKey);
      videoUrl = extractVideoUrl(result);
    }
    if (!videoUrl) {
      throw new Error(`${modelId} request ${sub.request_id} returned no output video URL`);
    }
    return { url: videoUrl, requestId: sub.request_id };
  } catch (error) {
    throw new FalRenderError(errorMessage(error, `${modelId} request failed`), sub.request_id, modelId);
  }
}

async function isUrlReachable(url: string): Promise<{ ok: boolean; reason?: string }> {
  const normalized = normalizeUrl(url);
  if (!normalized) return { ok: false, reason: 'Missing URL' };
  if (normalized.startsWith('data:')) return { ok: true };
  if (!/^https?:\/\//i.test(normalized)) return { ok: false, reason: 'URL must be http(s) or data URI' };

  try {
    const head = await fetch(normalized, { method: 'HEAD' });
    if (head.ok) return { ok: true };
    if (![403, 405, 501].includes(head.status)) {
      return { ok: false, reason: `URL preflight failed (${head.status})` };
    }
  } catch {
    // Some media hosts reject HEAD; try a minimal GET before declaring failure.
  }

  try {
    const get = await fetch(normalized, { headers: { Range: 'bytes=0-0' } });
    if (get.ok || get.status === 206) return { ok: true };
    return { ok: false, reason: `URL range preflight failed (${get.status})` };
  } catch (error) {
    return { ok: false, reason: errorMessage(error, 'URL preflight request failed') };
  }
}

async function preflightAssets(assets: ExportAsset[]) {
  const usable: ExportAsset[] = [];
  const failures: ShotFailure[] = [];

  for (const asset of assets) {
    const result = await isUrlReachable(asset.url);
    if (result.ok) {
      usable.push({ ...asset, url: normalizeUrl(asset.url) });
    } else {
      failures.push({
        assetId: asset.id,
        orderIndex: asset.order_index,
        reason: result.reason ?? 'URL preflight failed',
      });
    }
  }

  return { usable, failures };
}

function buildFalTracks(visualAssets: ExportAsset[], audioAssets: ExportAsset[]) {
  const tracks: Array<{
    id: string;
    type: 'video' | 'audio' | 'image';
    keyframes: Array<{ timestamp: number; duration: number; url: string }>;
  }> = [];
  let cursorMs = 0;

  visualAssets.forEach((asset, index) => {
    const duration = assetDuration(asset);
    const timestamp = assetStartMs(asset, cursorMs);
    tracks.push({
      id: `visual-${index}`,
      type: asset.type === 'image' ? 'image' : 'video',
      keyframes: [{ timestamp, duration, url: asset.url }],
    });
    cursorMs = Math.max(cursorMs, timestamp + duration);
  });

  audioAssets.forEach((asset, index) => {
    tracks.push({
      id: `${asset.subtype ?? 'audio'}-${index}`,
      type: 'audio',
      keyframes: [
        {
          timestamp: getNumber(asset.metadata?.start_ms, 0),
          duration: asset.duration_ms ?? getNumber(asset.metadata?.duration_ms, cursorMs || 5000),
          url: asset.url,
        },
      ],
    });
  });

  return tracks;
}

async function updateJobPayload(
  supabaseAdmin: any,
  jobId: string,
  payload: Record<string, unknown>,
  progress?: number,
  extra: Record<string, unknown> = {}
) {
  const patch: Record<string, unknown> = {
    provider_payload: payload,
    ...extra,
  };
  if (typeof progress === 'number') {
    patch.progress = progress;
  }
  await supabaseAdmin.from('export_jobs').update(patch).eq('id', jobId);
}

async function uploadFinalVideo(
  supabaseAdmin: any,
  projectId: string,
  jobId: string,
  exportBucket: string,
  bytes: Uint8Array
) {
  const outputPath = `${projectId}/${jobId}/final_export_${Date.now()}.mp4`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(exportBucket)
    .upload(outputPath, bytes, { contentType: 'video/mp4', upsert: true });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: { publicUrl } } = supabaseAdmin.storage.from(exportBucket).getPublicUrl(outputPath);
  return publicUrl as string;
}

async function downloadVideoBytes(url: string): Promise<Uint8Array> {
  const videoRes = await fetch(url);
  if (!videoRes.ok) throw new Error(`Failed to download provider video: ${videoRes.statusText}`);
  return new Uint8Array(await videoRes.arrayBuffer());
}

async function renderWithFal(
  supabaseAdmin: any,
  jobId: string,
  visuals: ExportAsset[],
  audioAssets: ExportAsset[],
  falKey: string,
  settings: ExportSettings,
  shotFailures: ShotFailure[]
) {
  const { resolution = '1920x1080', fps = 30 } = settings;
  const { width, height } = parseResolution(resolution);
  const allVideos = visuals.every((asset) => asset.type === 'video');

  if (audioAssets.length === 0 && allVideos) {
    if (visuals.length === 1) {
      await updateJobPayload(
        supabaseAdmin,
        jobId,
        { stage: 'downloading_assets', renderer: 'direct_video', shotFailures },
        80
      );
      return { url: visuals[0].url, renderer: 'direct_video', requestId: null as string | null };
    }

    const mergeInput: Record<string, unknown> = {
      video_urls: visuals.map((asset) => asset.url),
      target_fps: fps,
    };
    if (width >= 512 && height >= 512 && width <= 2048 && height <= 2048) {
      mergeInput.resolution = { width, height };
    }

    await updateJobPayload(
      supabaseAdmin,
      jobId,
      { stage: 'provider_processing', renderer: MERGE_MODEL, visualTracks: visuals.length, shotFailures },
      65
    );
    const result = await runFalForVideoUrl(MERGE_MODEL, mergeInput, falKey);
    return { url: result.url, renderer: MERGE_MODEL, requestId: result.requestId };
  }

  await updateJobPayload(
    supabaseAdmin,
    jobId,
    {
      stage: 'provider_processing',
      renderer: COMPOSE_MODEL,
      visualTracks: visuals.length,
      audioTracks: audioAssets.length,
      shotFailures,
    },
    45
  );

  const result = await runFalForVideoUrl(COMPOSE_MODEL, { tracks: buildFalTracks(visuals, audioAssets) }, falKey);
  return { url: result.url, renderer: COMPOSE_MODEL, requestId: result.requestId };
}

function toEditframeAsset(asset: ExportAsset): EditframeCompositionAsset {
  const metadata = asset.metadata ?? {};
  return {
    id: asset.id,
    type: asset.type,
    url: asset.url,
    name: typeof metadata.name === 'string' ? metadata.name : undefined,
    durationMs: asset.duration_ms ?? getOptionalNumber(metadata.duration_ms),
    orderIndex: asset.order_index,
    startMs: getOptionalNumber(metadata.start_ms),
    trimStartMs: getOptionalNumber(metadata.trimStartMs) ?? getOptionalNumber(metadata.trim_start_ms),
    trimEndMs: getOptionalNumber(metadata.trimEndMs) ?? getOptionalNumber(metadata.trim_end_ms),
    volume: getNumber(metadata.volume, 1),
    muted: metadata.isMuted === true,
    role: asset.subtype,
    transforms: metadata.transforms as EditframeCompositionAsset['transforms'],
    metadata,
  };
}

async function renderWithEditframeFallback(
  supabaseAdmin: any,
  projectId: string,
  jobId: string,
  exportBucket: string,
  assets: ExportAsset[],
  settings: ExportSettings,
  falError: string,
  shotFailures: ShotFailure[],
  fallbackUsed = true,
  falRequestId?: string
): Promise<ProcessAssetsResult> {
  const editframeKey = Deno.env.get('EDITFRAME_API_KEY');
  const fallbackBasePayload = {
    stage: 'fallback_processing',
    renderer: EDITFRAME_RENDERER,
    fallbackReason: fallbackUsed ? 'fal_failed' : 'editframe_selected',
    falError,
    ...(falRequestId ? { falRequestId } : {}),
    shotFailures,
    failedShotCount: shotFailures.length,
  };

  if (!editframeKey) {
    const payload = {
      ...fallbackBasePayload,
      stage: 'failed',
      fallbackStatus: 'unavailable',
      fallbackError: 'EDITFRAME_API_KEY is not configured',
    };
    await updateJobPayload(supabaseAdmin, jobId, payload, undefined, {
      provider: fallbackUsed ? 'fal_remote' : 'editframe_remote',
      provider_status: 'failed',
      fallback_used: fallbackUsed,
    });
    throw new ExportProcessingError(
      `${falError}. Editframe fallback unavailable: EDITFRAME_API_KEY is not configured`,
      payload,
      shotFailures
    );
  }

  await updateJobPayload(supabaseAdmin, jobId, fallbackBasePayload, 55, {
    provider: 'editframe_remote',
    provider_status: 'processing',
    fallback_used: fallbackUsed,
  });

  try {
    const { Client, createRender, getRenderProgress, downloadRender } =
      await import('https://esm.sh/@editframe/api');
    const { width, height } = parseResolution(settings.resolution);
    const composition = buildEditframeCompositionHtml(assets.map(toEditframeAsset), {
      width,
      height,
      fps: settings.fps ?? 30,
      compositionId: `wzrd-export-${jobId}`,
    });
    const client = new Client(editframeKey);
    const render = await createRender(client, {
      html: composition.html,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      duration_ms: composition.durationMs,
      output: {
        container: 'mp4',
        video: { codec: 'h264' },
        audio: { codec: 'aac' },
      },
    });
    const renderId = String(render?.id ?? render?.render_id ?? render?.renderId ?? '');
    if (!renderId) {
      throw new Error('Editframe createRender returned no render id');
    }

    await updateJobPayload(
      supabaseAdmin,
      jobId,
      { ...fallbackBasePayload, editframeRenderId: renderId, durationMs: composition.durationMs },
      60,
      { provider_job_id: renderId }
    );

    const progressIterator = await getRenderProgress(client, renderId);
    for await (const event of progressIterator) {
      const rawProgress = getNumber(event?.progress, 0);
      const normalized = rawProgress > 1 ? rawProgress / 100 : rawProgress;
      const progress = 60 + Math.round(Math.min(1, Math.max(0, normalized)) * 20);
      await updateJobPayload(
        supabaseAdmin,
        jobId,
        { ...fallbackBasePayload, editframeRenderId: renderId, fallbackStatus: 'rendering' },
        progress
      );
    }

    await updateJobPayload(
      supabaseAdmin,
      jobId,
      { ...fallbackBasePayload, editframeRenderId: renderId, stage: 'downloading_assets' },
      85
    );
    const response = await downloadRender(client, renderId);
    if (!response.ok) {
      throw new Error(`Editframe download failed (${response.status})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());

    await updateJobPayload(
      supabaseAdmin,
      jobId,
      { ...fallbackBasePayload, editframeRenderId: renderId, stage: 'uploading_final_video' },
      90
    );
    const publicUrl = await uploadFinalVideo(supabaseAdmin, projectId, jobId, exportBucket, bytes);
    const providerPayload = {
      ...fallbackBasePayload,
      editframeRenderId: renderId,
      stage: 'completed',
      fallbackStatus: 'completed',
    };
    await updateJobPayload(supabaseAdmin, jobId, providerPayload, 95);

    return {
      publicUrl,
      shotFailures,
      provider: 'editframe_remote',
      fallbackUsed,
      providerPayload,
    };
  } catch (fallbackError) {
    const message = errorMessage(fallbackError, 'Editframe fallback failed');
    const payload = {
      ...fallbackBasePayload,
      stage: 'failed',
      fallbackStatus: 'failed',
      fallbackError: message,
    };
    await updateJobPayload(supabaseAdmin, jobId, payload, undefined, {
      provider: 'editframe_remote',
      provider_status: 'failed',
      fallback_used: fallbackUsed,
    });
    throw new ExportProcessingError(`FAL failed: ${falError}. Editframe fallback failed: ${message}`, payload, shotFailures);
  }
}

/**
 * Process assets remotely through fal first, then Editframe fallback.
 */
export async function processAssetsRemote(
  supabaseAdmin: any,
  projectId: string,
  assets: ExportAsset[],
  jobId: string,
  exportBucket: string,
  settings: ExportSettings = {}
): Promise<ProcessAssetsResult> {
  const sorted = [...assets].sort((a, b) => a.order_index - b.order_index);
  const initialVisualCount = sorted.filter((a) => a.type === 'image' || a.type === 'video').length;
  if (initialVisualCount === 0) throw new Error('No visual assets available for export');

  await updateJobPayload(
    supabaseAdmin,
    jobId,
    { stage: 'preflighting_assets', renderer: 'url_preflight', totalAssets: sorted.length },
    15
  );

  const preflight = await preflightAssets(sorted);
  const shotFailures = preflight.failures;
  const visuals = preflight.usable.filter((a) => a.type === 'image' || a.type === 'video');
  const audioAssets = preflight.usable.filter((a) => a.type === 'audio' && settings.includeAudio !== false);

  if (visuals.length === 0) {
    const payload = {
      stage: 'failed',
      renderer: 'url_preflight',
      shotFailures,
      failedShotCount: shotFailures.length,
    };
    await updateJobPayload(supabaseAdmin, jobId, payload);
    throw new ExportProcessingError(`All ${initialVisualCount} visual assets failed preflight`, payload, shotFailures);
  }

  const falKey = Deno.env.get('FAL_KEY');
  if (settings.provider === 'editframe') {
    return renderWithEditframeFallback(
      supabaseAdmin,
      projectId,
      jobId,
      exportBucket,
      [...visuals, ...audioAssets],
      settings,
      'Editframe selected by export settings',
      shotFailures,
      false
    );
  }

  try {
    if (!falKey) {
      throw new Error('FAL_KEY is not configured');
    }

    const falResult = await renderWithFal(supabaseAdmin, jobId, visuals, audioAssets, falKey, settings, shotFailures);
    const providerPayload = {
      stage: 'downloading_assets',
      renderer: falResult.renderer,
      providerJobId: falResult.requestId,
      shotFailures,
      failedShotCount: shotFailures.length,
    };
    await updateJobPayload(supabaseAdmin, jobId, providerPayload, 85, {
      provider: 'fal_remote',
      provider_status: 'processing',
      provider_job_id: falResult.requestId,
    });

    const bytes = await downloadVideoBytes(falResult.url);
    await updateJobPayload(
      supabaseAdmin,
      jobId,
      { ...providerPayload, stage: 'uploading_final_video' },
      90
    );
    const publicUrl = await uploadFinalVideo(supabaseAdmin, projectId, jobId, exportBucket, bytes);
    const completedPayload = {
      ...providerPayload,
      stage: 'completed',
      partialSuccess: shotFailures.length > 0,
    };
    await updateJobPayload(supabaseAdmin, jobId, completedPayload, 95);

    return {
      publicUrl,
      shotFailures,
      provider: 'fal_remote',
      fallbackUsed: false,
      providerPayload: completedPayload,
    };
  } catch (falError) {
    const falMessage = errorMessage(falError, 'FAL render failed');
    const falRequestId = falError instanceof FalRenderError ? falError.requestId : undefined;
    console.warn('FAL render failed; attempting Editframe fallback:', falMessage);
    await updateJobPayload(
      supabaseAdmin,
      jobId,
      {
        stage: 'fallback_processing',
        renderer: EDITFRAME_RENDERER,
        fallbackReason: 'fal_failed',
        falError: falMessage,
        ...(falRequestId ? { falRequestId } : {}),
        shotFailures,
        failedShotCount: shotFailures.length,
      },
      50
    );

    return renderWithEditframeFallback(
      supabaseAdmin,
      projectId,
      jobId,
      exportBucket,
      [...visuals, ...audioAssets],
      settings,
      falMessage,
      shotFailures,
      true,
      falRequestId
    );
  }
}
