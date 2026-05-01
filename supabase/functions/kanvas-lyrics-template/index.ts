// supabase/functions/kanvas-lyrics-template/index.ts
// CRUD + finalize/archive for Kanvas Lyrics templates.
// Authenticates the caller, then uses the service-role client with explicit
// ownership checks (we never trust auth.uid() alone for cross-table joins).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Accept both new (15/30/45/60) and legacy (20/25) durations on read paths;
// only the new set is acceptable for new selections.
const VALID_DURATIONS = new Set([15000, 30000, 45000, 60000]);
const LEGACY_DURATIONS = new Set([20000, 25000]);
const MAX_PEAKS = 2048;
const MAX_WORDS = 500;
const MAX_WORD_LEN = 80;
const MARKER_DEDUPE_MS = 250;

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface AssetRow {
  id: string;
  project_id: string | null;
  name: string;
  url: string;
  type: string;
  metadata: Record<string, unknown> | null;
}
interface TemplateRow {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  status: string;
  source_audio_asset_id: string;
  trimmed_audio_asset_id: string | null;
  selection_start_ms: number;
  selection_duration_ms: number;
  total_duration_ms: number | null;
  waveform_peaks: unknown;
  lyric_blocks: unknown;
  cut_markers: unknown;
  transcript_meta: unknown;
  render_defaults: unknown;
  error_message: string | null;
  saved_at: string | null;
  created_at: string;
  updated_at: string;
}

function toCamel(row: TemplateRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    sourceAudioAssetId: row.source_audio_asset_id,
    trimmedAudioAssetId: row.trimmed_audio_asset_id,
    selectionStartMs: row.selection_start_ms,
    selectionDurationMs: row.selection_duration_ms,
    totalDurationMs: row.total_duration_ms,
    waveformPeaks: row.waveform_peaks ?? [],
    lyricBlocks: row.lyric_blocks ?? [],
    cutMarkers: row.cut_markers ?? [],
    transcriptMeta: row.transcript_meta ?? {},
    renderDefaults: row.render_defaults ?? {},
    errorMessage: row.error_message,
    savedAt: row.saved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- validation ----------------------------------------------------------

export function validatePeaks(peaks: unknown): number[] {
  if (!Array.isArray(peaks)) throw new Error('waveformPeaks must be an array');
  if (peaks.length > MAX_PEAKS) throw new Error(`waveformPeaks exceeds ${MAX_PEAKS}`);
  return peaks.map((p) => {
    const n = Number(p);
    if (!Number.isFinite(n)) throw new Error('waveformPeaks contains non-numeric values');
    return Math.max(0, Math.min(1, n));
  });
}

export function validateLyricBlocks(blocks: unknown, durationMs: number) {
  if (!Array.isArray(blocks)) throw new Error('lyricBlocks must be an array');
  let totalWords = 0;
  const cleaned = blocks.map((b: any) => {
    if (!b || typeof b !== 'object') throw new Error('Invalid lyric block');
    const words = Array.isArray(b.words) ? b.words : [];
    totalWords += words.length;
    if (totalWords > MAX_WORDS) throw new Error(`lyric_blocks exceed ${MAX_WORDS} words`);
    const cleanWords = words.map((w: any) => {
      const text = String(w?.text ?? '').slice(0, MAX_WORD_LEN);
      const start = Math.max(0, Math.min(durationMs, Number(w?.startTimeMs ?? 0)));
      const end = Math.max(start, Math.min(durationMs, Number(w?.endTimeMs ?? start)));
      return {
        id: String(w?.id ?? crypto.randomUUID()),
        text,
        startTimeMs: Math.round(start),
        endTimeMs: Math.round(end),
        ...(typeof w?.confidence === 'number' ? { confidence: w.confidence } : {}),
      };
    });
    cleanWords.sort((a: any, z: any) => a.startTimeMs - z.startTimeMs);
    const startTimeMs = cleanWords[0]?.startTimeMs ?? Number(b.startTimeMs ?? 0);
    const endTimeMs =
      cleanWords[cleanWords.length - 1]?.endTimeMs ?? Number(b.endTimeMs ?? startTimeMs);
    return {
      id: String(b.id ?? crypto.randomUUID()),
      startTimeMs: Math.max(0, Math.min(durationMs, startTimeMs)),
      endTimeMs: Math.max(0, Math.min(durationMs, endTimeMs)),
      words: cleanWords,
    };
  });
  cleaned.sort((a, z) => a.startTimeMs - z.startTimeMs);
  return cleaned;
}

export function validateMarkers(markers: unknown, durationMs: number) {
  if (!Array.isArray(markers)) throw new Error('cutMarkers must be an array');
  const sorted = markers
    .map((m: any) => ({
      id: String(m?.id ?? crypto.randomUUID()),
      timestampMs: Math.max(0, Math.min(durationMs, Math.round(Number(m?.timestampMs ?? 0)))),
    }))
    .sort((a, z) => a.timestampMs - z.timestampMs);
  // dedupe within 250ms
  const out: typeof sorted = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (!last || m.timestampMs - last.timestampMs >= MARKER_DEDUPE_MS) out.push(m);
  }
  return out;
}

function validateSelection(startMs: number, durationMs: number, totalMs: number | null) {
  if (!VALID_DURATIONS.has(durationMs) && !LEGACY_DURATIONS.has(durationMs)) {
    throw new Error('selectionDurationMs must be 15000, 30000, 45000, or 60000');
  }
  if (!Number.isFinite(startMs) || startMs < 0) throw new Error('selectionStartMs invalid');
  if (totalMs != null && startMs + durationMs > totalMs) {
    throw new Error('selection exceeds audio total duration');
  }
}

// --- handlers ------------------------------------------------------------

async function handleCreate(svc: any, userId: string, body: any) {
  const sourceAudioAssetId = String(body.sourceAudioAssetId ?? '');
  if (!sourceAudioAssetId) return err('sourceAudioAssetId required');
  const selectionStartMs = Math.round(Number(body.selectionStartMs ?? 0));
  const selectionDurationMs = Math.round(Number(body.selectionDurationMs ?? 15000));
  const totalDurationMs = body.totalDurationMs != null ? Math.round(Number(body.totalDurationMs)) : null;
  validateSelection(selectionStartMs, selectionDurationMs, totalDurationMs);

  const projectId = body.projectId ? String(body.projectId) : null;

  // Verify asset ownership: project_assets has no user_id; ownership is via
  // metadata.user_id (set by asset-upload) OR via the parent project.
  const { data: asset, error: assetErr } = await svc
    .from('project_assets')
    .select('id, project_id, type, metadata')
    .eq('id', sourceAudioAssetId)
    .maybeSingle();
  if (assetErr || !asset) return err('audio asset not found', 404);
  const assetUserId = (asset.metadata as any)?.user_id;
  if (assetUserId !== userId) {
    if (asset.project_id) {
      const { data: proj } = await svc
        .from('projects')
        .select('id')
        .eq('id', asset.project_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!proj) return err('forbidden: not your audio asset', 403);
    } else {
      return err('forbidden: not your audio asset', 403);
    }
  }

  if (projectId) {
    const { data: proj } = await svc
      .from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
    if (!proj) return err('forbidden: not your project', 403);
  }

  const peaks = body.waveformPeaks ? validatePeaks(body.waveformPeaks) : [];

  const { data, error } = await svc
    .from('kanvas_lyric_templates')
    .insert({
      user_id: userId,
      project_id: projectId,
      title: String(body.title ?? 'Untitled Template').slice(0, 200),
      status: 'draft',
      source_audio_asset_id: sourceAudioAssetId,
      selection_start_ms: selectionStartMs,
      selection_duration_ms: selectionDurationMs,
      total_duration_ms: totalDurationMs,
      waveform_peaks: peaks,
    })
    .select('*')
    .single();
  if (error) return err(error.message, 500);
  return ok({ template: toCamel(data as TemplateRow) });
}

async function handleGet(svc: any, userId: string, templateId: string) {
  if (!templateId) return err('templateId required');
  const { data, error } = await svc
    .from('kanvas_lyric_templates').select('*').eq('id', templateId).maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) return err('not found', 404);
  if (data.user_id !== userId) return err('forbidden', 403);
  return ok({ template: toCamel(data as TemplateRow) });
}

async function handleList(svc: any, userId: string, body: any) {
  let q = svc.from('kanvas_lyric_templates').select('*').eq('user_id', userId);
  if (body.projectId) q = q.eq('project_id', String(body.projectId));
  if (body.status) q = q.eq('status', String(body.status));
  q = q.order('created_at', { ascending: false }).limit(Math.min(Number(body.limit ?? 50), 200));
  const { data, error } = await q;
  if (error) return err(error.message, 500);
  return ok({ templates: (data as TemplateRow[]).map(toCamel) });
}

async function handlePatch(svc: any, userId: string, body: any) {
  const templateId = String(body.templateId ?? '');
  if (!templateId) return err('templateId required');
  const { data: existing, error: getErr } = await svc
    .from('kanvas_lyric_templates').select('*').eq('id', templateId).maybeSingle();
  if (getErr) return err(getErr.message, 500);
  if (!existing) return err('not found', 404);
  if (existing.user_id !== userId) return err('forbidden', 403);

  const update: Record<string, unknown> = {};
  if (typeof body.title === 'string') update.title = body.title.slice(0, 200);
  let durationMs = existing.selection_duration_ms;
  if (body.selection) {
    const startMs = Math.round(Number(body.selection.startMs ?? 0));
    durationMs = Math.round(Number(body.selection.durationMs ?? existing.selection_duration_ms));
    validateSelection(startMs, durationMs, existing.total_duration_ms);
    update.selection_start_ms = startMs;
    update.selection_duration_ms = durationMs;
  }
  if (body.waveformPeaks) update.waveform_peaks = validatePeaks(body.waveformPeaks);
  if (body.lyricBlocks) update.lyric_blocks = validateLyricBlocks(body.lyricBlocks, durationMs);
  if (body.cutMarkers) update.cut_markers = validateMarkers(body.cutMarkers, durationMs);
  if (body.renderDefaults && typeof body.renderDefaults === 'object') {
    update.render_defaults = body.renderDefaults;
  }
  if (typeof body.status === 'string') update.status = body.status;

  if (Object.keys(update).length === 0) {
    return ok({ template: toCamel(existing as TemplateRow) });
  }

  const { data, error } = await svc
    .from('kanvas_lyric_templates')
    .update(update)
    .eq('id', templateId)
    .select('*')
    .single();
  if (error) return err(error.message, 500);
  return ok({ template: toCamel(data as TemplateRow) });
}

async function handleFinalize(svc: any, userId: string, templateId: string) {
  if (!templateId) return err('templateId required');
  const { data: existing, error: getErr } = await svc
    .from('kanvas_lyric_templates').select('*').eq('id', templateId).maybeSingle();
  if (getErr) return err(getErr.message, 500);
  if (!existing) return err('not found', 404);
  if (existing.user_id !== userId) return err('forbidden', 403);

  const blocks = Array.isArray(existing.lyric_blocks) ? existing.lyric_blocks : [];
  if (blocks.length === 0) return err('lyric_blocks required to finalize', 422);
  if (!Array.isArray(existing.cut_markers)) return err('cut_markers must be an array', 422);

  const { data, error } = await svc
    .from('kanvas_lyric_templates')
    .update({ status: 'saved', saved_at: new Date().toISOString() })
    .eq('id', templateId)
    .select('*')
    .single();
  if (error) return err(error.message, 500);
  return ok({ template: toCamel(data as TemplateRow) });
}

async function handleArchive(svc: any, userId: string, templateId: string) {
  if (!templateId) return err('templateId required');
  const { data: existing } = await svc
    .from('kanvas_lyric_templates').select('user_id').eq('id', templateId).maybeSingle();
  if (!existing) return err('not found', 404);
  if (existing.user_id !== userId) return err('forbidden', 403);
  const { data, error } = await svc
    .from('kanvas_lyric_templates')
    .update({ status: 'archived' })
    .eq('id', templateId)
    .select('*')
    .single();
  if (error) return err(error.message, 500);
  return ok({ template: toCamel(data as TemplateRow) });
}

// --- entry ---------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return err('method not allowed', 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return err('unauthorized', 401);
    const token = authHeader.slice('Bearer '.length);

    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: userRes, error: authErr } = await svc.auth.getUser(token);
    if (authErr || !userRes.user) return err('unauthorized', 401);
    const userId = userRes.user.id;

    const body = await req.json();
    const action = String(body.action ?? '');

    switch (action) {
      case 'create':
        return await handleCreate(svc, userId, body);
      case 'get':
        return await handleGet(svc, userId, String(body.templateId ?? ''));
      case 'list':
        return await handleList(svc, userId, body);
      case 'patch':
        return await handlePatch(svc, userId, body);
      case 'finalize':
        return await handleFinalize(svc, userId, String(body.templateId ?? ''));
      case 'archive':
        return await handleArchive(svc, userId, String(body.templateId ?? ''));
      default:
        return err(`unknown action: ${action}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal error';
    console.error('[kanvas-lyrics-template]', msg);
    return err(msg, 500);
  }
});
