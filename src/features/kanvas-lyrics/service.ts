import { supabase } from '@/integrations/supabase/client';
import type {
  KanvasLyricTemplate,
  ListTemplatesFilters,
  TemplateStatus,
  LyricBlock,
  CutMarker,
} from './types';

const TEMPLATE_FN = 'kanvas-lyrics-template';
const TRANSCRIBE_FN = 'kanvas-lyrics-transcribe';

async function call<T = unknown>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message ?? `${fn} failed`);
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Audio upload (uses existing asset-upload edge function)
// ---------------------------------------------------------------------------

export interface UploadedTemplateAudio {
  assetId: string;
  url: string;
  fileName: string;
  size: number;
  mimeType: string;
  durationMs: number | null;
}

const AUDIO_BUCKET = 'project-assets';
const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB — matches storage bucket limit
const ACCEPTED_AUDIO_PREFIXES = ['audio/'];
const ACCEPTED_AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'mp4', 'aac', 'flac', 'ogg', 'oga'];

function looksLikeAudio(file: File | { type?: string; name?: string }) {
  if (file.type && ACCEPTED_AUDIO_PREFIXES.some((p) => file.type!.startsWith(p))) return true;
  const ext = file.name?.split('.').pop()?.toLowerCase();
  return !!ext && ACCEPTED_AUDIO_EXTS.includes(ext);
}

export interface UploadTemplateAudioInput {
  /** Source bytes — the raw File the user picked, or a sliced clip Blob. */
  blob: Blob;
  /** Filename to register (e.g. "song-clip.wav"). */
  fileName: string;
  /** MIME type of `blob`. Defaults to "audio/mpeg". */
  mimeType?: string;
  /** Known duration in ms (skips re-probing when provided). */
  durationMs?: number | null;
  projectId?: string | null;
}

/**
 * Upload an audio blob directly from the browser to Storage, then register a
 * project_assets row via a tiny edge function. The edge function never sees
 * the file bytes, so it stays well under worker memory limits.
 *
 * For backwards compatibility, callers may still pass a `File` directly.
 */
export async function uploadTemplateAudio(
  input: UploadTemplateAudioInput | File,
  legacyProjectId?: string
): Promise<UploadedTemplateAudio> {
  // Normalize input — keep the old (file, projectId) signature working.
  const normalized: UploadTemplateAudioInput =
    input instanceof File
      ? { blob: input, fileName: input.name, mimeType: input.type, projectId: legacyProjectId ?? null }
      : input;

  const { blob, fileName } = normalized;
  const mimeType = normalized.mimeType || (blob as File).type || 'audio/mpeg';
  const projectId = normalized.projectId ?? null;

  if (!looksLikeAudio({ type: mimeType, name: fileName })) {
    throw new Error('Unsupported file type. Use MP3, WAV, M4A, AAC, FLAC, or OGG.');
  }
  if (blob.size > MAX_AUDIO_BYTES) {
    const mb = (blob.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Audio file is too large (${mb} MB). Max 50 MB.`);
  }

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('You must be signed in to upload audio');

  // RLS on storage.objects requires foldername(name)[1] === auth.uid().
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const storagePath = `${user.id}/lyric-audio/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(storagePath, blob, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const durationMs =
    normalized.durationMs ??
    (blob instanceof File ? await probeAudioDurationMs(blob).catch(() => null) : null);

  try {
    const res = await call<{
      success: boolean;
      assetId?: string;
      asset?: { url: string };
      url?: string;
      error?: string;
    }>('kanvas-lyrics-audio-register', {
      projectId: projectId ?? null,
      storagePath,
      fileName,
      mimeType,
      size: blob.size,
      durationMs,
      visibility: projectId ? 'project' : 'private',
    });

    if (!res.success || !res.assetId) {
      throw new Error(res.error ?? 'Failed to register audio asset');
    }

    return {
      assetId: res.assetId,
      url: res.url ?? res.asset?.url ?? '',
      fileName,
      size: blob.size,
      mimeType,
      durationMs,
    };
  } catch (err) {
    // Best-effort cleanup so we don't leak orphan storage objects.
    await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]).catch(() => {});
    throw err;
  }
}

function probeAudioDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
    };
    audio.onloadedmetadata = () => {
      const ms = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null;
      cleanup();
      resolve(ms);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('Could not read audio metadata'));
    };
    audio.src = url;
  });
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export interface CreateTemplateInput {
  title?: string;
  projectId?: string | null;
  sourceAudioAssetId: string;
  totalDurationMs?: number;
  waveformPeaks?: number[];
  selectionStartMs: number;
  selectionDurationMs: 15000 | 30000 | 45000 | 60000;
}

export async function createTemplate(input: CreateTemplateInput): Promise<KanvasLyricTemplate> {
  const res = await call<{ template: KanvasLyricTemplate }>(TEMPLATE_FN, {
    action: 'create',
    ...input,
  });
  return res.template;
}

export async function getTemplate(templateId: string): Promise<KanvasLyricTemplate> {
  const res = await call<{ template: KanvasLyricTemplate }>(TEMPLATE_FN, {
    action: 'get',
    templateId,
  });
  return res.template;
}

export async function listTemplates(
  filters: ListTemplatesFilters = {}
): Promise<KanvasLyricTemplate[]> {
  const res = await call<{ templates: KanvasLyricTemplate[] }>(TEMPLATE_FN, {
    action: 'list',
    ...filters,
  });
  return res.templates;
}

export interface PatchTemplateInput {
  title?: string;
  selection?: { startMs: number; durationMs: 15000 | 30000 | 45000 | 60000 };
  waveformPeaks?: number[];
  lyricBlocks?: LyricBlock[];
  cutMarkers?: CutMarker[];
  renderDefaults?: Record<string, unknown>;
  status?: TemplateStatus;
}

export async function updateTemplate(
  templateId: string,
  patch: PatchTemplateInput
): Promise<KanvasLyricTemplate> {
  const res = await call<{ template: KanvasLyricTemplate }>(TEMPLATE_FN, {
    action: 'patch',
    templateId,
    ...patch,
  });
  return res.template;
}

export async function finalizeTemplate(templateId: string): Promise<KanvasLyricTemplate> {
  const res = await call<{ template: KanvasLyricTemplate }>(TEMPLATE_FN, {
    action: 'finalize',
    templateId,
  });
  return res.template;
}

export async function archiveTemplate(templateId: string): Promise<KanvasLyricTemplate> {
  const res = await call<{ template: KanvasLyricTemplate }>(TEMPLATE_FN, {
    action: 'archive',
    templateId,
  });
  return res.template;
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export interface TranscribeOptions {
  provider?: 'gmi' | 'groq';
  languageHint?: string | null;
  force?: boolean;
}

export async function transcribeTemplate(
  templateId: string,
  options: TranscribeOptions = {}
): Promise<KanvasLyricTemplate> {
  const res = await call<{ template: KanvasLyricTemplate }>(TRANSCRIBE_FN, {
    templateId,
    ...options,
  });
  return res.template;
}
