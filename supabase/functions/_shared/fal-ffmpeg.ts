// @ts-nocheck
// ============================================================================
// SHARED: fal-ffmpeg.ts
// PURPOSE: Thin wrappers around the full fal-ai/ffmpeg-api/* endpoint suite.
// Used by the Director's Cut renderer for stitching, audio normalization,
// poster-frame capture, and metadata stamping.
// ============================================================================

const FAL_QUEUE_URL = 'https://queue.fal.run';
const DEFAULT_MAX_POLL = 180;
const DEFAULT_POLL_MS = 3000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FalRunResult<T = Record<string, unknown>> {
  data: T;
  requestId: string;
}

export interface FalRunOptions {
  maxPoll?: number;
  pollMs?: number;
}

async function submit(modelId: string, input: Record<string, unknown>, falKey: string) {
  const res = await fetch(`${FAL_QUEUE_URL}/${modelId}`, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`fal submit failed (${res.status}) for ${modelId}: ${text}`);
  return JSON.parse(text) as { request_id: string; status_url?: string; response_url?: string };
}

async function poll(requestId: string, statusUrl: string | undefined, falKey: string, opts: FalRunOptions = {}) {
  const base = statusUrl || `${FAL_QUEUE_URL}/requests/${requestId}/status`;
  const maxPoll = opts.maxPoll ?? DEFAULT_MAX_POLL;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  for (let i = 0; i < maxPoll; i++) {
    const res = await fetch(`${base}?logs=1`, { headers: { Authorization: `Key ${falKey}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`fal poll failed (${res.status}) for ${requestId}: ${text}`);
    const data = JSON.parse(text);
    if (data.status === 'COMPLETED') return data;
    if (data.status === 'FAILED') {
      const logMessage = Array.isArray(data.logs)
        ? data.logs.map((log: Record<string, unknown>) => log.message).filter(Boolean).join(' ')
        : '';
      throw new Error(`fal job failed for ${requestId}${logMessage ? `: ${logMessage}` : ''}`);
    }
    await wait(pollMs);
  }
  throw new Error(`fal poll timeout for ${requestId}`);
}

async function fetchResult(responseUrl: string, falKey: string) {
  const res = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } });
  if (!res.ok) throw new Error(`fal result fetch failed (${res.status})`);
  return res.json();
}

/** Submit, poll, and return the parsed result payload + request id. */
export async function runFal<T = Record<string, unknown>>(
  modelId: string,
  input: Record<string, unknown>,
  falKey: string,
  opts: FalRunOptions = {}
): Promise<FalRunResult<T>> {
  const sub = await submit(modelId, input, falKey);
  const status = await poll(sub.request_id, sub.status_url, falKey, opts);
  // Status payload often already contains the result; if not, fetch it.
  let payload: any = status;
  const looksLikeResult = status && typeof status === 'object' && (
    'video' in status || 'audio' in status || 'image' in status ||
    'url' in status || 'video_url' in status || 'audio_url' in status ||
    'data' in status || 'duration' in status
  );
  if (!looksLikeResult && sub.response_url) {
    payload = await fetchResult(sub.response_url, falKey);
  }
  return { data: payload as T, requestId: sub.request_id };
}

/** Recursively pull the first http(s) URL out of a result payload, optionally
 *  matching a list of preferred keys. */
export function extractMediaUrl(obj: unknown, preferredKeys: string[] = []): string | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractMediaUrl(item, preferredKeys);
      if (found) return found;
    }
    return null;
  }
  const o = obj as Record<string, unknown>;
  for (const key of preferredKeys) {
    const v = o[key];
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
    if (v && typeof v === 'object') {
      const found = extractMediaUrl(v, preferredKeys);
      if (found) return found;
    }
  }
  for (const v of Object.values(o)) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
    if (v && typeof v === 'object') {
      const found = extractMediaUrl(v, preferredKeys);
      if (found) return found;
    }
  }
  return null;
}

// ============================================================================
// Endpoint wrappers
// ============================================================================

export interface MergeVideosInput {
  video_urls: string[];
  output_format?: 'mp4' | 'webm' | 'mov';
  resolution?: { width: number; height: number };
  target_fps?: number;
}

export async function mergeVideos(input: MergeVideosInput, falKey: string, opts?: FalRunOptions) {
  return runFal('fal-ai/ffmpeg-api/merge-videos', input as unknown as Record<string, unknown>, falKey, opts);
}

export interface ComposeInput {
  width?: number;
  height?: number;
  fps?: number;
  duration_seconds?: number;
  tracks: unknown[];
  output_format?: string;
}

export async function compose(input: ComposeInput, falKey: string, opts?: FalRunOptions) {
  return runFal('fal-ai/ffmpeg-api/compose', input as unknown as Record<string, unknown>, falKey, opts);
}

export interface MergeAudioVideoInput {
  video_url: string;
  audio_url: string;
  keep_video_audio?: boolean;
  output_format?: 'mp4' | 'mov' | 'webm';
}

export async function mergeAudioVideo(input: MergeAudioVideoInput, falKey: string, opts?: FalRunOptions) {
  return runFal('fal-ai/ffmpeg-api/merge-audio-video', input as unknown as Record<string, unknown>, falKey, opts);
}

export interface MergeAudiosInput {
  audio_urls: string[];
  output_format?: 'mp3' | 'wav' | 'm4a';
}

export async function mergeAudios(input: MergeAudiosInput, falKey: string, opts?: FalRunOptions) {
  return runFal('fal-ai/ffmpeg-api/merge-audios', input as unknown as Record<string, unknown>, falKey, opts);
}

export interface LoudnormInput {
  audio_url: string;
  target_i?: number;
  target_tp?: number;
  target_lra?: number;
  output_format?: 'wav' | 'mp3' | 'm4a';
}

export async function loudnorm(input: LoudnormInput, falKey: string, opts?: FalRunOptions) {
  return runFal('fal-ai/ffmpeg-api/loudnorm', input as unknown as Record<string, unknown>, falKey, opts);
}

export interface ExtractFrameInput {
  video_url: string;
  timestamp_seconds?: number;
  frame_index?: number;
  position?: 'first' | 'middle' | 'last';
  output_format?: 'png' | 'jpg' | 'jpeg' | 'webp';
}

export async function extractFrame(input: ExtractFrameInput, falKey: string, opts?: FalRunOptions) {
  return runFal('fal-ai/ffmpeg-api/extract-frame', input as unknown as Record<string, unknown>, falKey, opts);
}

export interface MetadataInput {
  file_url: string;
}

export interface FfmpegMediaInfo {
  duration_ms?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  bitrate?: number;
  format?: string;
}

export async function metadata(input: MetadataInput, falKey: string, opts?: FalRunOptions) {
  return runFal('fal-ai/ffmpeg-api/metadata', input as unknown as Record<string, unknown>, falKey, opts);
}

/** Best-effort normalization of fal metadata into a stable shape. */
export function normalizeMediaInfo(payload: any): FfmpegMediaInfo {
  if (!payload || typeof payload !== 'object') return {};
  const root = (payload.metadata ?? payload.media ?? payload) as Record<string, any>;
  const streams: any[] = Array.isArray(root.streams) ? root.streams : [];
  const video = streams.find((s) => s?.codec_type === 'video') ?? {};
  const format = root.format ?? {};
  const durationSec = Number(root.duration ?? format.duration ?? video.duration);
  const fpsRaw: string | number | undefined = video.r_frame_rate ?? video.avg_frame_rate ?? root.fps;
  let fps: number | undefined;
  if (typeof fpsRaw === 'number' && Number.isFinite(fpsRaw)) fps = fpsRaw;
  else if (typeof fpsRaw === 'string' && fpsRaw.includes('/')) {
    const [n, d] = fpsRaw.split('/').map(Number);
    if (n && d) fps = n / d;
  }
  return {
    duration_ms: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : undefined,
    width: Number(video.width ?? root.width) || undefined,
    height: Number(video.height ?? root.height) || undefined,
    fps,
    codec: video.codec_name ?? root.codec ?? undefined,
    bitrate: Number(format.bit_rate ?? root.bitrate) || undefined,
    format: format.format_name ?? root.format_name ?? undefined,
  };
}

export interface WaveformInput {
  audio_url: string;
  sample_rate?: number;
  channels?: number;
  points?: number;
}

export async function waveform(input: WaveformInput, falKey: string, opts?: FalRunOptions) {
  return runFal('fal-ai/ffmpeg-api/waveform', input as unknown as Record<string, unknown>, falKey, opts);
}
