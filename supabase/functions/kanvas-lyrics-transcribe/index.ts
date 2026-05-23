// supabase/functions/kanvas-lyrics-transcribe/index.ts
// Transcribes the selected audio clip using Gemini 3.1 Flash on GMI Cloud
// via the OpenAI-compatible chat completions API with audio + tool calling.
// Returns clip-relative, segment-aligned lyric blocks with estimated word
// timings. No fallback — GMI Cloud is the sole provider per project policy.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STORAGE_BUCKET = 'project-assets';
const SIGNED_URL_TTL_SEC = 300;
const GMI_MODEL = 'google/gemini-3.1-flash-lite-preview';
const GMI_CHAT_URL = 'https://api.gmi-serving.com/v1/chat/completions';

interface LyricWord {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence?: number;
}
interface LyricBlock {
  id: string;
  startTimeMs: number;
  endTimeMs: number;
  words: LyricWord[];
}

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

function toCamel(row: any) {
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

// --- audio fetch + base64 ------------------------------------------------

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // Process in chunks to avoid call stack overflow on large blobs
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(binary);
}

function inferAudioFormat(mime: string | undefined, url: string): 'mp3' | 'wav' | 'mp4' | 'flac' {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('flac')) return 'flac';
  if (m.includes('mp4') || m.includes('m4a')) return 'mp4';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  const u = url.toLowerCase();
  if (u.endsWith('.wav')) return 'wav';
  if (u.endsWith('.flac')) return 'flac';
  if (u.endsWith('.m4a') || u.endsWith('.mp4')) return 'mp4';
  return 'mp3';
}

// --- Gemini 3.1 Flash via GMI Cloud --------------------------------------

interface GeminiSegment {
  text: string;
  startSec: number;
  endSec: number;
  confidence?: number;
}

async function transcribeWithGemini(
  audioUrl: string,
  mimeType: string | undefined,
  selectionStartSec: number,
  selectionDurationSec: number
): Promise<{ segments: GeminiSegment[]; language: string | null; raw: any }> {
  const key = Deno.env.get('GMI_CLOUD_API_KEY');
  if (!key) throw new Error('GMI_CLOUD_API_KEY not configured');

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`failed to fetch audio: ${audioRes.status}`);
  const audioBuf = await audioRes.arrayBuffer();
  if (audioBuf.byteLength > 25 * 1024 * 1024) {
    throw new Error('audio file too large (>25MB) for inline transcription');
  }
  const base64 = arrayBufferToBase64(audioBuf);
  const format = inferAudioFormat(mimeType, audioUrl);

  const systemPrompt =
    'You are a precise lyrics transcriber. Listen to the audio and transcribe ONLY the sung/spoken words. ' +
    'Ignore instrumental sections. Group words into short sentence-like blocks of roughly 4-10 words each. ' +
    'For each block, provide approximate start and end times in seconds (relative to the start of the audio). ' +
    'If no lyrics are sung in a block of audio, omit it. Do not invent lyrics.';

  const windowEndSec = selectionStartSec + selectionDurationSec;
  const userText =
    `Transcribe the lyrics in this audio file. Focus on the window from ${selectionStartSec.toFixed(1)}s to ${windowEndSec.toFixed(1)}s. ` +
    `Return the result via the emit_lyrics tool. Times must be in seconds, relative to the start of the full audio file.`;

  const body = {
    model: GMI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          {
            type: 'input_audio',
            input_audio: { data: base64, format },
          },
        ],
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'emit_lyrics',
          description: 'Return structured lyric blocks for the audio clip.',
          parameters: {
            type: 'object',
            properties: {
              language: { type: 'string', description: 'BCP-47 language code, e.g. en, es, fr.' },
              blocks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string', description: 'The sung text for this block.' },
                    startSec: { type: 'number', description: 'Start time in seconds.' },
                    endSec: { type: 'number', description: 'End time in seconds.' },
                    confidence: { type: 'number', description: 'Estimated confidence from 0 to 1.' },
                  },
                  required: ['text', 'startSec', 'endSec'],
                },
              },
            },
            required: ['blocks'],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'emit_lyrics' } },
    temperature: 0.2,
  };

  const r = await fetch(GMI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`GMI ${r.status}: ${text.slice(0, 500)}`);
  }
  const json = await r.json();

  // Extract tool call args
  const choice = json?.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.[0];
  let parsed: any = null;
  if (toolCall?.function?.arguments) {
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error('[transcribe] tool args JSON parse failed', e, toolCall.function.arguments?.slice?.(0, 300));
    }
  }
  // Fallback: model returned plain content with embedded JSON
  if (!parsed && typeof choice?.message?.content === 'string') {
    const content = choice.message.content as string;
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }
  }
  if (!parsed || !Array.isArray(parsed.blocks)) {
    return { segments: [], language: null, raw: json };
  }

  const segments: GeminiSegment[] = parsed.blocks
    .map((b: any) => ({
      text: String(b.text ?? '').trim(),
      startSec: Number(b.startSec ?? b.start ?? 0),
      endSec: Number(b.endSec ?? b.end ?? 0),
      confidence: typeof b.confidence === 'number' ? b.confidence : 0.86,
    }))
    .filter((s: GeminiSegment) => s.text.length > 0 && Number.isFinite(s.startSec) && Number.isFinite(s.endSec));

  const language = typeof parsed.language === 'string' ? parsed.language : null;
  return { segments, language, raw: json };
}

// --- block normalization -------------------------------------------------

function tokenize(text: string): string[] {
  return text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

function buildBlocks(
  segments: GeminiSegment[],
  selectionStartMs: number,
  selectionDurationMs: number
): LyricBlock[] {
  const startMsClamp = (sec: number) =>
    Math.max(0, Math.min(selectionDurationMs, Math.round(sec * 1000) - selectionStartMs));

  // Filter to selection window (Gemini received the full audio).
  const windowed = segments.filter(
    (s) => s.endSec * 1000 > selectionStartMs && s.startSec * 1000 < selectionStartMs + selectionDurationMs
  );

  const blocks: LyricBlock[] = [];
  for (const seg of windowed) {
    const segStart = startMsClamp(seg.startSec);
    const segEnd = Math.max(segStart + 1, startMsClamp(seg.endSec));
    const tokens = tokenize(seg.text);
    if (tokens.length === 0) continue;
    const span = Math.max(1, segEnd - segStart);
    const per = span / tokens.length;
    const words: LyricWord[] = tokens.map((t, i) => ({
      id: crypto.randomUUID(),
      text: t,
      startTimeMs: Math.round(segStart + i * per),
      endTimeMs: Math.round(segStart + (i + 1) * per),
      confidence: typeof seg.confidence === 'number' ? seg.confidence : 0.86,
    }));
    blocks.push({
      id: crypto.randomUUID(),
      startTimeMs: segStart,
      endTimeMs: segEnd,
      words,
    });
  }
  return blocks;
}

function blocksToCaptions(blocks: LyricBlock[]) {
  return blocks
    .flatMap((block) =>
      block.words.map((word) => ({
        text: word.text,
        startMs: word.startTimeMs,
        endMs: word.endTimeMs,
        confidence: typeof word.confidence === 'number' ? word.confidence : 0.86,
      }))
    )
    .sort((a, b) => a.startMs - b.startMs);
}

// --- entry ---------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return err('method not allowed', 405);

  const svc = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let templateId = '';
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return err('unauthorized', 401);
    const token = authHeader.slice('Bearer '.length);
    const { data: userRes, error: authErr } = await svc.auth.getUser(token);
    if (authErr || !userRes.user) return err('unauthorized', 401);
    const userId = userRes.user.id;

    const body = await req.json();
    templateId = String(body.templateId ?? '');
    const force = Boolean(body.force);
    if (!templateId) return err('templateId required');

    const { data: template, error: tErr } = await svc
      .from('kanvas_lyric_templates').select('*').eq('id', templateId).maybeSingle();
    if (tErr) return err(tErr.message, 500);
    if (!template) return err('template not found', 404);
    if (template.user_id !== userId) return err('forbidden', 403);

    if (template.status === 'lyrics_ready' && !force) {
      return ok({ template: toCamel(template) });
    }

    // Resolve audio asset's storage path / URL.
    const { data: asset, error: aErr } = await svc
      .from('project_assets').select('id, url, metadata').eq('id', template.source_audio_asset_id).maybeSingle();
    if (aErr || !asset) return err('source audio asset missing', 404);
    const assetMeta = (asset.metadata as any) ?? {};
    const storagePath = assetMeta.storage_path as string | undefined;
    const mimeType = (assetMeta.mime_type as string | undefined) ?? (assetMeta.contentType as string | undefined);

    let audioUrl = asset.url as string;
    if (storagePath) {
      const { data: signed } = await svc
        .storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
      if (signed?.signedUrl) audioUrl = signed.signedUrl;
    }

    // Mark as processing + create job row
    await svc
      .from('kanvas_lyric_templates')
      .update({ status: 'lyrics_processing', error_message: null })
      .eq('id', templateId);

    const { data: jobRow } = await svc
      .from('kanvas_lyric_template_jobs')
      .insert({
        template_id: templateId,
        user_id: userId,
        job_type: 'transcribe',
        status: 'processing',
        provider: 'gmi',
        input: {
          selectionStartMs: template.selection_start_ms,
          selectionDurationMs: template.selection_duration_ms,
          model: GMI_MODEL,
        },
        started_at: new Date().toISOString(),
        attempts: 1,
      })
      .select('id')
      .single();
    const jobId = jobRow?.id as string | undefined;

    let segments: GeminiSegment[] = [];
    let language: string | null = null;
    try {
      const result = await transcribeWithGemini(
        audioUrl,
        mimeType,
        template.selection_start_ms / 1000,
        template.selection_duration_ms / 1000
      );
      segments = result.segments;
      language = result.language;
    } catch (provErr) {
      const msg = provErr instanceof Error ? provErr.message : 'provider failed';
      console.error('[transcribe] gemini failure', msg);
      await svc.from('kanvas_lyric_templates')
        .update({ status: 'failed', error_message: msg }).eq('id', templateId);
      if (jobId) {
        await svc.from('kanvas_lyric_template_jobs')
          .update({ status: 'failed', error_message: msg, completed_at: new Date().toISOString() })
          .eq('id', jobId);
      }
      return err(msg, 502);
    }

    const blocks = buildBlocks(
      segments,
      template.selection_start_ms,
      template.selection_duration_ms
    );

    const transcriptMeta = {
      provider: 'gmi',
      model: `gmi/${GMI_MODEL}`,
      timingQuality: 'estimated' as const,
      generatedAt: new Date().toISOString(),
      segmentCount: segments.length,
      language,
      captions: blocksToCaptions(blocks),
    };

    const { data: updated, error: upErr } = await svc
      .from('kanvas_lyric_templates')
      .update({
        lyric_blocks: blocks,
        transcript_meta: transcriptMeta,
        status: 'lyrics_ready',
      })
      .eq('id', templateId)
      .select('*')
      .single();
    if (upErr) {
      if (jobId) {
        await svc.from('kanvas_lyric_template_jobs')
          .update({ status: 'failed', error_message: upErr.message, completed_at: new Date().toISOString() })
          .eq('id', jobId);
      }
      return err(upErr.message, 500);
    }
    if (jobId) {
      await svc.from('kanvas_lyric_template_jobs')
        .update({
          status: 'completed',
          progress: 100,
          model: `gmi/${GMI_MODEL}`,
          output: { blockCount: blocks.length, language },
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }
    return ok({ template: toCamel(updated) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal error';
    console.error('[kanvas-lyrics-transcribe]', msg);
    if (templateId) {
      await svc.from('kanvas_lyric_templates')
        .update({ status: 'failed', error_message: msg }).eq('id', templateId);
    }
    return err(msg, 500);
  }
});
