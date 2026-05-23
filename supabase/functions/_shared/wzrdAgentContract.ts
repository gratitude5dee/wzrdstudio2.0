export type WzrdProvider = 'codex' | 'groq';

export interface WzrdProviderConfigInput {
  rawProvider?: string | null;
  model?: string | null;
  fallbackModel?: string | null;
  hasOpenAIKey?: boolean;
  hasGroqKey?: boolean;
}

export interface WzrdProviderConfig {
  provider: WzrdProvider;
  rawProvider: string;
  model: string;
  fallbackModel: string;
  hasOpenAIKey: boolean;
  hasGroqKey: boolean;
  ready: boolean;
  setupErrors: string[];
}

export interface WzrdBlueprintLike {
  nodes?: Array<{
    actionId?: string;
    model?: string;
    modelId?: string;
  }>;
  edges?: Array<{
    from: number;
    to: number;
  }>;
}

export function extractWzrdOpenAIText(data: Record<string, unknown>): string | null {
  if (typeof data.output_text === 'string') return data.output_text;

  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string') return text;
    }
  }

  return null;
}

export function normalizeWzrdProviderConfig(input: WzrdProviderConfigInput): WzrdProviderConfig {
  const rawProvider = (input.rawProvider || 'codex').trim().toLowerCase();
  const provider: WzrdProvider = rawProvider === 'groq' || rawProvider === 'codex' ? rawProvider : 'codex';
  const model = input.model || '';
  const fallbackModel = input.fallbackModel || 'llama-3.3-70b-versatile';
  const hasOpenAIKey = Boolean(input.hasOpenAIKey);
  const hasGroqKey = Boolean(input.hasGroqKey);
  const setupErrors: string[] = [];

  if (rawProvider !== provider) {
    setupErrors.push(`WZRD_AGENT_PROVIDER must be "codex" or "groq"; received "${rawProvider}".`);
  }
  if (provider === 'codex') {
    if (!hasOpenAIKey) setupErrors.push('OPENAI_API_KEY is not configured in Supabase Edge Function secrets.');
    if (!model) setupErrors.push('WZRD_AGENT_MODEL is not configured in Supabase Edge Function secrets.');
  }
  if (provider === 'groq' && !hasGroqKey) {
    setupErrors.push('GROQ_API_KEY is not configured in Supabase Edge Function secrets.');
  }

  return {
    provider,
    rawProvider,
    model,
    fallbackModel,
    hasOpenAIKey,
    hasGroqKey,
    ready: setupErrors.length === 0,
    setupErrors,
  };
}

export function validateWzrdBlueprintContract(
  blueprint: WzrdBlueprintLike,
  actionIds: Set<string>,
  enabledModelIds: Set<string>
): string[] {
  const errors: string[] = [];
  const nodes = Array.isArray(blueprint.nodes) ? blueprint.nodes : [];
  const edges = Array.isArray(blueprint.edges) ? blueprint.edges : [];

  if (nodes.length === 0) {
    errors.push('Blueprint must include at least one node.');
  }

  nodes.forEach((node, index) => {
    if (node.actionId && !actionIds.has(node.actionId)) {
      errors.push(`Node ${index} uses unsupported actionId "${node.actionId}".`);
    }
    const modelId = node.modelId ?? node.model;
    const shouldValidateModel = typeof modelId === 'string' && (modelId.includes('/') || modelId.startsWith('gmi-'));
    if (shouldValidateModel && enabledModelIds.size > 0 && !enabledModelIds.has(modelId)) {
      errors.push(`Node ${index} uses model "${modelId}" that is not enabled in the model catalog.`);
    }
  });

  edges.forEach((edge, index) => {
    if (edge.from < 0 || edge.from >= nodes.length || edge.to < 0 || edge.to >= nodes.length) {
      errors.push(`Edge ${index} references a missing node.`);
    }
    if (edge.from === edge.to) {
      errors.push(`Edge ${index} connects a node to itself.`);
    }
  });

  return errors;
}
