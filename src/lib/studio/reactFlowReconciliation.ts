import type { Edge, Node } from '@xyflow/react';
import type { NodeDefinition } from '@/types/computeFlow';

const SIGNATURE_METADATA_OMITS = new Set([
  'clientWriteId',
  'client_write_id',
  'runId',
  'run_id',
  'startedAt',
  'started_at',
  'finishedAt',
  'finished_at',
  'queuedAt',
  'queued_at',
  'completedAt',
  'completed_at',
  'lastSavedAt',
  'last_saved_at',
  'lastModifiedAt',
  'last_modified_at',
  'status',
  'progress',
  'error',
  'isDirty',
  'is_dirty',
]);

interface ReactFlowNodeDataSignatureInput {
  node: NodeDefinition;
  chips?: unknown;
  byHandle?: unknown;
  incomingPrompt?: unknown;
  inputValue?: unknown;
  inputType?: unknown;
  includeRuntime?: boolean;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function getDataSignature(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  return (data as Record<string, unknown>).__signature;
}

function sanitizeSignatureMetadata(metadata: NodeDefinition['metadata']): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !SIGNATURE_METADATA_OMITS.has(key))
  );
}

function sanitizeSignatureBatch(batch: NodeDefinition['batch']): NodeDefinition['batch'] | undefined {
  if (!batch) {
    return undefined;
  }

  return {
    policy: batch.policy,
    items: batch.items,
  };
}

export function buildReactFlowNodeDataSignature({
  node,
  chips,
  byHandle,
  incomingPrompt,
  inputValue,
  inputType,
  includeRuntime = false,
}: ReactFlowNodeDataSignatureInput): string {
  return stableStringify({
    node: {
      id: node.id,
      kind: node.kind,
      actionId: node.actionId,
      mediaType: node.mediaType,
      workflowType: node.workflowType,
      executor: node.executor,
      controls: node.controls,
      batch: sanitizeSignatureBatch(node.batch),
      variants: node.variants,
      assetRefs: node.assetRefs,
      version: node.version,
      label: node.label,
      size: node.size,
      inputs: node.inputs,
      outputs: node.outputs,
      params: node.params,
      metadata: sanitizeSignatureMetadata(node.metadata),
      preview: node.preview,
      ...(includeRuntime
        ? {
            status: node.status,
            progress: node.progress,
            error: node.error,
            isDirty: node.isDirty,
          }
        : {}),
    },
    chips,
    byHandle,
    incomingPrompt,
    inputValue,
    inputType,
  });
}

export function reconcileReactFlowNodes<TNode extends Node>(
  previousNodes: TNode[],
  nextNodes: TNode[]
): TNode[] {
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));
  let changed = previousNodes.length !== nextNodes.length;

  const reconciled = nextNodes.map((next, index) => {
    const prev = previousById.get(next.id);
    if (!prev) {
      changed = true;
      return next;
    }

    if (previousNodes[index]?.id !== next.id) {
      changed = true;
    }

    const sameShell =
      prev.type === next.type &&
      prev.selected === next.selected &&
      prev.position.x === next.position.x &&
      prev.position.y === next.position.y;

    if (sameShell && getDataSignature(prev.data) === getDataSignature(next.data)) {
      return prev;
    }

    changed = true;
    if (sameShell) {
      return { ...prev, data: next.data };
    }

    return next;
  });

  return changed ? reconciled : previousNodes;
}

export function reconcileReactFlowEdges<TEdge extends Edge>(
  previousEdges: TEdge[],
  nextEdges: TEdge[]
): TEdge[] {
  const previousById = new Map(previousEdges.map((edge) => [edge.id, edge]));
  let changed = previousEdges.length !== nextEdges.length;

  const reconciled = nextEdges.map((next, index) => {
    const prev = previousById.get(next.id);
    if (!prev) {
      changed = true;
      return next;
    }

    if (previousEdges[index]?.id !== next.id) {
      changed = true;
    }

    const sameShell =
      prev.source === next.source &&
      prev.target === next.target &&
      prev.sourceHandle === next.sourceHandle &&
      prev.targetHandle === next.targetHandle &&
      prev.type === next.type;

    if (sameShell && getDataSignature(prev.data) === getDataSignature(next.data)) {
      return prev;
    }

    changed = true;
    return next;
  });

  return changed ? reconciled : previousEdges;
}
