import type { NodeDefinition } from '@/types/computeFlow';
import type { CanonicalNodeKind } from '@/lib/compute/contract';

export type WorkflowBlueprintLayout = 'horizontal' | 'vertical' | 'tree';

export interface WorkflowBlueprintNodeIntent {
  kind: CanonicalNodeKind;
  label: string;
  model?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
}

export function isWorkflowBlueprint(value: unknown): value is WorkflowBlueprint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<WorkflowBlueprint>;
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}
