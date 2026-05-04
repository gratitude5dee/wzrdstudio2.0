import { inferFalMediaType, resolveFalModelOrFallback } from './falai-client.ts';

const DEFAULT_COSTS: Record<string, number> = {
  text: 1,
  image: 5,
  video: 20,
  audio: 8,
  generation: 5,
};

const MODEL_COST_OVERRIDES: Record<string, number> = {
  // Image — text-to-image
  'fal-ai/flux-pro/v2': 7,
  'fal-ai/flux-pro/v1.1': 9,
  'fal-ai/flux-pro/v2/flex': 6,
  'fal-ai/flux/dev': 5,
  'fal-ai/flux/schnell': 2,
  'fal-ai/nano-banana-pro': 7,
  'fal-ai/nano-banana-2': 5,
  'fal-ai/gpt-image-1-5': 8,
  'fal-ai/qwen-image-2/text-to-image': 5,
  'fal-ai/ideogram/v3': 5,
  'fal-ai/seedream-4-5': 6,
  'fal-ai/recraft/v3': 5,
  // Image — image-to-image
  'fal-ai/flux-pro/kontext': 8,
  'fal-ai/flux/kontext/dev': 6,
  'fal-ai/nano-banana-pro/edit': 8,
  'fal-ai/nano-banana-2/edit': 7,
  'fal-ai/gpt-image-1-5/edit': 4,
  'fal-ai/qwen-image-2/edit': 6,
  'fal-ai/seedream-5-lite/edit': 6,
  'fal-ai/grok-imagine/edit': 5,
  // Video — text-to-video
  'fal-ai/kling-video/v3/pro/text-to-video': 30,
  'fal-ai/kling-video/v3/omni': 25,
  'fal-ai/kling-video/o3/standard/text-to-video': 22,
  'fal-ai/kling-video/o3/pro/text-to-video': 32,
  'fal-ai/kling-video/v2.5-turbo/pro/text-to-video': 22,
  'fal-ai/kling-video/o1/text-to-video': 25,
  'fal-ai/veo3.1/text-to-video': 40,
  'fal-ai/veo3.1/fast/text-to-video': 25,
  'fal-ai/sora/pro/text-to-video': 50,
  'fal-ai/sora-2/text-to-video': 35,
  'fal-ai/seedance/v2/text-to-video': 30,
  'fal-ai/bytedance/seedance/v1/pro/text-to-video': 28,
  'fal-ai/minimax/hailuo-2.3/pro': 28,
  'fal-ai/wan/v2.5/text-to-video': 15,
  'fal-ai/ltx-video/v2-19b': 12,
  'fal-ai/pixverse/v6': 18,
  'fal-ai/higgsfield/dop': 20,
  // Video — image-to-video
  'fal-ai/kling-video/v3/pro/image-to-video': 30,
  'fal-ai/kling-video/o3/standard/image-to-video': 24,
  'fal-ai/veo3.1/image-to-video': 40,
  'fal-ai/veo3.1/fast/image-to-video': 25,
  'fal-ai/sora/pro/image-to-video': 50,
  'fal-ai/seedance/v2/image-to-video': 30,
  'fal-ai/bytedance/seedance/v1/pro/image-to-video': 28,
  // Video — special
  'fal-ai/kling-video/v3/motion-control': 30,
  'fal-ai/kling-video/o1/edit': 28,
  'fal-ai/kling-video/o3/standard/video-extend': 26,
  // Lip-sync models
  'fal-ai/kling-video/lipsync/audio-to-video': 14,
  'fal-ai/kling-video/lipsync/text-to-video': 14,
  'fal-ai/sadtalker': 12,
  'fal-ai/liveportrait': 15,
  'fal-ai/latentsync': 14,
  'fal-ai/hallo2': 16,
  'fal-ai/sonic': 18,
  // Legacy overrides
  'fal-ai/sora-2/text-to-video/pro': 50,
  'fal-ai/ltx-2-19b/text-to-video': 18,
  'fal-ai/bytedance/seedance/v1/lite/text-to-video': 20,
  'fal-ai/stable-diffusion-v35-large': 4,
  'fal-ai/recraft-v3': 5,
  'fal-ai/aura-flow': 3,
  'fal-ai/hidream-i1-full': 6,
  'fal-ai/omnigen-v1': 5,
  'fal-ai/flux/dev/image-to-image': 6,
  'fal-ai/flux-pro/v1.1-ultra/redux': 9,
  'fal-ai/iclight-v2': 5,
  'fal-ai/creative-upscaler': 4,
  'fal-ai/clarity-upscaler': 4,
  'fal-ai/minimax/video-01-live': 25,
  'fal-ai/minimax/video-01/image-to-video': 28,
  'fal-ai/hunyuan-video': 22,
  'fal-ai/wan/v2.1/1.3b/text-to-video': 18,
  'fal-ai/wan/v2.1/1.3b/image-to-video': 20,
  'fal-ai/cogvideox-5b': 20,
  'fal-ai/vidu/v2.5/text-to-video': 24,
  'fal-ai/vidu/v2.5/image-to-video': 26,
  'fal-ai/stable-video': 16,
  'fal-ai/qwen-image-2/pro/text-to-image': 7,
};

// GMI Cloud per-call costs in credits (1 credit ≈ $0.01).
// Mirrors src/lib/studio-model-constants.ts so server enforcement matches UI display.
const GMI_MODEL_COSTS: Record<string, number> = {
  // Image
  'gmi/seedream-5.0': 4,
  'gmi/seedream-5.0-lite': 2,
  'gmi/gemini-3.1-flash-image-preview': 3,
  // Video
  'gmi/kling-v3-omni': 28,
  'gmi/wan2.6-t2v': 18,
  'gmi/minimax-hailuo-2.3': 22,
  'gmi/pixverse-v5-t2v': 18,
  'gmi/veo3': 40,
  'gmi/veo3-fast': 25,
  'gmi/luma-ray2': 30,
  'gmi/kling-i2v-v2.1-master': 28,
  'gmi/kling-t2v-v2.1-master': 28,
  'gmi/ltx-fast-i2v': 5,
  'gmi/ltx-pro-a2v': 12,
  'gmi/kling-create-element': 6,
  // Text
  'gmi/gemini-3.1-flash-lite': 1,
  'gmi/deepseek-r1': 2,
  'gmi/openai-o4-mini': 2,
  // Audio
  'gmi/minime-talks-workflow': 8,
  'gmi/elevenlabs-tts-v3': 6,
  'gmi/elevenlabs-tts-multilingual-v2': 6,
  'gmi/inworld-tts-1-5-max': 5,
};

const WORKFLOW_COSTS: Record<string, number> = {
  'generate-storylines': 3,
  'gen-shots': 1,
};

const TOP_UP_URL = '/settings/billing';
const UPGRADE_URL = '/settings/billing#plans';

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function safeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export class InsufficientCreditsError extends Error {
  readonly code = 'insufficient_credits';
  readonly required: number;
  readonly available: number;
  readonly topUpUrl: string;
  readonly upgradeUrl: string;

  constructor(required: number, available: number, topUpUrl = TOP_UP_URL, upgradeUrl = UPGRADE_URL) {
    super('Insufficient credits');
    this.required = required;
    this.available = available;
    this.topUpUrl = topUpUrl;
    this.upgradeUrl = upgradeUrl;
  }
}

interface CreditSupabaseError {
  message?: string;
}

interface CreditSupabaseClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: CreditSupabaseError | null }>;
}

export function shouldSkipCreditBilling(headers: Headers): boolean {
  // Browser callers can set arbitrary CORS-allowed headers, so credit billing
  // must not be skipped from request metadata. Composite server flows should
  // reserve once at the parent operation instead of bypassing child calls.
  void headers;
  return false;
}

export function buildCreditIdempotencyKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => String(part ?? ''))
    .filter((part) => part.length > 0)
    .join(':');
}

export function getCreditCostForModel(modelId: string | null | undefined, resourceType: string): number {
  const normalizedResource = resourceType.toLowerCase();
  const requestedModel = typeof modelId === 'string' ? modelId.trim() : '';

  // GMI Cloud models — charge based on per-call USD cost (1 credit ≈ $0.01)
  if (requestedModel.startsWith('gmi/')) {
    const gmiCost = GMI_MODEL_COSTS[requestedModel];
    if (typeof gmiCost === 'number') {
      return Math.max(1, Math.ceil(gmiCost));
    }
    // Fallback by media type when model not in table
    const fallback = normalizedResource === 'video' ? 20
      : normalizedResource === 'audio' ? 8
      : normalizedResource === 'text' ? 1
      : 5;
    return fallback;
  }

  if (!requestedModel) {
    return Math.max(1, Math.ceil(DEFAULT_COSTS[normalizedResource] ?? DEFAULT_COSTS.generation));
  }

  const resolved = resolveFalModelOrFallback(requestedModel, {
    mediaTypeHint: inferFalMediaType(requestedModel),
    uiGroup: 'generation',
  });

  const byModel = MODEL_COST_OVERRIDES[resolved.model.id] ?? MODEL_COST_OVERRIDES[requestedModel];
  if (typeof byModel === 'number') {
    return Math.max(1, Math.ceil(byModel));
  }

  const inferredMedia = resolved.model.media_type;
  return Math.max(
    1,
    Math.ceil(DEFAULT_COSTS[inferredMedia] ?? DEFAULT_COSTS[normalizedResource] ?? DEFAULT_COSTS.generation),
  );
}

export function getWorkflowCreditCost(workflow: 'generate-storylines' | 'gen-shots', units = 1): number {
  const base = WORKFLOW_COSTS[workflow] ?? 1;
  const multiplier = Math.max(1, Math.ceil(units));
  return Math.max(1, Math.ceil(base * multiplier));
}

interface ReserveCreditsInput {
  supabase: CreditSupabaseClient;
  userId: string;
  resourceType: string;
  requestedAmount: number;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  skipBilling?: boolean;
}

interface CreditReserveResult {
  holdId: string | null;
  requestedAmount: number;
  availableAfter: number;
  skipped: boolean;
}

function parseRpcPayload(data: unknown): Record<string, unknown> {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return safeJson(parsed);
    } catch {
      return {};
    }
  }
  return safeJson(data);
}

export async function reserveCredits(input: ReserveCreditsInput): Promise<CreditReserveResult> {
  const requestedAmount = Math.max(1, Math.ceil(input.requestedAmount));

  const { data, error } = await input.supabase.rpc('credits_reserve', {
    resource_type: input.resourceType,
    requested_amount: requestedAmount,
    reference_type: input.referenceType,
    reference_id: input.referenceId,
    idempotency_key: input.idempotencyKey,
    metadata: {
      ...(input.metadata || {}),
      user_id: input.userId,
    },
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('Insufficient credits')) {
      const match = msg.match(/available=([0-9.]+)/);
      const available = match ? Number(match[1]) : 0;
      throw new InsufficientCreditsError(requestedAmount, available);
    }
    if (msg.includes('No credit record found') || msg.includes('Not authenticated')) {
      throw new InsufficientCreditsError(requestedAmount, 0);
    }
    throw new Error(`Credit reservation failed: ${msg}`);
  }

  const payload = parseRpcPayload(data);
  const success = payload.success === true;
  if (!success) {
    const code = typeof payload.code === 'string' ? payload.code : 'credit_reservation_failed';
    if (code === 'insufficient_credits') {
      throw new InsufficientCreditsError(
        requestedAmount,
        asNumber(payload.available, 0),
        typeof payload.top_up_url === 'string' ? payload.top_up_url : TOP_UP_URL,
        typeof payload.upgrade_url === 'string' ? payload.upgrade_url : UPGRADE_URL,
      );
    }
    throw new Error(`Credit reservation failed: ${code}`);
  }

  const holdId = typeof payload.hold_id === 'string' ? payload.hold_id : null;
  const availableAfter = asNumber(payload.available_after, 0);

  return {
    holdId,
    requestedAmount,
    availableAfter,
    skipped: false,
  };
}

interface CreditSettleInput {
  supabase: CreditSupabaseClient;
  holdId: string | null;
  amount?: number;
  metadata?: Record<string, unknown>;
  reason?: string;
  skipped?: boolean;
  userId?: string;
}

export async function commitCredits(input: CreditSettleInput): Promise<void> {
  if (input.skipped || !input.holdId) return;

  const { data, error } = await input.supabase.rpc('credits_commit', {
    hold_id: input.holdId,
    actual_amount: input.amount ?? null,
    metadata: input.metadata || {},
  });

  if (error) {
    throw new Error(`Credit commit failed: ${error.message || 'unknown error'}`);
  }

  const payload = parseRpcPayload(data);
  if (payload.success === false) {
    throw new Error(`Credit commit failed: ${String(payload.code || 'unknown_error')}`);
  }
}

export async function releaseCredits(input: CreditSettleInput): Promise<void> {
  if (input.skipped || !input.holdId) return;

  const { data, error } = await input.supabase.rpc('credits_release', {
    hold_id: input.holdId,
    reason: input.reason || 'operation_failed',
    metadata: {
      ...(input.metadata || {}),
      ...(input.userId ? { user_id: input.userId } : {}),
    },
  });

  if (error) {
    console.error('releaseCredits: release failed', error.message);
    return;
  }

  const payload = parseRpcPayload(data);
  if (payload.success === false) {
    console.error('releaseCredits: release failed', String(payload.code || 'unknown_error'));
  }
}

export function insufficientCreditsResponse(error: InsufficientCreditsError, extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: 'Insufficient credits',
      code: error.code,
      required: error.required,
      available: error.available,
      top_up_url: error.topUpUrl,
      upgrade_url: error.upgradeUrl,
    }),
    {
      status: 402,
      headers: { ...extraHeaders, 'Content-Type': 'application/json' },
    },
  );
}
