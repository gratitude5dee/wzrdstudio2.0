import type { ArtifactRef, NodeDefinition } from '@/types/computeFlow';
import type { CanonicalNodeKind } from '@/lib/compute/contract';

export type WorkflowBlueprintLayout = 'horizontal' | 'vertical' | 'tree';
export type WzrdQuestionControlType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'segmented'
  | 'slider'
  | 'checkbox'
  | 'audio-clip'
  | 'image-role'
  | 'video-trim';

export interface WzrdAssetRef {
  id: string;
  type: ArtifactRef['type'];
  url?: string;
  name?: string;
  durationMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  role?: string;
  metadata?: Record<string, unknown>;
}

export interface WzrdGeneratedQuestion {
  id: string;
  label: string;
  controlType: WzrdQuestionControlType;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: unknown;
  assetRef?: WzrdAssetRef;
  required?: boolean;
}

export interface WorkflowBlueprintNodeIntent {
  kind: CanonicalNodeKind;
  label: string;
  actionId?: string;
  model?: string;
  modelId?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  assetRefs?: WzrdAssetRef[];
  controls?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  executionPolicy?: 'manual' | 'auto' | 'deferred';
}

export interface WorkflowBlueprintEdgeIntent {
  from: number;
  to: number;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowBlueprint {
  nodes: WorkflowBlueprintNodeIntent[];
  edges: WorkflowBlueprintEdgeIntent[];
  layout?: WorkflowBlueprintLayout;
  assistantMessage?: string;
  questions?: WzrdGeneratedQuestion[];
  detectedAssets?: WzrdAssetRef[];
  provider?: 'codex' | 'groq' | 'fallback';
  mode?: 'plan' | 'materialize' | 'repair';
  validationErrors?: string[];
}

export interface WorkflowGenerationContextNode {
  id: string;
  kind: NodeDefinition['kind'];
  label: string;
  model?: string;
  hasPreview: boolean;
}

export interface WorkflowGenerationContextEdge {
  sourceKind: NodeDefinition['kind'];
  targetKind: NodeDefinition['kind'];
  dataType: string;
}

export interface WorkflowGenerationContext {
  projectTitle?: string;
  selectedNode?: {
    id: string;
    kind: NodeDefinition['kind'];
    label: string;
    model?: string;
    prompt?: string;
  } | null;
  nodes: WorkflowGenerationContextNode[];
  edges: WorkflowGenerationContextEdge[];
  assets?: WzrdAssetRef[];
  answers?: Record<string, unknown>;
}

export function isWorkflowBlueprint(value: unknown): value is WorkflowBlueprint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<WorkflowBlueprint>;
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}
