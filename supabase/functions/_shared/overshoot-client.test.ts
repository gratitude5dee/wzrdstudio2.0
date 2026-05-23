import {
  buildAuraEvaluationRows,
  executeOvershootStreamAction,
  executeOvershootJsonCompletion,
  extractJsonObject,
  normalizeAuraJudgeResponse,
  selectOvershootModelCandidates,
} from './overshoot-client.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEquals(actual: unknown, expected: unknown, message: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}.\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.test('selectOvershootModelCandidates prefers ready hosted models before proprietary passthroughs', () => {
  const candidates = selectOvershootModelCandidates([
    { id: 'gemini-3-flash-preview', status: 'ready' },
    { id: 'Qwen/Qwen3.6-35B-A3B-FP8', status: 'ready' },
    { id: 'google/gemma-4-31B-it', status: 'ready' },
    { id: 'Qwen/Qwen3.6-27B-FP8', status: 'loading' },
    { id: 'claude-haiku-4-5-20251001', status: 'ready' },
  ]);

  assertDeepEquals(
    candidates,
    ['google/gemma-4-31B-it', 'Qwen/Qwen3.6-35B-A3B-FP8', 'gemini-3-flash-preview', 'claude-haiku-4-5-20251001'],
    'ready hosted models should be selected before proprietary fallback models',
  );
});

Deno.test('executeOvershootJsonCompletion falls back when the first ready model returns 503', async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = input.toString();
    const requestInit = init as { body?: BodyInit | null } | undefined;
    const body = requestInit?.body ? JSON.parse(String(requestInit.body)) : undefined;
    calls.push({ url, body });

    if (url.endsWith('/models')) {
      return Promise.resolve(jsonResponse({
        data: [
          { id: 'Qwen/Qwen3.6-27B-FP8', status: 'ready' },
          { id: 'google/gemma-4-31B-it', status: 'ready' },
        ],
      }));
    }

    if (body?.model === 'Qwen/Qwen3.6-27B-FP8') {
      return Promise.resolve(jsonResponse({ detail: 'replica unavailable' }, 503));
    }

    return Promise.resolve(jsonResponse({
      id: 'chatcmpl-ok',
      model: body?.model,
      choices: [
        {
          message: {
            content: '{"scores":{"overall":91},"feedback":"good","tags":[],"suggestions":[]}',
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
  };

  const result = await executeOvershootJsonCompletion({
    apiKey: 'ovs-test',
    fetchImpl,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Judge this.' }] }],
  });

  assertEquals(result.modelUsed, 'google/gemma-4-31B-it', 'fallback model should be used after a 503');
  assertEquals(result.usage?.total_tokens, 15, 'usage should be preserved from the successful completion');
  assertEquals(
    calls.filter((call) => call.url.endsWith('/chat/completions')).length,
    2,
    'both primary and fallback completion calls should be attempted',
  );
});

Deno.test('extractJsonObject accepts direct JSON and fenced JSON but rejects non-object text', () => {
  assertDeepEquals(extractJsonObject('{"ok":true}'), { ok: true }, 'direct JSON should parse');
  assertDeepEquals(
    extractJsonObject('```json\n{"ok":true,"score":4}\n```'),
    { ok: true, score: 4 },
    'fenced JSON should parse',
  );

  let failed = false;
  try {
    extractJsonObject('not json');
  } catch {
    failed = true;
  }
  assert(failed, 'plain non-JSON text should be rejected');
});

Deno.test('normalizeAuraJudgeResponse clamps scores and preserves draft improvements', () => {
  const normalized = normalizeAuraJudgeResponse({
    scores: {
      overall: 120,
      technical: -3,
      aesthetic: 88,
      safety: 92,
    },
    promptAdherence: 0.7,
    characterConsistency: 77,
    spatialConsistency: 82,
    temporalConsistency: 67,
    continuity: 0.61,
    feedback: 'Shot mostly works.',
    tags: ['identity_drift', 42],
    suggestions: ['Lock wardrobe.'],
    draftImprovements: [
      {
        type: 'rewrite_prompt_for_specificity',
        title: 'Tighten identity anchor',
        rationale: 'Wardrobe changes between frames.',
        draftPrompt: 'Keep the same red jacket in every frame.',
      },
    ],
  });

  assertEquals(normalized.scores.overall, 100, 'overall should clamp to 100');
  assertEquals(normalized.scores.technical, 0, 'technical should clamp to 0');
  assertEquals(normalized.promptAdherence, 70, 'fractional consistency scores should scale to 0-100');
  assertDeepEquals(normalized.tags, ['identity_drift'], 'tags should keep only strings');
  assertEquals(normalized.draftImprovements?.[0]?.type, 'rewrite_prompt_for_specificity', 'draft improvement type should be preserved');
});

Deno.test('buildAuraEvaluationRows maps Overshoot dimensions to existing judge families', () => {
  const rows = buildAuraEvaluationRows(
    normalizeAuraJudgeResponse({
      scores: { overall: 75, technical: 80, aesthetic: 70, safety: 95 },
      promptAdherence: 65,
      characterConsistency: 58,
      temporalConsistency: 62,
      continuity: 64,
      feedback: 'Needs consistency work.',
      tags: ['identity_drift'],
      suggestions: ['Use stronger character reference.'],
      evidence: { sampledWindow: 'last 5 seconds' },
    }),
    {
      modelUsed: 'Qwen/Qwen3.6-27B-FP8',
      mediaUrl: 'https://example.com/shot.mp4',
      mediaType: 'video',
    },
  );

  assertDeepEquals(
    rows.map((row: { judge_type: string | null }) => row.judge_type),
    ['visual_quality', 'prompt_adherence', 'character_consistency', 'continuity', 'canon_compliance'],
    'Overshoot dimensions should map into the existing judge families',
  );
  assert(
    rows.some((row: { failure_tags: string[] }) => row.failure_tags.includes('character_consistency')),
    'low character consistency should produce a failure tag',
  );
  assertEquals(rows[0]?.judge_model, 'Qwen/Qwen3.6-27B-FP8', 'model id should be recorded on rows');
});

Deno.test('executeOvershootStreamAction proxies stream lifecycle calls with server-side authorization', async () => {
  const calls: Array<{ url: string; method: string; authorization?: string }> = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const requestInit = init as { headers?: HeadersInit; method?: string } | undefined;
    const headers = new Headers(requestInit?.headers);
    calls.push({
      url: input.toString(),
      method: requestInit?.method ?? 'GET',
      authorization: headers.get('Authorization') ?? undefined,
    });

    return Promise.resolve(jsonResponse({
      id: 'stream-1',
      state: 'active',
      publish: {
        type: 'livekit',
        url: 'wss://livekit.overshoot.ai',
        token: 'lk-token',
      },
      expires_at_ms: 1777529931184,
      ttl_seconds: 300,
      last_frame_at_ms: null,
    }));
  };

  await executeOvershootStreamAction({ apiKey: 'ovs-test', action: 'create', fetchImpl });
  await executeOvershootStreamAction({ apiKey: 'ovs-test', action: 'get', streamId: 'stream-1', fetchImpl });
  await executeOvershootStreamAction({ apiKey: 'ovs-test', action: 'keepalive', streamId: 'stream-1', fetchImpl });
  await executeOvershootStreamAction({ apiKey: 'ovs-test', action: 'delete', streamId: 'stream-1', fetchImpl });

  assertDeepEquals(
    calls.map((call) => [call.method, call.url.replace('https://api.overshoot.ai/v1', ''), call.authorization]),
    [
      ['POST', '/streams', 'Bearer ovs-test'],
      ['GET', '/streams/stream-1', 'Bearer ovs-test'],
      ['POST', '/streams/stream-1/keepalive', 'Bearer ovs-test'],
      ['DELETE', '/streams/stream-1', 'Bearer ovs-test'],
    ],
    'stream actions should map to the documented Overshoot endpoints',
  );
});
