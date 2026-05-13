// @ts-nocheck
// ============================================================================
// SHARED: export-helpers.ts
// PURPOSE: Remote video stitching via fal first, Editframe fallback.
// ============================================================================

import {
  buildEditframeCompositionHtml,
  type EditframeCompositionAsset,
} from './editframeComposition.ts';
import { safeLog } from './safe-logger.ts';
import {
  extractFrame as falExtractFrame,
  extractMediaUrl as falExtractMediaUrl,
  loudnorm as falLoudnorm,
  mergeAudioVideo as falMergeAudioVideo,
  mergeAudios as falMergeAudios,
  metadata as falMetadata,
  normalizeMediaInfo,
  type FfmpegMediaInfo,
} from './fal-ffmpeg.ts';

export interface ExportAsset {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'element';
  subtype?: 'voiceover' | 'sfx' | 'music' | 'visual' | 'text' | 'element';
  url?: string;
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
  renderMode?: 'sync' | 'async';
}

export interface ShotFailure {
  assetId: string;
  orderIndex: number;
  reason: string;
}

interface FalComposeKeyframe {
  url: string;
  timestamp: number;
  duration: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
interface FalComposeTrack {
  id: string;
  type: 'video' | 'audio' | 'image' | 'text';
  keyframes: FalComposeKeyframe[];
}
type FalTrack = FalComposeTrack;

export interface ProcessAssetsResult {
  publicUrl: string;
  shotFailures: ShotFailure[];
  provider: 'fal_remote' | 'editframe_remote';
  fallbackUsed: boolean;
  providerPayload: Record<string, unknown>;
  posterFrameUrl?: string | null;
  mediaInfo?: FfmpegMediaInfo | null;
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
const MERGE_AUDIO_VIDEO_MODEL = 'fal-ai/ffmpeg-api/merge-audio-video';
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

export function getEditframeSetupStatus() {
  const hasApiKey = Boolean(Deno.env.get('EDITFRAME_API_KEY'));
  const hasWebhookSecret = Boolean(Deno.env.get('EDITFRAME_WEBHOOK_SECRET'));
  const setupErrors = [
    !hasApiKey ? 'EDITFRAME_API_KEY is not configured' : '',
    !hasWebhookSecret ? 'EDITFRAME_WEBHOOK_SECRET is not configured' : '',
  ].filter(Boolean);

  return {
    provider: 'editframe',
    renderer: EDITFRAME_RENDERER,
    hasApiKey,
    hasWebhookSecret,
    ready: setupErrors.length === 0,
    setupErrors,
  };
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

function chooseFalRenderer(visualAssets: ExportAsset[], audioAssets: ExportAsset[]) {
  const allVideos = visualAssets.length > 0 && visualAssets.every((asset) => asset.type === 'video');
  if (audioAssets.length === 0 && allVideos) {
    return visualAssets.length === 1 ? 'direct_video' : MERGE_MODEL;
  }
  return COMPOSE_MODEL;
}

function renderDiagnostics(
  visualAssets: ExportAsset[],
  audioAssets: ExportAsset[],
  renderer: string,
  settings: ExportSettings
) {
  let cursorMs = 0;
  const visualTimings = visualAssets.map((asset) => {
    const duration = assetDuration(asset);
    const timestamp = assetStartMs(asset, cursorMs);
    cursorMs = Math.max(cursorMs, timestamp + duration);
    return {
      assetId: asset.id,
      type: asset.type,
      orderIndex: asset.order_index,
      startMs: timestamp,
      durationMs: duration,
      hasUrl: Boolean(asset.url),
    };
  });

  const audioTimings = audioAssets.map((asset) => ({
    assetId: asset.id,
    type: asset.type,
    subtype: asset.subtype,
    orderIndex: asset.order_index,
    startMs: getNumber(asset.metadata?.start_ms, 0),
    durationMs: asset.duration_ms ?? getNumber(asset.metadata?.duration_ms, cursorMs || 5000),
    hasUrl: Boolean(asset.url),
  }));

  return {
    renderer,
    resolution: settings.resolution ?? '1920x1080',
    fps: settings.fps ?? 30,
    includeAudio: settings.includeAudio !== false,
    visualCount: visualAssets.length,
    audioCount: audioAssets.length,
    visualTypes: visualAssets.map((asset) => asset.type),
    audioTypes: audioAssets.map((asset) => asset.subtype ?? asset.type),
    visualTimings,
    audioTimings,
  };
}

function falInputValidationFailures(visualAssets: ExportAsset[], audioAssets: ExportAsset[]): ShotFailure[] {
  const failures: ShotFailure[] = [];
  let cursorMs = 0;

  for (const asset of visualAssets) {
    const duration = assetDuration(asset);
    const timestamp = assetStartMs(asset, cursorMs);
    if (asset.type !== 'image' && asset.type !== 'video') {
      failures.push({ assetId: asset.id, orderIndex: asset.order_index, reason: `Unsupported fal visual asset type: ${asset.type}` });
    }
    if (!asset.url) {
      failures.push({ assetId: asset.id, orderIndex: asset.order_index, reason: 'Fal visual asset is missing a URL' });
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      failures.push({ assetId: asset.id, orderIndex: asset.order_index, reason: 'Fal visual asset duration must be greater than 0ms' });
    }
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      failures.push({ assetId: asset.id, orderIndex: asset.order_index, reason: 'Fal visual asset timestamp must be a non-negative number' });
    }
    cursorMs = Math.max(cursorMs, timestamp + duration);
  }

  for (const asset of audioAssets) {
    const duration = asset.duration_ms ?? getNumber(asset.metadata?.duration_ms, cursorMs || 5000);
    const timestamp = getNumber(asset.metadata?.start_ms, 0);
    if (asset.type !== 'audio') {
      failures.push({ assetId: asset.id, orderIndex: asset.order_index, reason: `Unsupported fal audio asset type: ${asset.type}` });
    }
    if (!asset.url) {
      failures.push({ assetId: asset.id, orderIndex: asset.order_index, reason: 'Fal audio asset is missing a URL' });
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      failures.push({ assetId: asset.id, orderIndex: asset.order_index, reason: 'Fal audio asset duration must be greater than 0ms' });
    }
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      failures.push({ assetId: asset.id, orderIndex: asset.order_index, reason: 'Fal audio asset timestamp must be a non-negative number' });
    }
  }

  return failures;
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
  const text = await res.text();
  if (!res.ok) throw new Error(`FAL result fetch failed (${res.status}): ${text}`);
  try { return JSON.parse(text); } catch { return {}; }
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
    if ((asset.type === 'text' || asset.type === 'element') && !asset.url) {
      usable.push(asset);
      continue;
    }
    if (!asset.url) {
      failures.push({
        assetId: asset.id,
        orderIndex: asset.order_index,
        reason: 'Missing asset URL',
      });
      continue;
    }
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

export function buildFalTracks(
  visualAssets: ExportAsset[],
  audioAssets: ExportAsset[],
  canvas: { width: number; height: number } = { width: 1920, height: 1080 }
): FalTrack[] {
  const tracks: FalTrack[] = [];
  let cursorMs = 0;

  visualAssets.forEach((asset, index) => {
    const duration = Math.max(assetDuration(asset), 1000);
    const timestamp = assetStartMs(asset, cursorMs);
    tracks.push({
      id: `visual-${index}-${asset.id}`,
      type: asset.type === 'image' ? 'image' : 'video',
      keyframes: [{
        url: asset.url,
        timestamp,
        duration,
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
      }],
    });
    cursorMs = Math.max(cursorMs, timestamp + duration);
  });

  audioAssets.forEach((asset, index) => {
    const start = getNumber(asset.metadata?.start_ms, 0);
    const duration = asset.duration_ms ?? getNumber(asset.metadata?.duration_ms, cursorMs || 5000);
    tracks.push({
      id: `audio-${index}-${asset.id}`,
      type: 'audio',
      keyframes: [{
        url: asset.url,
        timestamp: start,
        duration,
      }],
    });
  });

  return tracks;
}

function computeTimelineDurationSeconds(tracks: FalTrack[]): number {
  let maxEndMs = 0;
  for (const t of tracks) {
    for (const k of t.keyframes) {
      const end = k.timestamp + k.duration;
      if (end > maxEndMs) maxEndMs = end;
    }
  }
  return Math.max(Math.ceil(maxEndMs / 1000), 1);
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
  bytes: Uint8Array,
  ownerId?: string | null
) {
  const ownerPrefix = ownerId || projectId;
  const outputPath = `${ownerPrefix}/${projectId}/${jobId}/final_export_${Date.now()}.mp4`;
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

/**
 * Best-effort EBU R128 loudness normalization for each audio asset.
 * Returns the same array (in order) with `url` swapped for the normalized
 * version when fal succeeds. A single failure does not block the cut.
 */
async function normalizeAudioAssets(
  audioAssets: ExportAsset[],
  falKey: string
): Promise<{ assets: ExportAsset[]; applied: number }> {
  if (audioAssets.length === 0) return { assets: audioAssets, applied: 0 };
  const results = await Promise.allSettled(
    audioAssets.map((asset) =>
      falLoudnorm({ audio_url: asset.url!, target_i: -16, target_tp: -1.5, target_lra: 11, output_format: 'wav' }, falKey)
    )
  );
  let applied = 0;
  const next = audioAssets.map((asset, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const url = falExtractMediaUrl(r.value.data, ['audio_url', 'url', 'output_url']);
      if (url) {
        applied += 1;
        return { ...asset, url };
      }
    } else {
      safeLog('warn', 'export.fal.loudnorm.failed', { assetId: asset.id, error: r.reason });
    }
    return asset;
  });
  return { assets: next, applied };
}

/**
 * If multiple audio tracks all start at 0 and are tagged music/voiceover, pre-mix
 * them with merge-audios so the renderer only has one audio stream to compose.
 */
async function preMixAudioAssets(
  audioAssets: ExportAsset[],
  falKey: string
): Promise<{ assets: ExportAsset[]; mixed: boolean }> {
  if (audioAssets.length < 2) return { assets: audioAssets, mixed: false };
  const allAtZero = audioAssets.every((a) => getNumber(a.metadata?.start_ms, 0) === 0);
  if (!allAtZero) return { assets: audioAssets, mixed: false };
  try {
    const mix = await falMergeAudios({ audio_urls: audioAssets.map((a) => a.url!), output_format: 'wav' }, falKey);
    const url = falExtractMediaUrl(mix.data, ['audio_url', 'url', 'output_url']);
    if (!url) return { assets: audioAssets, mixed: false };
    const head = audioAssets[0];
    return {
      assets: [{
        ...head,
        url,
        metadata: { ...(head.metadata ?? {}), asset_role: 'music', start_ms: 0, premixed_from: audioAssets.length },
      }],
      mixed: true,
    };
  } catch (error) {
    safeLog('warn', 'export.fal.merge_audios.failed', { error, count: audioAssets.length });
    return { assets: audioAssets, mixed: false };
  }
}

async function renderWithFal(
  supabaseAdmin: any,
  jobId: string,
  visuals: ExportAsset[],
  audioAssetsIn: ExportAsset[],
  falKey: string,
  settings: ExportSettings,
  shotFailures: ShotFailure[]
) {
  const { resolution = '1920x1080', fps = 30 } = settings;
  const { width, height } = parseResolution(resolution);
  const allVideos = visuals.length > 0 && visuals.every((asset) => asset.type === 'video');

  // Audio post-production pre-pass: loudnorm + multi-track mixdown.
  const { assets: normalizedAudio, applied: loudnormApplied } = await normalizeAudioAssets(audioAssetsIn, falKey);
  const { assets: audioAssets, mixed: audioPreMixed } = await preMixAudioAssets(normalizedAudio, falKey);

  const renderer = chooseFalRenderer(visuals, audioAssets);
  const diagnostics = {
    ...renderDiagnostics(visuals, audioAssets, renderer, settings),
    loudnormApplied,
    audioPreMixed,
  };

  // Fast path 1: single video, no audio → return the URL directly.
  if (audioAssets.length === 0 && allVideos && visuals.length === 1) {
    await updateJobPayload(
      supabaseAdmin,
      jobId,
      { stage: 'downloading_assets', renderer: 'direct_video', renderDiagnostics: diagnostics, shotFailures },
      80
    );
    return { url: visuals[0].url, renderer: 'direct_video', requestId: null as string | null };
  }

  // Fast path 2: multi-video, no audio → merge-videos.
  if (audioAssets.length === 0 && allVideos) {
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
      {
        stage: 'provider_processing',
        renderer: MERGE_MODEL,
        renderDiagnostics: diagnostics,
        visualTracks: visuals.length,
        shotFailures,
      },
      65,
      { provider: 'fal_remote', provider_status: 'processing' }
    );
    const result = await runFalForVideoUrl(MERGE_MODEL, mergeInput, falKey);
    return { url: result.url, renderer: MERGE_MODEL, requestId: result.requestId };
  }

  // Fast path 3: single video + single audio with no overlays → merge-audio-video.
  if (allVideos && visuals.length === 1 && audioAssets.length === 1) {
    await updateJobPayload(
      supabaseAdmin,
      jobId,
      {
        stage: 'provider_processing',
        renderer: MERGE_AUDIO_VIDEO_MODEL,
        renderDiagnostics: diagnostics,
        visualTracks: 1,
        audioTracks: 1,
        shotFailures,
      },
      55,
      { provider: 'fal_remote', provider_status: 'processing' }
    );
    const result = await runFalForVideoUrl(
      MERGE_AUDIO_VIDEO_MODEL,
      { video_url: visuals[0].url, audio_url: audioAssets[0].url, output_format: 'mp4' },
      falKey
    );
    return { url: result.url, renderer: MERGE_AUDIO_VIDEO_MODEL, requestId: result.requestId };
  }

  // General path: timeline compose with overlays / mixed media / multiple tracks.
  await updateJobPayload(
    supabaseAdmin,
    jobId,
    {
      stage: 'provider_processing',
      renderer: COMPOSE_MODEL,
      renderDiagnostics: diagnostics,
      visualTracks: visuals.length,
      audioTracks: audioAssets.length,
      shotFailures,
    },
    45,
    { provider: 'fal_remote', provider_status: 'processing' }
  );

  const composeTracks = buildFalTracks(visuals, audioAssets, { width, height });
  const composeInput: Record<string, unknown> = {
    width,
    height,
    fps,
    duration_seconds: computeTimelineDurationSeconds(composeTracks),
    tracks: composeTracks,
    output_format: 'mp4',
  };
  const result = await runFalForVideoUrl(COMPOSE_MODEL, composeInput, falKey);
  return { url: result.url, renderer: COMPOSE_MODEL, requestId: result.requestId };
}

export function exportAssetToEditframeAsset(asset: ExportAsset): EditframeCompositionAsset {
  const metadata = asset.metadata ?? {};
  return {
    id: asset.id,
    type: asset.type,
    url: asset.url,
    text: typeof metadata.text === 'string' ? metadata.text : undefined,
    name: typeof metadata.name === 'string' ? metadata.name : undefined,
    durationMs: asset.duration_ms ?? getOptionalNumber(metadata.duration_ms),
    orderIndex: asset.order_index,
    startMs: getOptionalNumber(metadata.start_ms),
    trimStartMs: getOptionalNumber(metadata.trimStartMs) ?? getOptionalNumber(metadata.trim_start_ms),
    trimEndMs: getOptionalNumber(metadata.trimEndMs) ?? getOptionalNumber(metadata.trim_end_ms),
    volume: getNumber(metadata.volume, 1),
    muted: metadata.isMuted === true,
    fadeInMs: getOptionalNumber(metadata.fadeInMs) ?? getOptionalNumber(metadata.fadeInDuration) ?? getOptionalNumber(metadata.fade_in_ms),
    fadeOutMs: getOptionalNumber(metadata.fadeOutMs) ?? getOptionalNumber(metadata.fadeOutDuration) ?? getOptionalNumber(metadata.fade_out_ms),
    role: asset.subtype,
    transforms: metadata.transforms as EditframeCompositionAsset['transforms'],
    style: metadata.style as EditframeCompositionAsset['style'],
    effects: Array.isArray(metadata.effects) ? metadata.effects as EditframeCompositionAsset['effects'] : undefined,
    transition: metadata.transition as EditframeCompositionAsset['transition'],
    metadata,
  };
}

function extractRenderId(render: unknown): string {
  if (!render || typeof render !== 'object') return '';
  const record = render as Record<string, unknown>;
  const data = record.data && typeof record.data === 'object'
    ? record.data as Record<string, unknown>
    : {};
  return String(record.id ?? record.render_id ?? record.renderId ?? data.id ?? '');
}

async function loadEditframeApi() {
  const override = (globalThis as {
    __WZRD_EDITFRAME_API__?: {
      Client: new (key: string) => unknown;
      createRender: (client: unknown, payload: Record<string, unknown>) => Promise<unknown>;
      getRenderProgress: (client: unknown, id: string) => Promise<AsyncIterable<{ progress?: number }>>;
      downloadRender: (client: unknown, id: string) => Promise<Response>;
    };
  }).__WZRD_EDITFRAME_API__;
  if (override) return override;
  return await import('https://esm.sh/@editframe/api');
}

function describeEditframeFallbackFailure(message: string) {
  if (/download/i.test(message)) {
    return `Fal render failed; Editframe fallback download failed: ${message}`;
  }
  return `Fal render failed; Editframe fallback failed: ${message}`;
}

async function createEditframeRender(
  assets: ExportAsset[],
  settings: ExportSettings,
  jobId: string,
) {
  const editframeKey = Deno.env.get('EDITFRAME_API_KEY');
  if (!editframeKey) {
    throw new Error('EDITFRAME_API_KEY is not configured');
  }

  const { Client, createRender } = await loadEditframeApi();
  const { width, height } = parseResolution(settings.resolution);
  const composition = buildEditframeCompositionHtml(assets.map(exportAssetToEditframeAsset), {
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
  const renderId = extractRenderId(render);
  if (!renderId) {
    throw new Error('Editframe createRender returned no render id');
  }

  return { renderId, composition };
}

export async function createEditframeAsyncRender(
  supabaseAdmin: any,
  projectId: string,
  assets: ExportAsset[],
  jobId: string,
  settings: ExportSettings = {}
) {
  const setup = getEditframeSetupStatus();
  if (!setup.ready) {
    const payload = {
      stage: 'setup_required',
      renderer: EDITFRAME_RENDERER,
      setupErrors: setup.setupErrors,
    };
    await updateJobPayload(supabaseAdmin, jobId, payload, undefined, {
      provider: 'editframe_remote',
      provider_status: 'setup_required',
      fallback_used: false,
    });
    throw new ExportProcessingError(setup.setupErrors.join('; '), payload, []);
  }

  const sorted = [...assets].sort((a, b) => a.order_index - b.order_index);
  const preflight = await preflightAssets(sorted);
  const shotFailures = preflight.failures;
  const usable = preflight.usable.filter((a) => a.type !== 'audio' || settings.includeAudio !== false);
  const visualCount = usable.filter((a) => a.type === 'image' || a.type === 'video' || a.type === 'text' || a.type === 'element').length;

  if (visualCount === 0) {
    const payload = {
      stage: 'failed',
      renderer: 'url_preflight',
      shotFailures,
      failedShotCount: shotFailures.length,
    };
    await updateJobPayload(supabaseAdmin, jobId, payload);
    throw new ExportProcessingError('No reachable visual assets available for Editframe render', payload, shotFailures);
  }

  await updateJobPayload(
    supabaseAdmin,
    jobId,
    {
      stage: 'provider_processing',
      renderer: EDITFRAME_RENDERER,
      renderMode: 'async',
      shotFailures,
      failedShotCount: shotFailures.length,
    },
    35,
    {
      provider: 'editframe_remote',
      provider_status: 'processing',
      fallback_used: false,
    }
  );

  const { renderId, composition } = await createEditframeRender(usable, settings, jobId);
  const providerPayload = {
    stage: 'waiting_for_webhook',
    renderer: EDITFRAME_RENDERER,
    renderMode: 'async',
    editframeRenderId: renderId,
    durationMs: composition.durationMs,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    shotFailures,
    failedShotCount: shotFailures.length,
  };

  await updateJobPayload(supabaseAdmin, jobId, providerPayload, 50, {
    provider: 'editframe_remote',
    provider_status: 'processing',
    provider_job_id: renderId,
  });

  return {
    renderId,
    durationMs: composition.durationMs,
    shotFailures,
    providerPayload,
  };
}

export async function finalizeEditframeRender(
  supabaseAdmin: any,
  job: {
    id: string;
    project_id: string;
    user_id: string;
    output_url?: string | null;
    status?: string | null;
    provider_job_id?: string | null;
    provider_payload?: Record<string, unknown> | null;
  },
  exportBucket: string
) {
  if (job.status === 'completed' && job.output_url) {
    return {
      publicUrl: job.output_url,
      providerPayload: {
        ...(job.provider_payload ?? {}),
        stage: 'completed',
        idempotentReplay: true,
      },
    };
  }

  const editframeKey = Deno.env.get('EDITFRAME_API_KEY');
  if (!editframeKey) {
    throw new Error('EDITFRAME_API_KEY is not configured');
  }
  const renderId = job.provider_job_id;
  if (!renderId) {
    throw new Error('Export job has no Editframe render id');
  }

  const { Client, downloadRender } = await loadEditframeApi();
  const client = new Client(editframeKey);
  const response = await downloadRender(client, renderId);
  if (!response.ok) {
    throw new Error(`Editframe download failed (${response.status})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const publicUrl = await uploadFinalVideo(supabaseAdmin, job.project_id, job.id, exportBucket, bytes, job.user_id);
  const providerPayload = {
    ...(job.provider_payload ?? {}),
    stage: 'completed',
    fallbackStatus: 'completed',
    editframeRenderId: renderId,
  };

  await supabaseAdmin
    .from('export_jobs')
    .update({
      status: 'completed',
      progress: 100,
      output_url: publicUrl,
      provider: 'editframe_remote',
      provider_status: 'completed',
      fallback_used: Boolean(job.provider_payload?.fallbackReason),
      provider_payload: providerPayload,
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  await supabaseAdmin
    .from('final_project_assets')
    .insert({
      project_id: job.project_id,
      user_id: job.user_id,
      asset_type: 'video',
      file_url: publicUrl,
      metadata: {
        name: 'Editframe Export',
        asset_subtype: 'final_export',
        export_job_id: job.id,
        editframe_render_id: renderId,
        url: publicUrl,
      },
    });

  return { publicUrl, providerPayload };
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
  falRequestId?: string,
  ownerId?: string | null
): Promise<ProcessAssetsResult> {
  const editframeKey = Deno.env.get('EDITFRAME_API_KEY');
  const fallbackVisuals = assets.filter((asset) => asset.type !== 'audio');
  const fallbackAudio = assets.filter((asset) => asset.type === 'audio');
  const fallbackBasePayload = {
    stage: 'fallback_processing',
    renderer: EDITFRAME_RENDERER,
    renderDiagnostics: renderDiagnostics(fallbackVisuals, fallbackAudio, EDITFRAME_RENDERER, settings),
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
      ...(falRequestId ? { provider_job_id: falRequestId } : {}),
    });
    throw new ExportProcessingError(
      `Fal render failed; Editframe fallback unavailable: EDITFRAME_API_KEY is not configured. Fal error: ${falError}`,
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
    const { Client, getRenderProgress, downloadRender } = await loadEditframeApi();
    const { renderId, composition } = await createEditframeRender(assets, settings, jobId);
    const client = new Client(editframeKey);

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
    const publicUrl = await uploadFinalVideo(supabaseAdmin, projectId, jobId, exportBucket, bytes, ownerId);
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
    throw new ExportProcessingError(
      `${describeEditframeFallbackFailure(message)}. Fal error: ${falError}`,
      payload,
      shotFailures
    );
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
  settings: ExportSettings = {},
  ownerId?: string | null
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
      false,
      undefined,
      ownerId
    );
  }

  const plannedRenderer = chooseFalRenderer(visuals, audioAssets);
  const diagnostics = renderDiagnostics(visuals, audioAssets, plannedRenderer, settings);
  const validationFailures = falInputValidationFailures(visuals, audioAssets);
  if (validationFailures.length > 0) {
    const combinedFailures = [...shotFailures, ...validationFailures];
    const payload = {
      stage: 'failed',
      renderer: 'fal_input_validation',
      targetRenderer: plannedRenderer,
      renderDiagnostics: diagnostics,
      shotFailures: combinedFailures,
      failedShotCount: combinedFailures.length,
    };
    await updateJobPayload(supabaseAdmin, jobId, payload, 20, {
      provider: 'fal_remote',
      provider_status: 'failed',
      fallback_used: false,
    });
    throw new ExportProcessingError('Fal input validation failed before provider submission', payload, combinedFailures);
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
    const publicUrl = await uploadFinalVideo(supabaseAdmin, projectId, jobId, exportBucket, bytes, ownerId);

    // Best-effort poster frame + media metadata (never block the cut on failure).
    let posterFrameUrl: string | null = null;
    let mediaInfo: FfmpegMediaInfo | null = null;
    const [posterRes, metaRes] = await Promise.allSettled([
      falExtractFrame({ video_url: publicUrl, position: 'middle', output_format: 'png' }, falKey),
      falMetadata({ file_url: publicUrl }, falKey),
    ]);
    if (posterRes.status === 'fulfilled') {
      posterFrameUrl = falExtractMediaUrl(posterRes.value.data, ['image_url', 'url', 'output_url']);
    } else {
      safeLog('warn', 'export.fal.extract_frame.failed', { error: posterRes.reason });
    }
    if (metaRes.status === 'fulfilled') {
      mediaInfo = normalizeMediaInfo(metaRes.value.data);
    } else {
      safeLog('warn', 'export.fal.metadata.failed', { error: metaRes.reason });
    }

    const completedPayload = {
      ...providerPayload,
      stage: 'completed',
      partialSuccess: shotFailures.length > 0,
      posterFrameUrl,
      mediaInfo,
    };
    await updateJobPayload(supabaseAdmin, jobId, completedPayload, 95);

    return {
      publicUrl,
      shotFailures,
      provider: 'fal_remote',
      fallbackUsed: false,
      providerPayload: completedPayload,
      posterFrameUrl,
      mediaInfo,
    };
  } catch (falError) {
    const falMessage = errorMessage(falError, 'FAL render failed');
    const falRequestId = falError instanceof FalRenderError ? falError.requestId : undefined;
    safeLog('warn', 'export.fal.failed_fallback_started', {
      error: falError,
      falRequestId,
      visualCount: visuals.length,
      audioCount: audioAssets.length,
    });
    await updateJobPayload(
      supabaseAdmin,
      jobId,
      {
        stage: 'fallback_processing',
        renderer: EDITFRAME_RENDERER,
        renderDiagnostics: diagnostics,
        fallbackReason: 'fal_failed',
        falError: falMessage,
        ...(falRequestId ? { falRequestId } : {}),
        shotFailures,
        failedShotCount: shotFailures.length,
      },
      50,
      {
        provider: 'fal_remote',
        provider_status: 'failed',
        ...(falRequestId ? { provider_job_id: falRequestId } : {}),
      }
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
      falRequestId,
      ownerId
    );
  }
}
