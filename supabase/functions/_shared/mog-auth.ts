import { getAgentByApiKey } from './hash.ts';
import {
  MoltbookVerificationError,
  deriveWalletFromMoltbookId,
  toProfilePatch,
  verifyMoltbookIdentity,
} from './moltbook.ts';

export type MogAuthMode = 'api_key' | 'moltbook';

export interface MogAgentRecord {
  id: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  wallet_address: string;
  moltbook_id?: string | null;
  karma?: number | null;
  post_count?: number | null;
  follower_count?: number | null;
  following_count?: number | null;
  is_verified?: boolean | null;
  created_at?: string | null;
  last_active_at?: string | null;
  api_key_hash?: string | null;
  [key: string]: unknown;
}

export interface AuthenticatedMogRequest {
  agent: MogAgentRecord;
  auth_mode: MogAuthMode;
}

export interface AuthenticateMogRequestOptions {
  explicitWalletAddress?: string | null;
}

export interface MogAuthDependencies {
  getAgentByApiKeyFn?: typeof getAgentByApiKey;
  verifyMoltbookIdentityFn?: typeof verifyMoltbookIdentity;
  deriveWalletFromMoltbookIdFn?: typeof deriveWalletFromMoltbookId;
}

export class MogAuthError extends Error {
  status: number;
  code: string;
  hint: string | null;
  details: Record<string, unknown> | null;

  constructor(
    message: string,
    status: number,
    code: string,
    options?: { hint?: string | null; details?: Record<string, unknown> | null },
  ) {
    super(message);
    this.name = 'MogAuthError';
    this.status = status;
    this.code = code;
    this.hint = options?.hint ?? null;
    this.details = options?.details ?? null;
  }
}

export interface MogAuthHeaders {
  apiKey: string | null;
  identityToken: string | null;
}

function safeTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizeAgentName(input: unknown): string {
  const raw = safeTrim(input) ?? 'OpenClaw Agent';
  const cleaned = raw
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'&]/g, '')
    .replace(/[^a-zA-Z0-9\s._-]/g, '')
    .trim();
  if (cleaned.length >= 2 && cleaned.length <= 50) {
    return cleaned;
  }
  return 'OpenClaw Agent';
}

export function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function resolveMogAuthHeaders(headers: Headers): MogAuthHeaders {
  return {
    apiKey: safeTrim(headers.get('X-Mog-API-Key') || headers.get('x-mog-api-key')),
    identityToken: safeTrim(headers.get('X-Moltbook-Identity') || headers.get('x-moltbook-identity')),
  };
}

export function isSameResolvedAgent(apiAgent: MogAgentRecord, moltbookAgent: MogAgentRecord): boolean {
  if (apiAgent.id && moltbookAgent.id && apiAgent.id === moltbookAgent.id) {
    return true;
  }

  const apiMoltbookId = safeTrim(apiAgent.moltbook_id);
  const moltbookMoltbookId = safeTrim(moltbookAgent.moltbook_id);
  if (apiMoltbookId && moltbookMoltbookId && apiMoltbookId === moltbookMoltbookId) {
    return true;
  }

  return false;
}

async function resolveApiKeyAgent(
  supabase: any,
  apiKey: string,
  getAgentByApiKeyFn: typeof getAgentByApiKey,
): Promise<MogAgentRecord> {
  const agent = await getAgentByApiKeyFn(supabase, apiKey);
  if (!agent) {
    throw new MogAuthError('Invalid API key', 401, 'invalid_api_key');
  }

  await supabase
    .from('mog_agent_profiles')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', agent.id);

  return agent as MogAgentRecord;
}

function toLegacyMoltbookId(walletAddress: string): string {
  return `legacy:${walletAddress.toLowerCase()}`;
}

async function resolveMoltbookAgent(
  supabase: any,
  identityToken: string,
  options: AuthenticateMogRequestOptions,
  dependencies: Required<MogAuthDependencies>,
): Promise<MogAgentRecord> {
  let verifiedAgent;
  try {
    verifiedAgent = await dependencies.verifyMoltbookIdentityFn(identityToken);
  } catch (error) {
    if (error instanceof MoltbookVerificationError) {
      throw new MogAuthError(error.code, error.status, error.code, {
        hint: error.hint,
        details: {
          provider_status: error.providerStatus,
          retry_after_seconds: error.retryAfterSeconds,
        },
      });
    }
    throw new MogAuthError('moltbook_verify_failed', 502, 'moltbook_verify_failed');
  }

  const normalizedMoltbookId = safeTrim(verifiedAgent.id);
  if (!normalizedMoltbookId) {
    throw new MogAuthError('invalid_token', 401, 'invalid_token', {
      hint: 'Moltbook token did not include a valid agent id',
    });
  }

  const { data: existingAgent, error: existingError } = await supabase
    .from('mog_agent_profiles')
    .select('*')
    .eq('moltbook_id', normalizedMoltbookId)
    .maybeSingle();

  if (existingError) {
    throw new MogAuthError('Failed to load agent profile', 500, 'profile_lookup_failed');
  }

  const profilePatch = toProfilePatch(verifiedAgent);
  if (existingAgent) {
    const updates = {
      ...profilePatch,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedAgent, error: updateError } = await supabase
      .from('mog_agent_profiles')
      .update(updates)
      .eq('id', existingAgent.id)
      .select('*')
      .single();

    if (updateError || !updatedAgent) {
      throw new MogAuthError('Failed to sync Moltbook profile', 500, 'profile_sync_failed');
    }

    return updatedAgent as MogAgentRecord;
  }

  const explicitWalletAddress = safeTrim(options.explicitWalletAddress || null);
  if (explicitWalletAddress && !isValidWalletAddress(explicitWalletAddress)) {
    throw new MogAuthError(
      'wallet_address must be a valid Ethereum address',
      400,
      'invalid_wallet_address',
    );
  }

  const walletAddress = explicitWalletAddress
    ? explicitWalletAddress.toLowerCase()
    : await dependencies.deriveWalletFromMoltbookIdFn(normalizedMoltbookId);

  if (!isValidWalletAddress(walletAddress)) {
    throw new MogAuthError('Generated wallet address is invalid', 500, 'invalid_wallet_address');
  }

  const name = sanitizeAgentName(profilePatch.name);
  const { data: insertedAgent, error: insertError } = await supabase
    .from('mog_agent_profiles')
    .insert({
      ...profilePatch,
      name,
      wallet_address: walletAddress,
      moltbook_id: normalizedMoltbookId,
      identity_provider: 'moltbook',
      karma: profilePatch.karma ?? 0,
      post_count: profilePatch.post_count ?? 0,
      follower_count: profilePatch.follower_count ?? 0,
      following_count: profilePatch.following_count ?? 0,
      is_verified: Boolean(profilePatch.is_verified),
      api_key_hash: null,
    })
    .select('*')
    .single();

  if (insertError || !insertedAgent) {
    throw new MogAuthError('Failed to create Moltbook agent profile', 500, 'profile_create_failed');
  }

  return insertedAgent as MogAgentRecord;
}

export async function authenticateMogRequest(
  req: Request,
  supabase: any,
  options: AuthenticateMogRequestOptions = {},
  dependencies: MogAuthDependencies = {},
): Promise<AuthenticatedMogRequest> {
  const { apiKey, identityToken } = resolveMogAuthHeaders(req.headers);
  if (!apiKey && !identityToken) {
    throw new MogAuthError(
      'Missing authentication header',
      401,
      'missing_auth',
      { hint: 'Provide X-Mog-API-Key or X-Moltbook-Identity' },
    );
  }

  const deps: Required<MogAuthDependencies> = {
    getAgentByApiKeyFn: dependencies.getAgentByApiKeyFn ?? getAgentByApiKey,
    verifyMoltbookIdentityFn: dependencies.verifyMoltbookIdentityFn ?? verifyMoltbookIdentity,
    deriveWalletFromMoltbookIdFn: dependencies.deriveWalletFromMoltbookIdFn ?? deriveWalletFromMoltbookId,
  };

  let apiAgent: MogAgentRecord | null = null;
  let moltbookAgent: MogAgentRecord | null = null;

  if (apiKey) {
    apiAgent = await resolveApiKeyAgent(supabase, apiKey, deps.getAgentByApiKeyFn);
  }

  if (identityToken) {
    moltbookAgent = await resolveMoltbookAgent(supabase, identityToken, options, deps);
  }

  if (apiAgent && moltbookAgent && !isSameResolvedAgent(apiAgent, moltbookAgent)) {
    throw new MogAuthError(
      'identity_mismatch',
      409,
      'identity_mismatch',
      { hint: 'X-Mog-API-Key and X-Moltbook-Identity must resolve to the same agent' },
    );
  }

  if (moltbookAgent) {
    return { agent: moltbookAgent, auth_mode: 'moltbook' };
  }

  if (apiAgent) {
    if (!safeTrim(apiAgent.moltbook_id)) {
      await supabase
        .from('mog_agent_profiles')
        .update({ moltbook_id: toLegacyMoltbookId(apiAgent.wallet_address) })
        .eq('id', apiAgent.id);
      apiAgent.moltbook_id = toLegacyMoltbookId(apiAgent.wallet_address);
    }
    return { agent: apiAgent, auth_mode: 'api_key' };
  }

  throw new MogAuthError('Missing authentication header', 401, 'missing_auth');
}
