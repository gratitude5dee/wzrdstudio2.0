/**
 * transcribe-music-annotated
 *
 * Calls GMI Cloud Gemini (Flash or Pro) to produce structured, sectioned
 * annotated lyrics for music-video planning. Implements a 3-tier retry
 * (normal -> repair prompt -> model fallback Flash<->Pro).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GMI_API_KEY = Deno.env.get('GMI_CLOUD_API_KEY') ?? '';
const GMI_BASE_URL = Deno.env.get('GMI_BASE_URL') ?? 'https://api.gmi-serving.com/v1';

type StemName = 'vocals' | 'drums' | 'bass' | 'other' | 'guitar' | 'piano' | 'mix';
type GeminiModel = 'gmi/gemini-3.1-flash' | 'gmi/gemini-3.1-pro';

interface MusicTranscribeAnnotatedRequest {
  project_id: string;
  audio_url: string;
  selected_stems?: Array<{ stem: StemName; url: string }>;
  model: GeminiModel;
  language_hint?: string | null;
  include_timing?: boolean;
  style_mode?: 'suno_annotated';
}

type SectionType =
  | 'Intro' | 'Verse' | 'Pre-Chorus' | 'Chorus'
  | 'Bridge' | 'Outro' | 'Hook' | 'Interlude' | 'Instrumental' | 'Unknown';

interface AnnotatedSection {
  section: SectionType;
  label?: string | null;
  start_ms?: number | null;
  end_ms?: number | null;
  instrumentation_notes?: string[];
  energy?: 'low' | 'medium' | 'high' | 'peak' | null;
  lines: string[];
}

interface GeminiOutput {
  annotated_lyrics_text: string;
  sections: AnnotatedSection[];
  global_analysis?: {
    tempo_bpm_estimate?: number | null;
    time_signature?: string | null;
    mood_tags?: string[];
    instrument_tags?: string[];
  };
}

const GEMINI_SYSTEM_PROMPT = `You are an expert music transcription and arrangement analyst.

TASK
Transcribe lyrics from the provided audio and produce a structured, sectioned, production-aware annotation for music video planning.

OUTPUT REQUIREMENTS
Return ONLY valid JSON that matches the required schema exactly.
Do not include markdown, code fences, explanations, or extra keys.

GOALS
1) Accurate lyric transcription.
2) Musical structure segmentation.
3) Instrumentation/arrangement notes useful for editing and shot timing.
4) Suno-style readability in a rendered text field.

SECTIONING RULES
- Segment into logical musical sections: Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro, Hook, Interlude, Instrumental, Unknown.
- If multiple verses/choruses exist, use \`label\` like "Verse 1", "Chorus 2".
- Prefer fewer, coherent sections over noisy micro-segmentation.

TIMING RULES
- If timing is inferable, include start_ms/end_ms per section.
- If uncertain, set them to null (never hallucinate precise timing).
- Ensure start_ms <= end_ms when both present.

LYRIC RULES
- Preserve repeated ad-libs and vocal interjections when audible.
- Keep line breaks natural for performance phrasing.
- If unintelligible, use "[inaudible]" sparingly.

INSTRUMENTATION / ARRANGEMENT RULES
- For each section, include concise instrumentation_notes describing beat/rhythm/texture changes.
- Focus on practical cues: bass drops, drum density, pad entries, transitions, breaks, risers, stutters, etc.
- Keep notes factual and tied to audible events, not speculation.

ENERGY TAGGING
- Assign one of: low, medium, high, peak, or null.
- Tag by perceived arrangement intensity in that section.

RENDERED TEXT FORMAT (annotated_lyrics_text)
- Must be human-readable and mirror this style:
  [Section Label]
  (Instrumentation note)
  lyric line
  lyric line
- Include parenthetical instrumentation notes where relevant.
- Keep readable, concise, and suitable for timeline/shot planning.

STRICT JSON
- Output MUST be valid JSON.
- No trailing commas.
- No comments.
- No extra keys beyond schema.`;

function buildUserPrompt(input: MusicTranscribeAnnotatedRequest): string {
  const stems = input.selected_stems?.length
    ? JSON.stringify(input.selected_stems, null, 2)
    : '[]';
  return `Analyze the provided audio and return structured annotated lyrics for music video production.

Context:
- project_id: ${input.project_id}
- transcription_model: ${input.model}
- include_timing: ${input.include_timing ?? true}
- language_hint: ${input.language_hint ?? 'null'}
- audio_url: ${input.audio_url}

Selected stems:
${stems}

Return JSON with exactly these top-level keys:
- annotated_lyrics_text (string)
- sections (array)
- global_analysis (object, optional)

Sections item shape:
{
  "section": "Intro|Verse|Pre-Chorus|Chorus|Bridge|Outro|Hook|Interlude|Instrumental|Unknown",
  "label": "string|null",
  "start_ms": "integer|null",
  "end_ms": "integer|null",
  "instrumentation_notes": ["string", "..."],
  "energy": "low|medium|high|peak|null",
  "lines": ["string", "..."]
}
`;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidUrl(u: string) { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } }

function parseJsonSafe(text: string): unknown {
  try { return JSON.parse(text); } catch {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) { try { return JSON.parse(m[1].trim()); } catch { return null; } }
    return null;
  }
}

const ALLOWED_SECTIONS: SectionType[] = ['Intro','Verse','Pre-Chorus','Chorus','Bridge','Outro','Hook','Interlude','Instrumental','Unknown'];

function validateGeminiOutput(parsed: unknown): parsed is GeminiOutput {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;
  if (typeof p.annotated_lyrics_text !== 'string' || !p.annotated_lyrics_text.trim()) return false;
  if (!Array.isArray(p.sections) || p.sections.length === 0) return false;
  for (const sec of p.sections) {
    if (!sec || typeof sec !== 'object') return false;
    const s = sec as Record<string, unknown>;
    if (typeof s.section !== 'string' || !ALLOWED_SECTIONS.includes(s.section as SectionType)) return false;
    if (!Array.isArray(s.lines)) return false;
  }
  return true;
}

function normalizeOutput(out: GeminiOutput): GeminiOutput {
  return {
    ...out,
    sections: out.sections.map((s) => ({
      ...s,
      instrumentation_notes: s.instrumentation_notes ?? [],
      lines: (s.lines ?? []).filter(Boolean),
      start_ms: s.start_ms ?? null,
      end_ms: s.end_ms ?? null,
      label: s.label ?? null,
      energy: s.energy ?? null,
    })),
  };
}

async function callGmiChat(opts: {
  model: GeminiModel;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<string> {
  if (!GMI_API_KEY) throw new Error('Missing GMI_CLOUD_API_KEY');
  const resolvedModel = opts.model.replace(/^gmi\//, '');
  const payload = {
    model: resolvedModel,
    temperature: opts.temperature ?? 0.2,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
  };
  const res = await fetch(`${GMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GMI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`GMI request failed (${res.status}): ${await res.text()}`);
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }>; output_text?: string };
  const text = json?.choices?.[0]?.message?.content ?? json?.output_text ?? '';
  if (typeof text !== 'string' || !text.trim()) throw new Error('Empty model response content');
  return text;
}

async function generateWithRetries(input: MusicTranscribeAnnotatedRequest): Promise<{ output: GeminiOutput; modelUsed: GeminiModel }> {
  const userPrompt = buildUserPrompt(input);

  // Attempt 1
  try {
    const raw = await callGmiChat({ model: input.model, systemPrompt: GEMINI_SYSTEM_PROMPT, userPrompt });
    const parsed = parseJsonSafe(raw);
    if (validateGeminiOutput(parsed)) return { output: normalizeOutput(parsed), modelUsed: input.model };
  } catch (e) { console.warn('[transcribe] attempt 1 failed', e); }

  // Attempt 2: repair on same model
  const repairPrompt = `${userPrompt}\n\nYour previous response was invalid JSON or schema-invalid. Return ONLY valid JSON matching the exact schema. No prose.`;
  try {
    const raw = await callGmiChat({ model: input.model, systemPrompt: GEMINI_SYSTEM_PROMPT, userPrompt: repairPrompt, temperature: 0.1 });
    const parsed = parseJsonSafe(raw);
    if (validateGeminiOutput(parsed)) return { output: normalizeOutput(parsed), modelUsed: input.model };
  } catch (e) { console.warn('[transcribe] attempt 2 failed', e); }

  // Attempt 3: model fallback
  const fallback: GeminiModel = input.model === 'gmi/gemini-3.1-pro' ? 'gmi/gemini-3.1-flash' : 'gmi/gemini-3.1-pro';
  const raw = await callGmiChat({ model: fallback, systemPrompt: GEMINI_SYSTEM_PROMPT, userPrompt: repairPrompt, temperature: 0.1 });
  const parsed = parseJsonSafe(raw);
  if (validateGeminiOutput(parsed)) return { output: normalizeOutput(parsed), modelUsed: fallback };
  throw new Error('TRANSCRIPTION_PARSE_FAILED');
}

async function authenticate(req: Request): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, res: jsonResponse({ success: false, error: 'Missing authorization' }, 401) };
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !user) return { ok: false, res: jsonResponse({ success: false, error: 'Invalid token' }, 401) };
  return { ok: true, userId: user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;

  let body: MusicTranscribeAnnotatedRequest;
  try { body = await req.json() as MusicTranscribeAnnotatedRequest; }
  catch { return jsonResponse({ success: false, error: 'Invalid JSON' }, 400); }

  if (!body.project_id || !body.audio_url || !isValidUrl(body.audio_url)) {
    return jsonResponse({ success: false, error: 'project_id and valid audio_url are required' }, 400);
  }
  if (body.model !== 'gmi/gemini-3.1-flash' && body.model !== 'gmi/gemini-3.1-pro') {
    return jsonResponse({ success: false, error: 'model must be gmi/gemini-3.1-flash or gmi/gemini-3.1-pro' }, 400);
  }

  try {
    const { output, modelUsed } = await generateWithRetries(body);
    return jsonResponse({
      success: true,
      project_id: body.project_id,
      model: modelUsed,
      annotated_lyrics_text: output.annotated_lyrics_text,
      sections: output.sections,
      global_analysis: output.global_analysis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message === 'TRANSCRIPTION_PARSE_FAILED' ? 422 : 500;
    return jsonResponse({ success: false, project_id: body.project_id, error: message }, status);
  }
});
