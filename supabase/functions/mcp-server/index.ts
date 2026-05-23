/**
 * WZRD Studio MCP Server (hand-rolled JSON-RPC 2.0 over HTTP).
 *
 * Replaces npm:mcp-lite (unresolvable in Deno) with a minimal MCP-compatible
 * Streamable HTTP transport. Supports the standard handshake methods
 * (initialize, tools/list, tools/call) used by Claude Code, Codex, OpenClaw,
 * and Hermes harnesses.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function svc() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function invoke(fnName: string, body: unknown, authHeader?: string) {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

// ─── Tool definitions ──────────────────────────────────────────────
type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

const tools: Tool[] = [
  {
    name: 'list_models',
    description: 'List models in the WZRD AI catalog with credit cost, provider, and capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaType: { type: 'string', enum: ['text', 'image', 'video', 'audio'] },
        provider: { type: 'string' },
      },
    },
    handler: async (args) => {
      const sb = svc();
      let q = sb.from('ai_model_catalog').select('id,name,provider,media_type,credits,pricing_text,description').eq('enabled', true);
      if (typeof args.mediaType === 'string') q = q.eq('media_type', args.mediaType);
      if (typeof args.provider === 'string') q = q.eq('provider', args.provider);
      const { data, error } = await q.order('sort_rank', { ascending: true }).limit(200);
      if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
  {
    name: 'get_credits',
    description: "Get a user's available credit balance by user_id.",
    inputSchema: {
      type: 'object',
      properties: { user_id: { type: 'string' } },
      required: ['user_id'],
    },
    handler: async (args) => {
      const user_id = String(args.user_id ?? '');
      const sb = svc();
      const { data, error } = await sb
        .from('user_credits')
        .select('total_credits,used_credits')
        .eq('user_id', user_id)
        .maybeSingle();
      if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      const available = Math.max(0, (data?.total_credits ?? 0) - (data?.used_credits ?? 0));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ user_id, available, total: data?.total_credits ?? 0, used: data?.used_credits ?? 0 }),
        }],
      };
    },
  },
  {
    name: 'create_project',
    description: 'Create a new WZRD project for the given user.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['user_id', 'title'],
    },
    handler: async (args) => {
      const sb = svc();
      const { data, error } = await sb
        .from('projects')
        .insert({
          user_id: String(args.user_id),
          title: String(args.title),
          description: typeof args.description === 'string' ? args.description : null,
        })
        .select('id,title,created_at')
        .single();
      if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    },
  },
  {
    name: 'get_timeline',
    description: 'Fetch scenes and shots for a project (read-only).',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' } },
      required: ['project_id'],
    },
    handler: async (args) => {
      const project_id = String(args.project_id ?? '');
      const sb = svc();
      const [scenes, shots] = await Promise.all([
        sb.from('scenes').select('*').eq('project_id', project_id).order('scene_number'),
        sb.from('shots').select('*').eq('project_id', project_id).order('shot_number'),
      ]);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ scenes: scenes.data ?? [], shots: shots.data ?? [] }),
        }],
      };
    },
  },
  {
    name: 'run_studio_graph',
    description: 'Execute a saved compute graph for a project node-by-node.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        auth_token: { type: 'string', description: 'Bearer token for the user' },
      },
      required: ['project_id', 'auth_token'],
    },
    handler: async (args) => {
      const r = await invoke('compute-execute', { project_id: String(args.project_id) }, `Bearer ${String(args.auth_token)}`);
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  },
  {
    name: 'create_checkout_session',
    description: 'Create a billing checkout URL for plan upgrade or credit pack.',
    inputSchema: {
      type: 'object',
      properties: {
        auth_token: { type: 'string' },
        plan: { type: 'string', enum: ['pro', 'enterprise'] },
        pack: { type: 'string', description: 'Credit pack id (alternative to plan)' },
      },
      required: ['auth_token'],
    },
    handler: async (args) => {
      const r = await invoke(
        'billing-checkout',
        { plan: args.plan, pack: args.pack },
        `Bearer ${String(args.auth_token)}`,
      );
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  },
];

const toolMap = new Map(tools.map((t) => [t.name, t]));

// ─── JSON-RPC 2.0 envelope ─────────────────────────────────────────
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function rpcError(id: string | number | null | undefined, code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

async function dispatch(req: JsonRpcRequest): Promise<unknown> {
  switch (req.method) {
    case 'initialize':
      return rpcResult(req.id, {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'wzrd-studio', version: '1.0.0' },
        capabilities: { tools: {} },
      });
    case 'notifications/initialized':
      return null; // notification — no response
    case 'ping':
      return rpcResult(req.id, {});
    case 'tools/list':
      return rpcResult(req.id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case 'tools/call': {
      const name = String((req.params as Record<string, unknown> | undefined)?.name ?? '');
      const args = ((req.params as Record<string, unknown> | undefined)?.arguments ?? {}) as Record<string, unknown>;
      const tool = toolMap.get(name);
      if (!tool) return rpcError(req.id, -32601, `Unknown tool: ${name}`);
      try {
        const result = await tool.handler(args);
        return rpcResult(req.id, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Tool execution failed';
        return rpcError(req.id, -32000, message);
      }
    }
    default:
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const isRoot = url.pathname.endsWith('/mcp-server') || url.pathname.endsWith('/mcp-server/') || url.pathname === '/';

  if (req.method === 'GET') {
    return jsonResponse({
      name: 'wzrd-studio',
      version: '1.0.0',
      transport: 'streamable-http-jsonrpc2',
      endpoint: '/functions/v1/mcp-server',
      tools: tools.map((t) => t.name),
      docs: isRoot ? 'POST JSON-RPC 2.0 envelopes to this endpoint.' : undefined,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(rpcError(null, -32600, 'Only POST is accepted for JSON-RPC.'), 405);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, 'Parse error'), 400);
  }

  // Batch
  if (Array.isArray(payload)) {
    const responses = await Promise.all(payload.map((p) => dispatch(p as JsonRpcRequest)));
    const filtered = responses.filter((r) => r !== null);
    return jsonResponse(filtered);
  }

  const result = await dispatch(payload as JsonRpcRequest);
  if (result === null) return new Response(null, { status: 204, headers: corsHeaders });
  return jsonResponse(result);
});
