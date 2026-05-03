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

  constructor(required: number, available: number, topUpUrl = TOP_UP_URL) {
    super('Insufficient credits');
    this.required = required;
    this.available = available;
    this.topUpUrl = topUpUrl;
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
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error?: CreditSupabaseError | null }>;
    select(columns: string): {
      eq(column: string, value: string): {
        single(): Promise<{ data: { used_credits?: number } | null; error: CreditSupabaseError | null }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error?: CreditSupabaseError | null }>;
    };
  };
}

export function shouldSkipCreditBilling(headers: Headers): boolean {
  return (headers.get('x-credit-billing') || '').toLowerCase() === 'upstream';
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
      return Math.max(0, Math.ceil(gmiCost));
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

  if (input.skipBilling) {
    return {
      holdId: null,
      requestedAmount,
      availableAfter: 0,
      skipped: true,
    };
  }

  // Use atomic PostgreSQL function with row-level locking
  const { data, error } = await input.supabase.rpc('deduct_credits', {
    p_user_id: input.userId,
    p_amount: requestedAmount,
  });

  if (error) {
    // Parse the error to distinguish insufficient credits from other failures
    const msg = error.message || '';
    if (msg.includes('Insufficient credits')) {
      const match = msg.match(/available=(\d+)/);
      const available = match ? parseInt(match[1], 10) : 0;
      throw new InsufficientCreditsError(requestedAmount, available);
    }
    if (msg.includes('No credit record found')) {
      throw new InsufficientCreditsError(requestedAmount, 0);
    }
    throw new Error(`Credit deduction failed: ${msg}`);
  }

  const availableAfter = typeof data === 'number' ? data : 0;

  // Record transaction
  await input.supabase.from('credit_transactions').insert({
    user_id: input.userId,
    amount: -requestedAmount,
    transaction_type: 'usage',
    resource_type: input.resourceType,
    metadata: {
      ...(input.metadata || {}),
      reference_type: input.referenceType,
      reference_id: input.referenceId,
      idempotency_key: input.idempotencyKey,
    },
  });

  return {
    holdId: input.referenceId,
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
  // Credits already deducted upfront via use_credits — nothing to do
  return;
}

export async function releaseCredits(input: CreditSettleInput): Promise<void> {
  if (input.skipped || !input.holdId) return;

  const refundAmount = input.amount ?? 0;
  if (refundAmount <= 0) return;

  const userId =
    input.userId ||
    ((input.metadata as Record<string, unknown> | undefined)?.user_id as string | undefined);

  if (!userId) {
    console.error('releaseCredits: missing user_id in metadata, cannot refund');
    return;
  }

  // Single atomic update: decrement used_credits by refundAmount, floor at 0
  const { data: currentRow, error: fetchError } = await input.supabase
    .from('user_credits')
    .select('used_credits')
    .eq('user_id', userId)
    .single();

  if (fetchError || !currentRow) {
    console.error('releaseCredits: user_credits row not found for', userId);
    return;
  }

  const newUsedCredits = Math.max(0, (currentRow.used_credits ?? 0) - refundAmount);
  
  const { error: updateError } = await input.supabase
    .from('user_credits')
    .update({ used_credits: newUsedCredits, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (updateError) {
    console.error('releaseCredits: update failed', updateError.message);
  }

  // Record refund transaction
  await input.supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: refundAmount,
    transaction_type: 'refund',
    resource_type: 'credit',
    metadata: {
      reason: input.reason || 'operation_failed',
      reference_id: input.holdId,
      ...(input.metadata || {}),
    },
  });
}

export function insufficientCreditsResponse(error: InsufficientCreditsError, extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: 'Insufficient credits',
      code: error.code,
      required: error.required,
      available: error.available,
      top_up_url: error.topUpUrl,
    }),
    {
      status: 402,
      headers: { ...extraHeaders, 'Content-Type': 'application/json' },
    },
  );
}
