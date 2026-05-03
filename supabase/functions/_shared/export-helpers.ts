// ============================================================================
// SHARED: export-helpers.ts
// PURPOSE: Remote video stitching via FAL merge-videos API (no local ffmpeg)
// ============================================================================

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
}

export interface ShotFailure {
  assetId: string;
  orderIndex: number;
  reason: string;
}

export interface ProcessAssetsResult {
  publicUrl: string;
  shotFailures: ShotFailure[];
}

const FAL_QUEUE_URL = 'https://queue.fal.run';
const MERGE_MODEL = 'fal-ai/ffmpeg-api/merge-videos';
const COMPOSE_MODEL = 'fal-ai/ffmpeg-api/compose';
const MERGE_AUDIO_VIDEO_MODEL = 'fal-ai/ffmpeg-api/merge-audio-video';
const MAX_POLL = 180;
const POLL_MS = 3000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    if (!res.ok) throw new Error(`FAL poll failed (${res.status})`);
    const data = await res.json();
    if (data.status === 'COMPLETED') return data;
    if (data.status === 'FAILED') throw new Error('FAL job failed');
    await wait(POLL_MS);
  }
  throw new Error('FAL poll timeout');
}

async function falGetResult(responseUrl: string, falKey: string) {
  const res = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } });
  if (!res.ok) throw new Error(`FAL result fetch failed (${res.status})`);
  return res.json();
}

function extractVideoUrl(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractVideoUrl(item);
      if (found) return found;
    }
    return null;
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.url === 'string' && o.url.startsWith('http')) return o.url;
  for (const v of Object.values(o)) {
    const found = extractVideoUrl(v);
    if (found) return found;
  }
  return null;
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function runFalForVideoUrl(modelId: string, input: Record<string, unknown>, falKey: string): Promise<string> {
  const sub = await falQueueSubmit(modelId, input, falKey);
  const status = await falPollUntilDone(sub.request_id, sub.status_url, falKey);

  let videoUrl: string | null = extractVideoUrl(status);
  if (!videoUrl && sub.response_url) {
    const result = await falGetResult(sub.response_url, falKey);
    videoUrl = extractVideoUrl(result);
  }
  if (!videoUrl) throw new Error(`${modelId} returned no output video URL`);
  return videoUrl;
}

/**
 * Convert an image URL to a short video clip using FAL compose, then return the video URL.
 */
async function imageToVideoClip(
  imageUrl: string,
  durationSec: number,
  falKey: string
): Promise<string> {
  const input = {
    tracks: [
      {
        id: 'image',
        type: 'image',
        keyframes: [
          {
            timestamp: 0,
            duration: durationSec * 1000,
            url: imageUrl,
          },
        ],
      },
    ],
  };

  return runFalForVideoUrl(COMPOSE_MODEL, input, falKey);
}

async function composeTimeline(
  visualAssets: ExportAsset[],
  audioAssets: ExportAsset[],
  falKey: string
): Promise<string> {
  const tracks: Array<{
    id: string;
    type: 'video' | 'audio' | 'image';
    keyframes: Array<{ timestamp: number; duration: number; url: string }>;
  }> = [];
  let cursorMs = 0;

  visualAssets.forEach((asset, index) => {
    const duration = asset.duration_ms ?? getNumber(asset.metadata?.duration_ms, asset.type === 'video' ? 6000 : 5000);
    const timestamp = getNumber(asset.metadata?.start_ms, cursorMs);
    tracks.push({
      id: `visual-${index}`,
      type: asset.type === 'image' ? 'image' : 'video',
      keyframes: [
        {
          timestamp,
          duration,
          url: asset.url,
        },
      ],
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

  return runFalForVideoUrl(COMPOSE_MODEL, { tracks }, falKey);
}

/**
 * Process assets remotely — no local files, no subprocess.
 * 1. Convert image assets to short video clips via FAL compose
 * 2. Merge all video URLs via FAL merge-videos
 * 3. Upload result to Supabase Storage
 */
export async function processAssetsRemote(
  supabaseAdmin: any,
  projectId: string,
  assets: ExportAsset[],
  jobId: string,
  exportBucket: string,
  settings: ExportSettings = {}
): Promise<ProcessAssetsResult> {
  const falKey = Deno.env.get('FAL_KEY');
  if (!falKey) throw new Error('FAL_KEY is not configured');

  const { resolution = '1920x1080', fps = 30 } = settings;
  const [w, h] = resolution.split('x').map(Number);

  const sorted = [...assets].sort((a, b) => a.order_index - b.order_index);
  const visuals = sorted.filter((a) => a.type === 'image' || a.type === 'video');
  const audioAssets = sorted.filter((a) => a.type === 'audio' && settings.includeAudio !== false);

  if (visuals.length === 0) throw new Error('No visual assets available for export');

  const shotFailures: ShotFailure[] = [];
  const videoUrls: string[] = [];

  if (audioAssets.length > 0) {
    await supabaseAdmin
      .from('export_jobs')
      .update({ progress: 45, provider_payload: { stage: 'provider_processing', renderer: COMPOSE_MODEL, audioTracks: audioAssets.length } })
      .eq('id', jobId);

    let composedUrl: string;
    try {
      composedUrl = await composeTimeline(visuals, audioAssets, falKey);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'FAL compose failed';
      throw new Error(`Audio timeline compose failed: ${reason}`);
    }

    await supabaseAdmin
      .from('export_jobs')
      .update({ progress: 85, provider_payload: { stage: 'downloading_assets', renderer: COMPOSE_MODEL, audioTracks: audioAssets.length } })
      .eq('id', jobId);

    const videoRes = await fetch(composedUrl);
    if (!videoRes.ok) throw new Error(`Failed to download composed video: ${videoRes.statusText}`);
    const bytes = new Uint8Array(await videoRes.arrayBuffer());

    await supabaseAdmin
      .from('export_jobs')
      .update({ progress: 90, provider_payload: { stage: 'uploading_final_video', renderer: COMPOSE_MODEL, audioTracks: audioAssets.length } })
      .eq('id', jobId);

    const outputPath = `${projectId}/${jobId}/final_export_${Date.now()}.mp4`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(exportBucket)
      .upload(outputPath, bytes, { contentType: 'video/mp4', upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabaseAdmin.storage.from(exportBucket).getPublicUrl(outputPath);
    await supabaseAdmin.from('export_jobs').update({ progress: 95 }).eq('id', jobId);
    return { publicUrl, shotFailures };
  }

  // Phase 1: convert all assets to video URLs
  for (let i = 0; i < visuals.length; i++) {
    const asset = visuals[i];
    if (!asset.url) {
      shotFailures.push({ assetId: asset.id, orderIndex: asset.order_index, reason: 'Missing URL' });
      continue;
    }

    try {
      if (asset.type === 'image') {
        const dur = asset.duration_ms ? asset.duration_ms / 1000 : 5;
        const clipUrl = await imageToVideoClip(asset.url, dur, falKey);
        videoUrls.push(clipUrl);
      } else {
        // Video — use URL directly
        videoUrls.push(asset.url);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Conversion failed';
      console.warn(`Skipping asset ${asset.id}: ${reason}`);
      shotFailures.push({ assetId: asset.id, orderIndex: asset.order_index, reason });
    }

    const progress = Math.round(((i + 1) / visuals.length) * 60);
    await supabaseAdmin
      .from('export_jobs')
      .update({ progress, provider_payload: { stage: 'provider_processing', renderer: asset.type === 'image' ? COMPOSE_MODEL : MERGE_MODEL } })
      .eq('id', jobId);
  }

  if (videoUrls.length === 0) {
    throw new Error(`All ${shotFailures.length} visual assets failed`);
  }

  // Phase 2: If only 1 video, skip merge
  let finalVideoUrl: string;

  if (videoUrls.length === 1) {
    finalVideoUrl = videoUrls[0];
  } else {
    // Merge all videos via FAL
    await supabaseAdmin
      .from('export_jobs')
      .update({ progress: 65, provider_payload: { stage: 'provider_processing', renderer: MERGE_MODEL } })
      .eq('id', jobId);

    const mergeInput: Record<string, unknown> = {
      video_urls: videoUrls,
      target_fps: fps,
    };
    if (w >= 512 && h >= 512 && w <= 2048 && h <= 2048) {
      mergeInput.resolution = { width: w, height: h };
    }

    const sub = await falQueueSubmit(MERGE_MODEL, mergeInput, falKey);
    await supabaseAdmin.from('export_jobs').update({ progress: 70 }).eq('id', jobId);

    const status = await falPollUntilDone(sub.request_id, sub.status_url, falKey);
    let mergedUrl = extractVideoUrl(status);
    if (!mergedUrl && sub.response_url) {
      const result = await falGetResult(sub.response_url, falKey);
      mergedUrl = extractVideoUrl(result);
    }
    if (!mergedUrl) throw new Error('FAL merge-videos returned no output URL');
    finalVideoUrl = mergedUrl;
  }

  await supabaseAdmin
    .from('export_jobs')
    .update({ progress: 85, provider_payload: { stage: 'downloading_assets', renderer: MERGE_MODEL } })
    .eq('id', jobId);

  // Phase 3: Download merged video and upload to Supabase Storage
  const videoRes = await fetch(finalVideoUrl);
  if (!videoRes.ok) throw new Error(`Failed to download merged video: ${videoRes.statusText}`);
  const bytes = new Uint8Array(await videoRes.arrayBuffer());

  await supabaseAdmin
    .from('export_jobs')
    .update({ progress: 90, provider_payload: { stage: 'uploading_final_video', renderer: MERGE_MODEL } })
    .eq('id', jobId);

  const outputPath = `${projectId}/${jobId}/final_export_${Date.now()}.mp4`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(exportBucket)
    .upload(outputPath, bytes, { contentType: 'video/mp4', upsert: true });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: { publicUrl } } = supabaseAdmin.storage.from(exportBucket).getPublicUrl(outputPath);

  await supabaseAdmin.from('export_jobs').update({ progress: 95 }).eq('id', jobId);

  return { publicUrl, shotFailures };
}
