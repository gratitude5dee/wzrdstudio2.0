import type { Edge, Node } from '@xyflow/react';

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
