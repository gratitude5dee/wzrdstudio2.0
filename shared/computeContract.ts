export const CANONICAL_NODE_KINDS = [
  'Text',
  'Prompt',
  'Image',
  'ImageEdit',
  'Video',
  'Audio',
  'Upload',
  'Transform',
  'Combine',
  'Model',
  'Gateway',
  'Output',
  'comment',
] as const;

export type CanonicalNodeKind = (typeof CANONICAL_NODE_KINDS)[number];

export const CANONICAL_NODE_STATUSES = [
  'idle',
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'canceled',
  'dirty',
] as const;

export type CanonicalNodeStatus = (typeof CANONICAL_NODE_STATUSES)[number];

export const CANONICAL_RUN_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'partial',
  'canceled',
] as const;

export type CanonicalRunStatus = (typeof CANONICAL_RUN_STATUSES)[number];

export const CANONICAL_DATA_TYPES = [
  'image',
  'text',
  'video',
  'tensor',
  'json',
  'audio',
  'string',
  'number',
  'boolean',
  'any',
] as const;

export type CanonicalDataType = (typeof CANONICAL_DATA_TYPES)[number];

export const EXECUTABLE_GENERATOR_NODE_KINDS = [
  'Text',
  'Prompt',
  'Image',
  'Video',
  'Audio',
] as const;

export const PASS_THROUGH_NODE_KINDS = [
  'Upload',
  'Transform',
  'Combine',
  'Output',
  'Model',
  'Gateway',
  'ImageEdit',
] as const;

export const EXECUTION_EXCLUDED_NODE_KINDS = ['comment'] as const;

export type GeneratorNodeKind = (typeof EXECUTABLE_GENERATOR_NODE_KINDS)[number];
export type PassThroughNodeKind = (typeof PASS_THROUGH_NODE_KINDS)[number];
export type ExecutionExcludedNodeKind = (typeof EXECUTION_EXCLUDED_NODE_KINDS)[number];
export type NodeExecutionDisposition = 'generator' | 'passthrough' | 'excluded';

const LEGACY_KIND_ALIASES: Record<string, CanonicalNodeKind> = {
  image: 'Image',
  imageedit: 'ImageEdit',
  image_edit: 'ImageEdit',
  'image-edit': 'ImageEdit',
  prompt: 'Prompt',
  model: 'Model',
  transform: 'Transform',
  output: 'Output',
  gateway: 'Gateway',
  text: 'Text',
  video: 'Video',
  audio: 'Audio',
  upload: 'Upload',
  combine: 'Combine',
  comment: 'comment',
  text_to_text: 'Text',
  text_to_image: 'Image',
  image_to_video: 'Video',
  text_to_video: 'Video',
  audio_generate: 'Audio',
  comment_node: 'comment',
};

const NODE_STATUS_ALIASES: Record<string, CanonicalNodeStatus> = {
  completed: 'succeeded',
  processing: 'running',
  error: 'failed',
  cancelled: 'canceled',
  pending: 'queued',
};

const RUN_STATUS_ALIASES: Record<string, CanonicalRunStatus> = {
  completed: 'succeeded',
  processing: 'running',
  cancelled: 'canceled',
};

export const EDGE_TYPE_COMPATIBILITY: Record<string, string[]> = {
  image: ['image', 'any'],
  video: ['video', 'any'],
  text: ['text', 'string', 'any', 'image', 'video', 'audio', 'json', 'tensor'],
  string: ['text', 'string', 'any'],
  number: ['number', 'any'],
  boolean: ['boolean', 'any'],
  audio: ['audio', 'any'],
  json: ['json', 'any'],
  tensor: ['tensor', 'any'],
  any: ['any', 'image', 'text', 'video', 'audio', 'json', 'tensor', 'string', 'number', 'boolean'],
};

export function normalizeNodeKind(value: string | null | undefined): CanonicalNodeKind | null {
  if (!value) {
    return null;
  }

  if ((CANONICAL_NODE_KINDS as readonly string[]).includes(value)) {
    return value as CanonicalNodeKind;
  }

  return LEGACY_KIND_ALIASES[value.toLowerCase()] ?? null;
}

export function normalizeNodeStatus(value: string | null | undefined): CanonicalNodeStatus {
  if (!value) {
    return 'idle';
  }

  if ((CANONICAL_NODE_STATUSES as readonly string[]).includes(value)) {
    return value as CanonicalNodeStatus;
  }

  return NODE_STATUS_ALIASES[value.toLowerCase()] ?? 'idle';
}

export function normalizeRunStatus(value: string | null | undefined): CanonicalRunStatus {
  if (!value) {
    return 'pending';
  }

  if ((CANONICAL_RUN_STATUSES as readonly string[]).includes(value)) {
    return value as CanonicalRunStatus;
  }

  return RUN_STATUS_ALIASES[value.toLowerCase()] ?? 'pending';
}

export function normalizeDataType(value: string | null | undefined): CanonicalDataType {
  const normalized = value?.toLowerCase() ?? 'any';
  if ((CANONICAL_DATA_TYPES as readonly string[]).includes(normalized)) {
    return normalized as CanonicalDataType;
  }
  return 'any';
}

export function isCompatibleDataType(sourceType: string, targetType: string): boolean {
  const normalizedSource = normalizeDataType(sourceType);
  const normalizedTarget = normalizeDataType(targetType);

  if (normalizedSource === normalizedTarget) {
    return true;
  }

  const compatible = EDGE_TYPE_COMPATIBILITY[normalizedSource] ?? [];
  return compatible.includes(normalizedTarget);
}

export function isExecutionExcludedKind(kind: string | null | undefined): boolean {
  return (EXECUTION_EXCLUDED_NODE_KINDS as readonly string[]).includes(normalizeNodeKind(kind) ?? '');
}

export function isGeneratorKind(kind: string | null | undefined): boolean {
  const normalized = normalizeNodeKind(kind);
  return (EXECUTABLE_GENERATOR_NODE_KINDS as readonly string[]).includes(normalized ?? '');
}

export function isPassThroughKind(kind: string | null | undefined): boolean {
  return (PASS_THROUGH_NODE_KINDS as readonly string[]).includes(normalizeNodeKind(kind) ?? '');
}

export function requiresMaterializedAsset(kind: string | null | undefined): boolean {
  return normalizeNodeKind(kind) === 'ImageEdit';
}

export function getNodeExecutionDisposition(
  kind: string | null | undefined
): NodeExecutionDisposition {
  if (isExecutionExcludedKind(kind)) {
    return 'excluded';
  }
  if (isGeneratorKind(kind)) {
    return 'generator';
  }
  return 'passthrough';
}

export function getNodeExecutionWarning(kind: string | null | undefined): string | null {
  const normalized = normalizeNodeKind(kind);
  if (normalized === 'Model' || normalized === 'Gateway') {
    return `${normalized} executes as a validated pass-through/config node in v1.`;
  }
  return null;
}

export function getNodePreflightError(
  node:
    | { kind?: string | null; params?: Record<string, unknown> | null }
    | null
    | undefined
): string | null {
  if (!node || !requiresMaterializedAsset(node.kind)) {
    return null;
  }

  const previewAssetUrl =
    typeof node.params?.previewAssetUrl === 'string' ? node.params.previewAssetUrl : '';
  const outputAssetUrl =
    typeof node.params?.outputAssetUrl === 'string' ? node.params.outputAssetUrl : '';

  if (previewAssetUrl || outputAssetUrl) {
    return null;
  }

  return 'ImageEdit nodes require a materialized preview or output asset before execution.';
}
