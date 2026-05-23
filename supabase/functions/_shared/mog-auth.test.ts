import {
  MoltbookVerificationError,
  deriveWalletFromMoltbookId,
  mapMoltbookErrorStatus,
} from './moltbook.ts';
import { MogAuthError, authenticateMogRequest } from './mog-auth.ts';

type AgentRecord = Record<string, unknown>;

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

function createSupabaseStub(initialAgents: AgentRecord[] = []) {
  const agents = [...initialAgents];

  return {
    from(table: string) {
      if (table !== 'mog_agent_profiles') {
        throw new Error(`Unsupported table in test stub: ${table}`);
      }

      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              const matched = agents.filter((agent) => agent[column] === value);
              return {
                maybeSingle: async () => ({ data: matched[0] || null, error: null }),
              };
            },
          };
        },
        update(patch: AgentRecord) {
          return {
            eq(column: string, value: unknown) {
              let updated: AgentRecord | null = null;
              for (const agent of agents) {
                if (agent[column] === value) {
                  Object.assign(agent, patch);
                  updated = { ...agent };
                }
              }
              return {
                select() {
                  return {
                    single: async () => ({ data: updated, error: updated ? null : { message: 'Not found' } }),
                  };
                },
              };
            },
          };
        },
        insert(payload: AgentRecord) {
          const row = { id: payload.id || `agent-${agents.length + 1}`, ...payload };
          agents.push(row);
          return {
            select() {
              return {
                single: async () => ({ data: row, error: null }),
              };
            },
          };
        },
      };
    },
    getAgents() {
      return agents;
    },
  };
}

Deno.test('deriveWalletFromMoltbookId is deterministic and wallet-shaped', async () => {
  const walletA = await deriveWalletFromMoltbookId('molt-agent-1');
  const walletB = await deriveWalletFromMoltbookId('molt-agent-1');
  const walletC = await deriveWalletFromMoltbookId('molt-agent-2');

  assertEquals(walletA, walletB, 'Wallets for same Moltbook id should match');
  assert(walletA !== walletC, 'Wallets for different Moltbook ids should differ');
  assert(/^0x[a-f0-9]{40}$/.test(walletA), 'Wallet must match ethereum-like format');
});

Deno.test('mapMoltbookErrorStatus returns expected HTTP statuses', () => {
  assertEquals(mapMoltbookErrorStatus('identity_token_expired'), 401, 'identity_token_expired should map to 401');
  assertEquals(mapMoltbookErrorStatus('agent_deactivated'), 403, 'agent_deactivated should map to 403');
  assertEquals(mapMoltbookErrorStatus('agent_not_found'), 404, 'agent_not_found should map to 404');
  assertEquals(mapMoltbookErrorStatus('rate_limit_exceeded'), 429, 'rate_limit_exceeded should map to 429');
});

Deno.test('authenticateMogRequest: API key only (valid)', async () => {
  const supabase = createSupabaseStub([
    {
      id: 'agent-1',
      name: 'Legacy Agent',
      wallet_address: '0x1111111111111111111111111111111111111111',
      moltbook_id: 'legacy:0x1111111111111111111111111111111111111111',
    },
  ]);

  const req = new Request('https://example.com/functions/v1/mog-upload', {
    headers: {
      'X-Mog-API-Key': 'mog_valid_key',
    },
  });

  const result = await authenticateMogRequest(req, supabase, {}, {
    getAgentByApiKeyFn: async () => supabase.getAgents()[0],
    verifyMoltbookIdentityFn: async () => {
      throw new Error('verifyMoltbookIdentity should not run');
    },
    deriveWalletFromMoltbookIdFn: async () => '0x0000000000000000000000000000000000000000',
  });

  assertEquals(result.auth_mode, 'api_key', 'Expected API key auth mode');
  assertEquals(result.agent.id, 'agent-1', 'Expected legacy agent id');
});

Deno.test('authenticateMogRequest: Moltbook only (invalid token)', async () => {
  const supabase = createSupabaseStub();
  const req = new Request('https://example.com/functions/v1/mog-upload', {
    headers: {
      'X-Moltbook-Identity': 'expired_token',
    },
  });

  let thrown: unknown = null;
  try {
    await authenticateMogRequest(req, supabase, {}, {
      getAgentByApiKeyFn: async () => null,
      verifyMoltbookIdentityFn: async () => {
        throw new MoltbookVerificationError('identity_token_expired', 401, 'identity_token_expired');
      },
      deriveWalletFromMoltbookIdFn: async () => '0x0000000000000000000000000000000000000000',
    });
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof MogAuthError, 'Expected MogAuthError');
  assertEquals((thrown as MogAuthError).code, 'identity_token_expired', 'Expected identity token error code');
  assertEquals((thrown as MogAuthError).status, 401, 'Expected 401 status');
});

Deno.test('authenticateMogRequest: Moltbook only (valid token)', async () => {
  const supabase = createSupabaseStub();
  const req = new Request('https://example.com/functions/v1/mog-upload', {
    headers: {
      'X-Moltbook-Identity': 'valid_identity_token',
    },
  });

  const result = await authenticateMogRequest(req, supabase, {}, {
    getAgentByApiKeyFn: async () => null,
    verifyMoltbookIdentityFn: async () => ({
      id: 'molt-valid-1',
      name: 'OpenClaw Agent',
      stats: { posts: 3, comments: 9 },
      owner: { x_verified: true },
    }),
    deriveWalletFromMoltbookIdFn: async () => '0x2222222222222222222222222222222222222222',
  });

  assertEquals(result.auth_mode, 'moltbook', 'Expected Moltbook auth mode');
  assertEquals(result.agent.moltbook_id as string, 'molt-valid-1', 'Expected Moltbook id to be persisted');
});

Deno.test('authenticateMogRequest: both headers same agent passes', async () => {
  const supabase = createSupabaseStub([
    {
      id: 'agent-1',
      name: 'Same Agent',
      wallet_address: '0x3333333333333333333333333333333333333333',
      moltbook_id: 'molt-same',
    },
  ]);

  const req = new Request('https://example.com/functions/v1/mog-upload', {
    headers: {
      'X-Mog-API-Key': 'mog_valid_key',
      'X-Moltbook-Identity': 'molt_identity_same',
    },
  });

  const result = await authenticateMogRequest(req, supabase, {}, {
    getAgentByApiKeyFn: async () => supabase.getAgents()[0],
    verifyMoltbookIdentityFn: async () => ({
      id: 'molt-same',
      name: 'Same Agent',
      owner: { x_verified: true },
    }),
    deriveWalletFromMoltbookIdFn: async () => '0x3333333333333333333333333333333333333333',
  });

  assertEquals(result.auth_mode, 'moltbook', 'Expected Moltbook mode when both headers are provided');
  assertEquals(result.agent.id, 'agent-1', 'Expected same resolved agent');
});

Deno.test('authenticateMogRequest: both headers mismatch', async () => {
  const supabase = createSupabaseStub([
    {
      id: 'agent-legacy',
      name: 'Legacy Agent',
      wallet_address: '0x4444444444444444444444444444444444444444',
      moltbook_id: 'legacy:0x4444444444444444444444444444444444444444',
    },
  ]);

  const req = new Request('https://example.com/functions/v1/mog-upload', {
    headers: {
      'X-Mog-API-Key': 'mog_valid_key',
      'X-Moltbook-Identity': 'molt_identity',
    },
  });

  let thrown: unknown = null;
  try {
    await authenticateMogRequest(req, supabase, {}, {
      getAgentByApiKeyFn: async () => supabase.getAgents()[0],
      verifyMoltbookIdentityFn: async () => ({
        id: 'molt-other',
        name: 'Different Agent',
      }),
      deriveWalletFromMoltbookIdFn: async () => '0x5555555555555555555555555555555555555555',
    });
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof MogAuthError, 'Expected MogAuthError');
  assertEquals((thrown as MogAuthError).code, 'identity_mismatch', 'Expected identity mismatch error');
  assertEquals((thrown as MogAuthError).status, 409, 'Expected 409 status');
});
