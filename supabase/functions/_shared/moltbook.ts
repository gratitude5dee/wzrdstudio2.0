const DEFAULT_MOLTBOOK_AUDIENCE = 'ixkkrousepsiorwlaycp.supabase.co';
const MOLTBOOK_VERIFY_URL = 'https://moltbook.com/api/v1/agents/verify-identity';

export interface MoltbookOwner {
  x_handle?: string | null;
  x_name?: string | null;
  x_avatar?: string | null;
  x_verified?: boolean | null;
  x_follower_count?: number | null;
}

export interface MoltbookStats {
  posts?: number | null;
  comments?: number | null;
}

export interface MoltbookHuman {
  username?: string | null;
  email_verified?: boolean | null;
}

export interface MoltbookAgent {
  id: string;
  name: string;
  description?: string | null;
  karma?: number | null;
  avatar_url?: string | null;
  is_claimed?: boolean | null;
  created_at?: string | null;
  follower_count?: number | null;
  following_count?: number | null;
  stats?: MoltbookStats | null;
  owner?: MoltbookOwner | null;
  human?: MoltbookHuman | null;
}

interface MoltbookVerifyResponse {
  success?: boolean;
  valid?: boolean;
  agent?: MoltbookAgent;
  error?: string;
  hint?: string;
  retry_after_seconds?: number;
}

export interface MoltbookErrorDetails {
  code: string;
  hint?: string | null;
  retry_after_seconds?: number | null;
  status?: number;
  provider_status?: number;
}

export class MoltbookVerificationError extends Error {
  status: number;
  code: string;
  hint: string | null;
  retryAfterSeconds: number | null;
  providerStatus: number | null;

  constructor(
    message: string,
    status: number,
    code: string,
    options?: { hint?: string | null; retryAfterSeconds?: number | null; providerStatus?: number | null },
  ) {
    super(message);
    this.name = 'MoltbookVerificationError';
    this.status = status;
    this.code = code;
    this.hint = options?.hint ?? null;
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
    this.providerStatus = options?.providerStatus ?? null;
  }
}

const ERROR_STATUS_MAP: Record<string, number> = {
  identity_token_expired: 401,
  invalid_token: 401,
  audience_required: 401,
  audience_mismatch: 401,
  missing_app_key: 401,
  invalid_app_key: 401,
  agent_not_found: 404,
  agent_deactivated: 403,
  rate_limit_exceeded: 429,
};

function getEnv(name: string): string | undefined {
  if (typeof Deno !== 'undefined' && typeof Deno.env?.get === 'function') {
    return Deno.env.get(name);
  }
  return undefined;
}

export function resolveMoltbookAudience(): string {
  return getEnv('MOLTBOOK_AUDIENCE') || DEFAULT_MOLTBOOK_AUDIENCE;
}

function safeTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mapMoltbookErrorStatus(code: string): number {
  return ERROR_STATUS_MAP[code] || 401;
}

function toErrorDetails(data: MoltbookVerifyResponse, status: number): MoltbookErrorDetails {
  const code = safeTrim(data.error) || 'moltbook_verify_failed';
  return {
    code,
    hint: safeTrim(data.hint),
    retry_after_seconds: typeof data.retry_after_seconds === 'number' ? data.retry_after_seconds : null,
    status: mapMoltbookErrorStatus(code),
    provider_status: status,
  };
}

export async function deriveWalletFromMoltbookId(agentId: string): Promise<string> {
  const normalized = safeTrim(agentId);
  if (!normalized) {
    throw new Error('Moltbook agent id is required');
  }

  const payload = new TextEncoder().encode(`moltbook:${normalized}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', payload);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return `0x${hashHex.slice(0, 40)}`;
}

export function toProfilePatch(agent: MoltbookAgent) {
  const nowIso = new Date().toISOString();
  const verifiedFromOwner = Boolean(agent.owner?.x_verified);
  const verifiedFromHuman = Boolean(agent.human?.email_verified);
  const verifiedFromClaim = Boolean(agent.is_claimed);

  return {
    moltbook_id: agent.id,
    identity_provider: 'moltbook',
    name: safeTrim(agent.name) || 'OpenClaw Agent',
    description: safeTrim(agent.description ?? null),
    avatar_url: safeTrim(agent.avatar_url ?? null),
    karma: typeof agent.karma === 'number' ? agent.karma : 0,
    post_count: typeof agent.stats?.posts === 'number' ? agent.stats.posts : 0,
    follower_count: typeof agent.follower_count === 'number' ? agent.follower_count : 0,
    following_count: typeof agent.following_count === 'number' ? agent.following_count : 0,
    is_verified: verifiedFromOwner || verifiedFromHuman || verifiedFromClaim,
    moltbook_owner_x_handle: safeTrim(agent.owner?.x_handle ?? null),
    moltbook_owner_x_verified: verifiedFromOwner,
    moltbook_last_verified_at: nowIso,
    last_active_at: nowIso,
    updated_at: nowIso,
  };
}

export async function verifyMoltbookIdentity(token: string, audience = resolveMoltbookAudience()): Promise<MoltbookAgent> {
  const identityToken = safeTrim(token);
  if (!identityToken) {
    throw new MoltbookVerificationError(
      'Moltbook identity token is required',
      401,
      'invalid_token',
      { hint: 'Provide the X-Moltbook-Identity header' },
    );
  }

  const appKey = getEnv('MOLTBOOK_APP_KEY');
  if (!safeTrim(appKey)) {
    throw new MoltbookVerificationError(
      'MOLTBOOK_APP_KEY is not configured',
      500,
      'missing_app_key',
      { hint: 'Set MOLTBOOK_APP_KEY in Supabase edge function secrets' },
    );
  }

  let response: Response;
  try {
    response = await fetch(MOLTBOOK_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-App-Key': appKey!,
      },
      body: JSON.stringify({
        token: identityToken,
        audience,
      }),
    });
  } catch (error) {
    console.error('Moltbook verify request failed:', error);
    throw new MoltbookVerificationError(
      'Unable to reach Moltbook verification endpoint',
      502,
      'moltbook_verify_failed',
      { hint: 'Retry shortly. If the problem persists, check network or provider availability.' },
    );
  }

  const payload = await response.json().catch(() => ({} as MoltbookVerifyResponse)) as MoltbookVerifyResponse;
  if (!response.ok || !payload.valid || !payload.agent) {
    const details = toErrorDetails(payload, response.status);
    throw new MoltbookVerificationError(
      details.code,
      details.status ?? 401,
      details.code,
      {
        hint: details.hint ?? null,
        retryAfterSeconds: details.retry_after_seconds ?? null,
        providerStatus: details.provider_status ?? null,
      },
    );
  }

  return payload.agent;
}
