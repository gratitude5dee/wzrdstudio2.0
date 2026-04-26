/**
 * split-audio-stems
 *
 * Splits an uploaded audio track into individual stems using FAL Demucs
 * (htdemucs_6s by default). Returns a normalized payload of stem URLs that
 * the client persists into project.music_video_data.stems.
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
const FAL_KEY = Deno.env.get('FAL_KEY') ?? '';

type StemName = 'vocals' | 'drums' | 'bass' | 'other' | 'guitar' | 'piano';
const ALL_STEMS: StemName[] = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'];
const DEMUCS_ENDPOINT = 'fal-ai/demucs';

interface SplitRequestBody {
  project_id: string;
  audio_url: string;
  model?: string;
  stems?: StemName[];
  shifts?: number;
  overlap?: number;
  output_format?: 'mp3' | 'wav' | 'flac';
}

interface DemucsOutputItem {
  url?: string;
  content_type?: string;
  file_name?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function authenticate(req: Request): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, res: jsonResponse({ success: false, error: 'Missing authorization' }, 401) };
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !user) {
    return { ok: false, res: jsonResponse({ success: false, error: 'Invalid token' }, 401) };
  }
  return { ok: true, userId: user.id };
}

function inferStemName(item: DemucsOutputItem, key?: string): StemName | null {
  const haystack = `${key ?? ''} ${item.file_name ?? ''} ${item.url ?? ''}`.toLowerCase();
  for (const stem of ALL_STEMS) {
    if (haystack.includes(stem)) return stem;
  }
  return null;
}

/**
 * Normalize FAL Demucs response into a flat stems[] array.
 * The FAL response shape is `{ stems: { vocals: { url }, drums: { url }, ... } }`
 * but we tolerate alternative shapes.
 */
function normalizeStems(falData: unknown): Array<{ stem: StemName; url: string }> {
  const out: Array<{ stem: StemName; url: string }> = [];
  if (!falData || typeof falData !== 'object') return out;
  const root = falData as Record<string, unknown>;

  const stemsObj = (root.stems ?? root.outputs ?? root) as Record<string, unknown>;
  if (stemsObj && typeof stemsObj === 'object') {
    for (const [key, value] of Object.entries(stemsObj)) {
      if (!value || typeof value !== 'object') continue;
      const item = value as DemucsOutputItem;
      const url = typeof item.url === 'string' ? item.url : null;
      if (!url) continue;
      const stem = inferStemName(item, key);
      if (stem) out.push({ stem, url });
    }
  }
  // De-dup by stem (keep first)
  const seen = new Set<StemName>();
  return out.filter((s) => (seen.has(s.stem) ? false : (seen.add(s.stem), true)));
}

async function callDemucs(input: Record<string, unknown>): Promise<{ ok: true; data: unknown; requestId: string } | { ok: false; error: string; requestId?: string }> {
  // Submit
  const submitRes = await fetch(`https://queue.fal.run/${DEMUCS_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!submitRes.ok) {
    return { ok: false, error: `FAL submit failed (${submitRes.status}): ${await submitRes.text()}` };
  }
  const submitJson = await submitRes.json() as { request_id?: string; status_url?: string; response_url?: string };
  const requestId = submitJson.request_id;
  if (!requestId) return { ok: false, error: 'FAL did not return request_id' };

  const statusUrl = submitJson.status_url ?? `https://queue.fal.run/${DEMUCS_ENDPOINT}/requests/${requestId}/status`;
  const responseUrl = submitJson.response_url ?? `https://queue.fal.run/${DEMUCS_ENDPOINT}/requests/${requestId}`;

  // Poll up to 4 minutes
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await fetch(statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    if (!st.ok) continue;
    const sj = await st.json() as { status?: string };
    if (sj.status === 'COMPLETED') {
      const fr = await fetch(responseUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
      if (!fr.ok) return { ok: false, error: `FAL fetch failed: ${fr.status}`, requestId };
      return { ok: true, data: await fr.json(), requestId };
    }
    if (sj.status === 'FAILED' || sj.status === 'ERROR') {
      return { ok: false, error: `Demucs job failed`, requestId };
    }
  }
  return { ok: false, error: 'Demucs polling timeout', requestId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;

  let body: SplitRequestBody;
  try {
    body = await req.json() as SplitRequestBody;
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }

  if (!body.project_id || !body.audio_url || !isValidUrl(body.audio_url)) {
    return jsonResponse({ success: false, error: 'project_id and valid audio_url are required' }, 400);
  }
  if (!FAL_KEY) {
    return jsonResponse({ success: false, error: 'FAL_KEY is not configured' }, 500);
  }

  const model = body.model ?? 'htdemucs_6s';
  const stems = (body.stems && body.stems.length > 0) ? body.stems : ALL_STEMS;
  const shifts = body.shifts ?? 1;
  const overlap = body.overlap ?? 0.25;
  const output_format = body.output_format ?? 'mp3';

  const result = await callDemucs({
    audio_url: body.audio_url,
    model,
    stems,
    shifts,
    overlap,
    output_format,
  });

  if (!result.ok) {
    return jsonResponse({
      success: false,
      project_id: body.project_id,
      error: result.error,
      provider: 'fal-ai/demucs',
      model,
    }, 502);
  }

  const normalized = normalizeStems(result.data);
  if (normalized.length === 0) {
    return jsonResponse({
      success: false,
      project_id: body.project_id,
      error: 'Demucs returned no stems',
      provider: 'fal-ai/demucs',
      model,
      raw: result.data,
    }, 502);
  }

  return jsonResponse({
    success: true,
    project_id: body.project_id,
    request_id: result.requestId,
    provider: 'fal-ai/demucs',
    model,
    stems: normalized.map((s) => ({ ...s, selected: false })),
  });
});
