// ============================================================================
// In-browser ffmpeg.wasm renderer used as a local fallback when the FAL
// remote render fails. Inspired by the qcut project. Loads ffmpeg-core lazily,
// concatenates visual clips, optionally mixes a single audio track, then
// uploads the resulting MP4 to Supabase Storage.
// ============================================================================

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';

export interface WasmVisualClip {
  url: string;
  durationMs: number;
  /** 'video' | 'image' — image clips are turned into N-second still segments. */
  kind: 'video' | 'image';
}

export interface WasmAudioClip {
  url: string;
}

export interface WasmRenderInput {
  projectId: string;
  visuals: WasmVisualClip[];
  audio?: WasmAudioClip | null;
  width?: number;
  height?: number;
  fps?: number;
  onProgress?: (pct: number, message?: string) => void;
}

export interface WasmRenderOutput {
  blob: Blob;
  publicUrl: string;
  storagePath: string;
}

const EXPORT_BUCKET = 'final-exports';
const CORE_URL = '/ffmpeg/ffmpeg-core.js';
const WASM_URL = '/ffmpeg/ffmpeg-core.wasm';

let ffmpegInstance: FFmpeg | null = null;

async function loadFFmpeg(onLog?: (m: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  const ff = new FFmpeg();
  ff.on('log', ({ message }) => onLog?.(message));
  await ff.load({ coreURL: CORE_URL, wasmURL: WASM_URL });
  ffmpegInstance = ff;
  return ff;
}

const guessExt = (url: string, fallback: string): string => {
  try {
    const u = new URL(url, window.location.origin);
    const m = u.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (m) return m[1];
  } catch {/* ignore */}
  return fallback;
};

export async function renderTimelineWasm(input: WasmRenderInput): Promise<WasmRenderOutput> {
  const { projectId, visuals, audio, width = 1280, height = 720, fps = 30, onProgress } = input;
  if (!visuals.length) throw new Error('WASM render requires at least one visual clip');

  onProgress?.(2, 'Loading ffmpeg.wasm');
  const ff = await loadFFmpeg();

  const segmentFiles: string[] = [];
  let i = 0;
  for (const clip of visuals) {
    const ext = guessExt(clip.url, clip.kind === 'video' ? 'mp4' : 'jpg');
    const inputName = `in_${i}.${ext}`;
    const segName = `seg_${i}.mp4`;
    onProgress?.(5 + Math.floor((i / visuals.length) * 60), `Fetching clip ${i + 1}/${visuals.length}`);
    await ff.writeFile(inputName, await fetchFile(clip.url));

    const durationSec = Math.max(0.1, clip.durationMs / 1000);
    const vfScale = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    const args = clip.kind === 'image'
      ? ['-loop', '1', '-t', durationSec.toFixed(3), '-i', inputName,
         '-vf', vfScale, '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
         '-preset', 'ultrafast', '-an', segName]
      : ['-i', inputName, '-t', durationSec.toFixed(3),
         '-vf', vfScale, '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
         '-preset', 'ultrafast', '-an', segName];
    await ff.exec(args);
    await ff.deleteFile(inputName);
    segmentFiles.push(segName);
    i += 1;
  }

  // Concat list
  const concatList = segmentFiles.map((n) => `file '${n}'`).join('\n');
  await ff.writeFile('concat.txt', new TextEncoder().encode(concatList));

  onProgress?.(75, 'Concatenating segments');
  const concatOut = audio ? 'concat.mp4' : 'output.mp4';
  await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', concatOut]);

  for (const seg of segmentFiles) {
    await ff.deleteFile(seg).catch(() => undefined);
  }

  let finalName = concatOut;
  if (audio) {
    onProgress?.(85, 'Muxing audio');
    const aExt = guessExt(audio.url, 'mp3');
    await ff.writeFile(`audio.${aExt}`, await fetchFile(audio.url));
    await ff.exec([
      '-i', concatOut,
      '-i', `audio.${aExt}`,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-shortest', 'output.mp4',
    ]);
    finalName = 'output.mp4';
    await ff.deleteFile(concatOut).catch(() => undefined);
    await ff.deleteFile(`audio.${aExt}`).catch(() => undefined);
  }

  onProgress?.(92, 'Reading output');
  const data = await ff.readFile(finalName);
  await ff.deleteFile(finalName).catch(() => undefined);
  await ff.deleteFile('concat.txt').catch(() => undefined);

  const blob = new Blob([data as Uint8Array], { type: 'video/mp4' });

  onProgress?.(95, 'Uploading export');
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? 'anonymous';
  const path = `${userId}/${projectId}/wasm-${Date.now()}.mp4`;
  const { error: uploadError } = await supabase.storage
    .from(EXPORT_BUCKET)
    .upload(path, blob, { contentType: 'video/mp4', upsert: true });
  if (uploadError) throw new Error(`Failed to upload WASM render: ${uploadError.message}`);

  const { data: pub } = supabase.storage.from(EXPORT_BUCKET).getPublicUrl(path);
  onProgress?.(100, 'Done');
  return { blob, publicUrl: pub.publicUrl, storagePath: path };
}

export async function finalizeLocalRender(
  jobId: string,
  projectId: string,
  outputUrl: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('create-final-asset', {
    body: { action: 'finalize_local', projectId, jobId, outputUrl },
  });
  if (error) throw new Error(error.message || 'Failed to finalize local render');
}
