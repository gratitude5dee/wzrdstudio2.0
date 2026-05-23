import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, handleCors, errorResponse, successResponse } from '../_shared/response.ts';
import { safeLog } from '../_shared/safe-logger.ts';
import { MEDIA_ACTIONS } from '../_shared/mediaActionRegistry.ts';
import {
  extractWzrdOpenAIText,
  normalizeWzrdProviderConfig,
  validateWzrdBlueprintContract,
} from '../_shared/wzrdAgentContract.ts';

type WorkflowMode = 'legacy' | 'plan' | 'materialize' | 'repair' | 'health';

type AssetRef = {
  id: string;
  type: 'image' | 'video' | 'text' | 'json' | 'audio' | '3d';
  url?: string;
  name?: string;
  durationMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  role?: string;
  metadata?: Record<string, unknown>;
};

type WorkflowContext = {
  projectTitle?: string;
  selectedNode?: {
    id: string;
    kind: string;
    label: string;
    model?: string;
    prompt?: string;
  } | null;
  nodes?: Array<{
    id: string;
    kind: string;
    label: string;
    model?: string;
    hasPreview?: boolean;
  }>;
  edges?: Array<{
    sourceKind: string;
    targetKind: string;
    dataType: string;
  }>;
  assets?: AssetRef[];
  answers?: Record<string, unknown>;
};

type WorkflowSettings = {
  defaultModel?: 'auto' | 'fast' | 'quality' | 'premium';
  outputResolution?: '1K' | '2K' | '4K';
  workflowComplexity?: 'simple' | 'standard' | 'advanced';
};

type WorkflowQuestion = {
  id: string;
  label: string;
  controlType:
    | 'text'
    | 'textarea'
    | 'select'
    | 'segmented'
    | 'slider'
    | 'checkbox'
    | 'audio-clip'
    | 'image-role'
    | 'video-trim';
  options?: Array<{ label: string; value: string }>;
  defaultValue?: unknown;
  assetRef?: AssetRef;
  required?: boolean;
};

type WorkflowBlueprintNode = {
  kind: string;
  label: string;
  actionId?: string;
  model?: string;
  modelId?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  assetRefs?: AssetRef[];
  controls?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  executionPolicy?: 'manual' | 'auto' | 'deferred';
};

type WorkflowBlueprint = {
  nodes: WorkflowBlueprintNode[];
  edges: Array<{ from: number; to: number; sourceHandle?: string; targetHandle?: string }>;
  layout?: 'horizontal' | 'vertical' | 'tree';
  assistantMessage?: string;
  questions?: WorkflowQuestion[];
  detectedAssets?: AssetRef[];
  provider?: 'codex' | 'groq' | 'fallback';
  mode?: WorkflowMode;
  validationErrors?: string[];
};

type AgentResponse = {
  assistantMessage: string;
  questions: WorkflowQuestion[];
  blueprint: WorkflowBlueprint;
};

type OpenAIFunctionCall = {
  name: string;
  call_id: string;
  arguments?: string;
};

class WzrdProviderSetupError extends Error {
  details: Record<string, unknown>;
  status: number;

  constructor(message: string, details: Record<string, unknown> = {}, status = 503) {
    super(message);
    this.name = 'WzrdProviderSetupError';
    this.details = details;
    this.status = status;
  }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ACTION_IDS = new Set(MEDIA_ACTIONS.map((action) => action.actionId));

const ACTION_CATALOG = MEDIA_ACTIONS.map((action) => ({
  actionId: action.actionId,
  kind: action.nodeKind,
  label: action.label,
  description: action.description,
  mediaType: action.mediaType,
  workflowType: action.workflowType,
  inputs: action.inputs.map((port) => ({ id: port.id, name: port.name, datatype: port.datatype })),
  outputs: action.outputs.map((port) => ({ id: port.id, name: port.name, datatype: port.datatype })),
  defaultModelId: action.defaultModelId,
  executor: action.executor,
}));

function getWzrdProviderConfig() {
  return normalizeWzrdProviderConfig({
    rawProvider: Deno.env.get('WZRD_AGENT_PROVIDER') || 'codex',
    model: Deno.env.get('WZRD_AGENT_MODEL') || '',
    fallbackModel: Deno.env.get('WZRD_AGENT_FALLBACK_MODEL') || 'llama-3.3-70b-versatile',
    hasOpenAIKey: Boolean(Deno.env.get('OPENAI_API_KEY')),
    hasGroqKey: Boolean(Deno.env.get('GROQ_API_KEY')),
  });
}

function assertCodexConfigured() {
  const config = getWzrdProviderConfig();
  if (config.provider !== 'codex') return config;
  if (!config.ready) {
    throw new WzrdProviderSetupError('WZRD Agent is not configured for Codex.', {
      code: 'wzrd_codex_setup',
      provider: config.provider,
      rawProvider: config.rawProvider,
      model: config.model || null,
      setupErrors: config.setupErrors,
    });
  }
  return config;
}

const MODEL_PRESETS: Record<string, Record<string, string>> = {
  fast: { Image: 'flux-schnell', Video: 'kling-2-1', Text: 'llama-3.3-70b-versatile' },
  quality: { Image: 'flux-dev', Video: 'kling-2-1', Text: 'llama-3.3-70b-versatile' },
  premium: { Image: 'flux-pro-ultra', Video: 'kling-2-1', Text: 'llama-3.3-70b-versatile' },
  auto: { Image: 'flux-dev', Video: 'kling-2-1', Text: 'llama-3.3-70b-versatile' },
};

const WORKFLOW_TEMPLATES: Record<string, {
  nodes: Array<{ kind: string; label: string; model: string; prompt?: string }>;
  edges: Array<{ sourceIndex: number; targetIndex: number; sourceHandle: string; targetHandle: string }>;
  layout: 'horizontal' | 'vertical' | 'tree';
}> = {
  marketing: {
    nodes: [
      { kind: 'Text', label: 'Brand Copy', model: 'llama-3.3-70b-versatile', prompt: '' },
      { kind: 'Image', label: 'Visual Design', model: 'flux-dev', prompt: '' },
      { kind: 'Video', label: 'Promo Video', model: 'kling-2-1', prompt: '' },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, sourceHandle: 'text', targetHandle: 'prompt' },
      { sourceIndex: 1, targetIndex: 2, sourceHandle: 'image', targetHandle: 'image' },
    ],
    layout: 'horizontal',
  },
  'video-production': {
    nodes: [
      { kind: 'Text', label: 'Storyboard', model: 'llama-3.3-70b-versatile', prompt: '' },
      { kind: 'Image', label: 'Key Frames', model: 'flux-dev', prompt: '' },
      { kind: 'Video', label: 'Final Video', model: 'kling-2-1', prompt: '' },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, sourceHandle: 'text', targetHandle: 'prompt' },
      { sourceIndex: 1, targetIndex: 2, sourceHandle: 'image', targetHandle: 'image' },
    ],
    layout: 'horizontal',
  },
  'image-generation': {
    nodes: [{ kind: 'Image', label: 'Generated Image', model: 'flux-dev', prompt: '' }],
    edges: [],
    layout: 'horizontal',
  },
  'text-processing': {
    nodes: [{ kind: 'Text', label: 'Text Generation', model: 'llama-3.3-70b-versatile', prompt: '' }],
    edges: [],
    layout: 'horizontal',
  },
};

const AGENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assistantMessage', 'questions', 'blueprint'],
  properties: {
    assistantMessage: { type: 'string' },
    questions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'label', 'controlType'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          controlType: { type: 'string' },
          options: { type: 'array', items: { type: 'object', additionalProperties: true } },
          defaultValue: {},
          assetRef: { type: 'object', additionalProperties: true },
          required: { type: 'boolean' },
        },
      },
    },
    blueprint: {
      type: 'object',
      additionalProperties: true,
      required: ['nodes', 'edges'],
      properties: {
        nodes: { type: 'array', items: { type: 'object', additionalProperties: true } },
        edges: { type: 'array', items: { type: 'object', additionalProperties: true } },
        layout: { type: 'string' },
      },
    },
  },
};

const EMPTY_TOOL_PARAMETERS = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
};

const WZRD_AGENT_TOOLS = [
  {
    type: 'function',
    name: 'inspect_action_registry',
    description: 'Return supported Studio media actions, handles, executors, defaults, and model constraints.',
    parameters: EMPTY_TOOL_PARAMETERS,
    strict: true,
  },
  {
    type: 'function',
    name: 'inspect_model_catalog',
    description: 'Return enabled model identifiers that generated workflow nodes are allowed to reference.',
    parameters: EMPTY_TOOL_PARAMETERS,
    strict: true,
  },
  {
    type: 'function',
    name: 'inspect_current_graph',
    description: 'Return the current React Flow graph summary and selected node context.',
    parameters: EMPTY_TOOL_PARAMETERS,
    strict: true,
  },
  {
    type: 'function',
    name: 'inspect_uploaded_asset_metadata',
    description: 'Return uploaded and generated project assets available to WZRD Agent.',
    parameters: EMPTY_TOOL_PARAMETERS,
    strict: true,
  },
];

const buildCodexInstructions = (mode: WorkflowMode) => `You are WZRD Agent, a Codex planning brain for a React Flow media studio.
Return strict JSON only. You plan nodes; you never execute media jobs.

Mode: ${mode}

Rules:
- Ask at most 3 high-value UI questions before materializing if the request has ambiguity.
- Use generated UI controls instead of freeform questions when possible.
- If uploaded assets are present, reference them in questions and node assetRefs.
- Prefer actionId nodes from the provided action catalog for uploads, analysis, generation, edits, ffmpeg, embeds, and outputs.
- Use executionPolicy "manual" unless the user explicitly asked to run outputs now.
- Use supported action IDs exactly as provided. Do not invent action IDs.
- Keep blueprints connected. Use edge indices matching blueprint.nodes.
- For Image/Video prompts, write visual/cinematic prompts. For Text nodes, write task instructions.
- For plan mode, include questions and a draft blueprint. For materialize/repair, include final blueprint and no unnecessary questions.`;

function buildFallbackQuestions(context?: WorkflowContext): WorkflowQuestion[] {
  const assets = context?.assets ?? [];
  const firstAudio = assets.find((asset) => asset.type === 'audio');
  const firstImage = assets.find((asset) => asset.type === 'image');
  const firstVideo = assets.find((asset) => asset.type === 'video');

  const questions: WorkflowQuestion[] = [
    {
      id: 'workflow_goal',
      label: 'What should WZRD optimize for?',
      controlType: 'segmented',
      options: [
        { label: 'Speed', value: 'speed' },
        { label: 'Quality', value: 'quality' },
        { label: 'Control', value: 'control' },
      ],
      defaultValue: 'quality',
      required: true,
    },
  ];

  if (firstAudio) {
    questions.push({
      id: 'audio_clip',
      label: 'Choose the audio section to use in the workflow.',
      controlType: 'audio-clip',
      assetRef: firstAudio,
      defaultValue: { trimStartMs: firstAudio.trimStartMs ?? 0, trimEndMs: firstAudio.trimEndMs ?? firstAudio.durationMs },
      required: true,
    });
  } else if (firstVideo) {
    questions.push({
      id: 'video_role',
      label: 'How should this video guide the generated nodes?',
      controlType: 'video-trim',
      assetRef: firstVideo,
      defaultValue: { role: 'reference', trimStartMs: 0, trimEndMs: firstVideo.durationMs },
      required: true,
    });
  } else if (firstImage) {
    questions.push({
      id: 'image_role',
      label: 'How should this image be used?',
      controlType: 'image-role',
      assetRef: firstImage,
      options: [
        { label: 'Subject', value: 'subject' },
        { label: 'Style', value: 'style' },
        { label: 'Keyframe', value: 'keyframe' },
      ],
      defaultValue: 'style',
      required: true,
    });
  }

  questions.push({
    id: 'output_format',
    label: 'What output should the graph create?',
    controlType: 'select',
    options: [
      { label: 'Storyboard nodes', value: 'storyboard' },
      { label: 'Image + video chain', value: 'image_video' },
      { label: 'Final edited video', value: 'final_video' },
    ],
    defaultValue: 'image_video',
    required: true,
  });

  return questions.slice(0, 3);
}

function buildFallbackBlueprint(prompt: string, settings?: WorkflowSettings, context?: WorkflowContext): WorkflowBlueprint {
  const hasAudio = (context?.assets ?? []).some((asset) => asset.type === 'audio');
  const hasVideo = (context?.assets ?? []).some((asset) => asset.type === 'video');
  const hasImage = (context?.assets ?? []).some((asset) => asset.type === 'image');
  const resolution = settings?.outputResolution ?? '2K';

  if (hasAudio || hasVideo || hasImage) {
    const nodes: WorkflowBlueprintNode[] = [
      {
        kind: 'Upload',
        actionId: hasAudio ? 'audio.upload' : hasVideo ? 'video.upload' : 'image.upload',
        label: hasAudio ? 'Source Audio' : hasVideo ? 'Source Video' : 'Reference Image',
        params: { prompt, resolution },
        assetRefs: context?.assets ?? [],
        executionPolicy: 'manual',
      },
      {
        kind: 'Prompt',
        actionId: hasAudio ? 'audio.to-prompt' : hasVideo ? 'video.reasoning' : 'text.prompt-generation',
        label: hasAudio ? 'Audio to Prompt' : hasVideo ? 'Video Reasoning' : 'Prompt Builder',
        prompt,
        params: { resolution },
        assetRefs: context?.assets ?? [],
        executionPolicy: 'manual',
      },
      {
        kind: 'Video',
        actionId: hasImage ? 'video.image-to-video' : 'video.generate',
        label: 'Generated Video',
        prompt,
        params: { resolution, generateAudio: hasAudio },
        assetRefs: context?.assets ?? [],
        executionPolicy: 'manual',
      },
    ];
    return {
      nodes,
      edges: [
        { from: 0, to: 1, sourceHandle: hasAudio ? 'audio' : hasVideo ? 'video' : 'image', targetHandle: 'context' },
        { from: 1, to: 2, sourceHandle: 'text', targetHandle: 'prompt' },
      ],
      layout: 'horizontal',
      provider: 'fallback',
      mode: 'materialize',
    };
  }

  return legacyBlueprint(prompt, settings);
}

function legacyBlueprint(prompt: string, settings?: WorkflowSettings): WorkflowBlueprint {
  const templateName = /video|film|shot|scene/i.test(prompt)
    ? 'video-production'
    : /image|cover|poster|art/i.test(prompt)
      ? 'image-generation'
      : /copy|caption|text|script/i.test(prompt)
        ? 'text-processing'
        : 'marketing';
  const template = WORKFLOW_TEMPLATES[templateName] || WORKFLOW_TEMPLATES.marketing;
  const modelPreset = settings?.defaultModel ?? 'auto';
  const presets = MODEL_PRESETS[modelPreset] ?? MODEL_PRESETS.auto;
  const resolution = settings?.outputResolution ?? '2K';
  return {
    nodes: template.nodes.map((node) => ({
      kind: node.kind,
      label: node.label,
      model: presets[node.kind] ?? node.model,
      prompt,
      params: { resolution },
      executionPolicy: 'manual',
      metadata: { template: templateName, settings },
    })),
    edges: template.edges.map((edge) => ({
      from: edge.sourceIndex,
      to: edge.targetIndex,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
    layout: template.layout,
    provider: 'fallback',
    mode: 'legacy',
  };
}

async function fetchEnabledModelIds(supabaseAdmin: any) {
  const { data, error } = await supabaseAdmin
    .from('ai_model_catalog')
    .select('id, endpoint_id, enabled')
    .eq('enabled', true);
  if (error) {
    safeLog('warn', 'wzrd.model_catalog.load_failed', { error });
    return new Set<string>();
  }
  const ids = new Set<string>();
  for (const model of (data ?? []) as Array<{ id?: unknown; endpoint_id?: unknown }>) {
    if (typeof model.id === 'string') ids.add(model.id);
    if (typeof model.endpoint_id === 'string') ids.add(model.endpoint_id);
  }
  return ids;
}

async function assertProjectAccess(
  supabaseAdmin: any,
  userId: string,
  projectId: string
) {
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single();

  const projectRow = project as { user_id?: string } | null;
  if (error || !projectRow || projectRow.user_id !== userId) {
    throw new Error('Project not found or access denied');
  }
}

function normalizeAssetType(value: unknown): AssetRef['type'] {
  if (value === 'image' || value === 'video' || value === 'audio' || value === '3d') {
    return value;
  }
  if (value === 'json') return 'json';
  return 'text';
}

function getMetadataNumber(metadata: unknown, key: string): number | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mergeAssetRefs(...assetGroups: Array<AssetRef[] | undefined>): AssetRef[] {
  const merged = new Map<string, AssetRef>();
  for (const assets of assetGroups) {
    for (const asset of assets ?? []) {
      if (!asset.id || merged.has(asset.id)) continue;
      merged.set(asset.id, asset);
    }
  }
  return [...merged.values()].slice(0, 24);
}

async function loadProjectAssetRefs(
  supabaseAdmin: any,
  userId: string,
  projectId: string
): Promise<AssetRef[]> {
  const assets: AssetRef[] = [];

  const { data: uploadedAssets, error: uploadedError } = await supabaseAdmin
    .from('project_assets')
    .select('id, name, url, type, thumbnail_url, metadata')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(12);

  if (uploadedError) {
    safeLog('warn', 'wzrd.project_assets.load_failed', { error: uploadedError });
  } else {
    for (const asset of (uploadedAssets ?? []) as Array<{
      id: string;
      name?: string | null;
      url?: string | null;
      type?: string | null;
      thumbnail_url?: string | null;
      metadata?: Record<string, unknown> | null;
    }>) {
      if (!asset.url) continue;
      const metadata = asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
        ? asset.metadata
        : {};
      assets.push({
        id: asset.id,
        type: normalizeAssetType(asset.type),
        url: asset.url,
        name: asset.name ?? 'Project asset',
        durationMs: getMetadataNumber(metadata, 'durationMs') ?? getMetadataNumber(metadata, 'duration_ms'),
        metadata: {
          ...metadata,
          thumbnailUrl: asset.thumbnail_url,
          source: 'project_assets',
        },
      });
    }
  }

  const { data: generatedAssets, error: generatedError } = await supabaseAdmin
    .from('generation_outputs')
    .select('id, output_type, output_url, thumbnail_url, prompt, model')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(8);

  if (generatedError) {
    safeLog('warn', 'wzrd.generation_outputs.load_failed', { error: generatedError });
  } else {
    for (const asset of (generatedAssets ?? []) as Array<{
      id: string;
      output_type?: string | null;
      output_url?: string | null;
      thumbnail_url?: string | null;
      prompt?: string | null;
      model?: string | null;
    }>) {
      if (!asset.output_url) continue;
      assets.push({
        id: asset.id,
        type: normalizeAssetType(asset.output_type),
        url: asset.output_url,
        name: typeof asset.prompt === 'string' && asset.prompt ? asset.prompt.slice(0, 48) : 'Generated asset',
        metadata: {
          thumbnailUrl: asset.thumbnail_url,
          prompt: asset.prompt,
          model: asset.model,
          source: 'generation_outputs',
        },
      });
    }
  }

  const { data: finalAssets, error: finalError } = await supabaseAdmin
    .from('final_project_assets')
    .select('id, asset_type, file_url, duration_ms, metadata')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(8);

  if (finalError) {
    safeLog('warn', 'wzrd.final_assets.load_failed', { error: finalError });
  } else {
    for (const asset of (finalAssets ?? []) as Array<{
      id: string;
      asset_type?: string | null;
      file_url?: string | null;
      duration_ms?: number | null;
      metadata?: Record<string, unknown> | null;
    }>) {
      if (!asset.file_url) continue;
      const metadata = asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
        ? asset.metadata
        : {};
      assets.push({
        id: asset.id,
        type: normalizeAssetType(asset.asset_type),
        url: asset.file_url,
        name: typeof metadata.name === 'string' ? metadata.name : 'Final project asset',
        durationMs: asset.duration_ms ?? getMetadataNumber(metadata, 'durationMs'),
        metadata: {
          ...metadata,
          source: 'final_project_assets',
        },
      });
    }
  }

  return mergeAssetRefs(assets);
}

function validateBlueprint(blueprint: WorkflowBlueprint, enabledModelIds: Set<string>): string[] {
  return validateWzrdBlueprintContract(blueprint, ACTION_IDS, enabledModelIds);
}

function extractFunctionCalls(data: Record<string, unknown>): OpenAIFunctionCall[] {
  const output = Array.isArray(data.output) ? data.output : [];
  return output
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter((item) => item.type === 'function_call')
    .map((item) => ({
      name: String(item.name ?? ''),
      call_id: String(item.call_id ?? ''),
      arguments: typeof item.arguments === 'string' ? item.arguments : undefined,
    }))
    .filter((item) => item.name && item.call_id);
}

function runWzrdTool(name: string, input: {
  context: WorkflowContext;
  enabledModelIds: string[];
}) {
  switch (name) {
    case 'inspect_action_registry':
      return { actions: ACTION_CATALOG };
    case 'inspect_model_catalog':
      return { enabledModelIds: input.enabledModelIds };
    case 'inspect_current_graph':
      return {
        selectedNode: input.context.selectedNode ?? null,
        nodes: input.context.nodes ?? [],
        edges: input.context.edges ?? [],
      };
    case 'inspect_uploaded_asset_metadata':
      return { assets: input.context.assets ?? [] };
    default:
      return { error: `Unknown WZRD tool: ${name}` };
  }
}

async function postOpenAIResponse(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    const isSetupStatus = response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404;
    if (isSetupStatus) {
      throw new WzrdProviderSetupError('WZRD Agent Codex request failed.', {
        code: 'openai_responses_setup_error',
        status: response.status,
        response: text.slice(0, 2000),
      });
    }
    throw new Error(`OpenAI Responses API error (${response.status}): ${text}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function callCodexAgent(input: {
  mode: WorkflowMode;
  prompt: string;
  context: WorkflowContext;
  settings: WorkflowSettings;
  enabledModelIds: string[];
  validationErrors?: string[];
}): Promise<AgentResponse> {
  const config = assertCodexConfigured();
  const apiKey = Deno.env.get('OPENAI_API_KEY')!;
  const model = config.model;

  const textFormat = {
    format: {
      type: 'json_schema',
      name: 'wzrd_agent_response',
      schema: AGENT_SCHEMA,
      strict: false,
    },
  };
  const baseInput = [
    { role: 'system', content: buildCodexInstructions(input.mode) },
    {
      role: 'user',
      content: JSON.stringify({
        prompt: input.prompt,
        context: input.context,
        settings: input.settings,
        validationErrors: input.validationErrors ?? [],
        actionCatalog: ACTION_CATALOG,
        enabledModelIds: input.enabledModelIds,
      }),
    },
  ];

  let data = await postOpenAIResponse(apiKey, {
    model,
    input: baseInput,
    tools: WZRD_AGENT_TOOLS,
    parallel_tool_calls: false,
    text: textFormat,
  });

  let outputText = extractWzrdOpenAIText(data);
  const functionCalls = extractFunctionCalls(data);
  if (!outputText && functionCalls.length > 0) {
    const toolOutputs = functionCalls.map((call) => ({
      type: 'function_call_output',
      call_id: call.call_id,
      output: JSON.stringify(runWzrdTool(call.name, {
        context: input.context,
        enabledModelIds: input.enabledModelIds,
      })),
    }));

    data = await postOpenAIResponse(apiKey, {
      model,
      previous_response_id: data.id,
      input: toolOutputs,
      text: textFormat,
    });
    outputText = extractWzrdOpenAIText(data);
  }

  if (!outputText) {
    throw new Error('Codex provider returned no structured text output');
  }

  const parsed = JSON.parse(outputText) as AgentResponse;
  return {
    assistantMessage: parsed.assistantMessage || 'I drafted a WZRD workflow plan.',
    questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : [],
    blueprint: parsed.blueprint,
  };
}

async function callGroqLegacy(prompt: string, context: WorkflowContext, settings: WorkflowSettings): Promise<WorkflowBlueprint> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) {
    return legacyBlueprint(prompt, settings);
  }

  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get('WZRD_AGENT_FALLBACK_MODEL') || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: "system",
          content: "Return JSON with template, nodePrompts, and customizations for a connected workflow graph.",
        },
        { role: "user", content: JSON.stringify({ prompt, context, settings }) },
      ],
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });

  if (!groqResponse.ok) {
    return legacyBlueprint(prompt, settings);
  }

  const groqData = await groqResponse.json();
  const analysisText = groqData.choices?.[0]?.message?.content;
  if (!analysisText) return legacyBlueprint(prompt, settings);

  try {
    const analysis = JSON.parse(analysisText);
    const template = WORKFLOW_TEMPLATES[analysis.template] || WORKFLOW_TEMPLATES.marketing;
    const preset = MODEL_PRESETS[settings.defaultModel ?? 'auto'] ?? MODEL_PRESETS.auto;
    return {
      nodes: template.nodes.map((node, index) => ({
        kind: node.kind,
        label: analysis.customizations?.[index]?.label || node.label,
        model: analysis.customizations?.[index]?.model || preset[node.kind] || node.model,
        prompt: analysis.nodePrompts?.[String(index)] || prompt,
        params: { resolution: settings.outputResolution ?? '2K' },
        executionPolicy: 'manual',
      })),
      edges: template.edges.map((edge) => ({
        from: edge.sourceIndex,
        to: edge.targetIndex,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
      layout: template.layout,
      provider: 'groq',
      mode: 'legacy',
    };
  } catch {
    return legacyBlueprint(prompt, settings);
  }
}

async function recordWzrdSession(supabaseAdmin: any, row: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('wzrd_agent_sessions').insert(row);
  if (error) {
    safeLog('warn', 'wzrd.session.record_failed', { error });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  try {
    const user = await authenticateRequest(req.headers);
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      mode = 'legacy',
      prompt,
      context = {},
      settings = {},
      projectId,
      answers,
      validationErrors = [],
    } = await req.json() as {
      mode?: WorkflowMode;
      prompt?: string;
      context?: WorkflowContext;
      settings?: WorkflowSettings;
      projectId?: string;
      answers?: Record<string, unknown>;
      validationErrors?: string[];
    };

    if (mode === 'health') {
      const config = getWzrdProviderConfig();
      return successResponse({
        provider: config.provider,
        rawProvider: config.rawProvider,
        model: config.model || null,
        fallbackModel: config.fallbackModel,
        hasOpenAIKey: config.hasOpenAIKey,
        hasGroqKey: config.hasGroqKey,
        ready: config.ready,
        setupErrors: config.setupErrors,
      });
    }

    if (!prompt) {
      return errorResponse('Prompt is required', 400);
    }

    if (projectId) {
      await assertProjectAccess(supabaseAdmin, user.id, projectId);
    }

    const projectAssets = projectId
      ? await loadProjectAssetRefs(supabaseAdmin, user.id, projectId)
      : [];
    const mergedContext = {
      ...context,
      assets: mergeAssetRefs(context.assets, projectAssets),
      answers: answers ?? context.answers ?? {},
    };
    const enabledModelIds = await fetchEnabledModelIds(supabaseAdmin);
    const providerConfig = getWzrdProviderConfig();
    const providerPreference = providerConfig.provider;

    if (mode === 'legacy') {
      const blueprint = providerPreference === 'groq'
        ? await callGroqLegacy(prompt, mergedContext, settings)
        : legacyBlueprint(prompt, settings);
      return new Response(JSON.stringify({ blueprint }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let provider: 'codex' | 'groq' | 'fallback' = 'codex';
    let agentResponse: AgentResponse;

    try {
      if (providerPreference === 'groq') {
        const blueprint = await callGroqLegacy(prompt, mergedContext, settings);
        provider = blueprint.provider === 'groq' ? 'groq' : 'fallback';
        agentResponse = {
          assistantMessage: 'I drafted a workflow from your prompt.',
          questions: mode === 'plan' ? buildFallbackQuestions(mergedContext) : [],
          blueprint,
        };
      } else {
        agentResponse = await callCodexAgent({
          mode,
          prompt,
          context: mergedContext,
          settings,
          enabledModelIds: [...enabledModelIds],
          validationErrors,
        });
      }
    } catch (error) {
      if (providerPreference === 'codex') {
        throw error;
      }
      safeLog('warn', 'wzrd.provider.fallback_used', { error });
      provider = 'fallback';
      agentResponse = {
        assistantMessage: 'I drafted a safe starter workflow and a few setup choices.',
        questions: mode === 'plan' ? buildFallbackQuestions(mergedContext) : [],
        blueprint: buildFallbackBlueprint(prompt, settings, mergedContext),
      };
    }

    const blueprint: WorkflowBlueprint = {
      ...agentResponse.blueprint,
      provider,
      mode,
      assistantMessage: agentResponse.assistantMessage,
      questions: agentResponse.questions,
      detectedAssets: mergedContext.assets ?? [],
    };
    const errors = validateBlueprint(blueprint, enabledModelIds);
    blueprint.validationErrors = errors;

    if ((mode === 'materialize' || mode === 'repair') && errors.length > 0 && provider === 'codex') {
      try {
        const repaired = await callCodexAgent({
          mode: 'repair',
          prompt,
          context: mergedContext,
          settings,
          enabledModelIds: [...enabledModelIds],
          validationErrors: errors,
        });
        const repairedBlueprint: WorkflowBlueprint = {
          ...repaired.blueprint,
          provider,
          mode: 'repair',
          assistantMessage: repaired.assistantMessage,
          questions: [],
          detectedAssets: mergedContext.assets ?? [],
        };
        repairedBlueprint.validationErrors = validateBlueprint(repairedBlueprint, enabledModelIds);
        if (repairedBlueprint.validationErrors.length === 0) {
          await recordWzrdSession(supabaseAdmin, {
            user_id: user.id,
            project_id: projectId ?? null,
            mode,
            provider,
            prompt,
            messages: [{ role: 'user', content: prompt }, { role: 'assistant', content: repaired.assistantMessage }],
            questions: [],
            answers: answers ?? {},
            asset_refs: mergedContext.assets ?? [],
            blueprint: repairedBlueprint,
            validation_errors: [],
            status: 'materialized',
          });
          return new Response(JSON.stringify({ ...repaired, provider, blueprint: repairedBlueprint }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (repairError) {
        safeLog('warn', 'wzrd.repair.failed', { error: repairError });
      }
    }

    await recordWzrdSession(supabaseAdmin, {
      user_id: user.id,
      project_id: projectId ?? null,
      mode,
      provider,
      prompt,
      messages: [{ role: 'user', content: prompt }, { role: 'assistant', content: agentResponse.assistantMessage }],
      questions: agentResponse.questions,
      answers: answers ?? {},
      asset_refs: mergedContext.assets ?? [],
      blueprint,
      validation_errors: errors,
      status: mode === 'plan' ? 'questions_ready' : errors.length > 0 ? 'validation_failed' : 'materialized',
    });

    return new Response(
      JSON.stringify({
        provider,
        assistantMessage: agentResponse.assistantMessage,
        questions: agentResponse.questions,
        blueprint,
        validationErrors: errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    if (error instanceof WzrdProviderSetupError) {
      safeLog('warn', 'wzrd.setup.error', { error, details: error.details });
      return errorResponse(error.message, error.status, error.details);
    }
    safeLog('error', 'wzrd.generation.error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500);
  }
});
