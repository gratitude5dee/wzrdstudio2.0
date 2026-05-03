import { getNodeImagePreviewUrl } from '@/lib/imageEdit';
import {
  HANDLE_BINDINGS,
  INPUT_FREE_KINDS,
  type HandleBinding,
  findBindingForHandle,
} from '@/lib/compute/handleBindings';
import type { CanonicalNodeKind } from '@/lib/compute/contract';
import { getActionInputBinding } from '@/lib/studio/mediaActionRegistry';
import type { DataType, EdgeDefinition, NodeDefinition, Port } from '@/types/computeFlow';

export type UIChipType = 'image' | 'video' | 'audio' | 'text' | '3d';

export interface UIChip {
  sourceNodeId: string;
  name: string;
  type: UIChipType;
  /** URL for media chips (image/video/audio). */
  url?: string;
  /** Truncated text preview for text chips. */
  preview?: string;
}

export interface ResolvedIncoming {
  /** Per-handle materialized values (string url or string text or array). */
  byHandle: Record<string, unknown>;
  /** UI chips, in edge order. */
  chips: UIChip[];
}

// ---------- helpers (pure) ----------

function getNodeTextValue(node?: Pick<NodeDefinition, 'preview' | 'params'> | null): string | undefined {
  if (!node) return undefined;

  const preview = node.preview as { data?: unknown } | undefined;
  if (typeof preview?.data === 'string' && preview.data.trim().length > 0) {
    return preview.data;
  }

  if (preview?.data && typeof preview.data === 'object') {
    const textData = preview.data as Record<string, unknown>;
    const previewText = textData.text ?? textData.prompt ?? textData.content;
    if (typeof previewText === 'string' && previewText.trim().length > 0) {
      return previewText;
    }
  }

  const params = node.params as Record<string, unknown> | undefined;
  const paramText = params?.prompt ?? params?.text ?? params?.content;
  if (typeof paramText === 'string' && paramText.trim().length > 0) {
    return paramText;
  }

  return undefined;
}

function getMediaUrlForType(
  node: NodeDefinition,
  type: 'image' | 'video' | 'audio' | '3d'
): string | undefined {
  if (type === 'image') {
    const url = getNodeImagePreviewUrl(node);
    return typeof url === 'string' && url.length > 0 ? url : undefined;
  }
  if (type === 'video') {
    const url = node.preview?.url;
    return typeof url === 'string' && url.length > 0 ? url : undefined;
  }
  if (type === '3d') {
    const preview = node.preview as { url?: unknown; data?: { modelUrl?: unknown; url?: unknown } } | undefined;
    const params = node.params as Record<string, unknown> | undefined;
    const candidate =
      (typeof preview?.url === 'string' && preview.url) ||
      (typeof preview?.data?.modelUrl === 'string' && preview.data.modelUrl) ||
      (typeof preview?.data?.url === 'string' && preview.data.url) ||
      (typeof params?.modelUrl === 'string' && (params.modelUrl as string)) ||
      undefined;
    return candidate || undefined;
  }
  // audio
  const preview = node.preview as { url?: unknown; data?: { audioUrl?: unknown } } | undefined;
  const params = node.params as Record<string, unknown> | undefined;
  const candidate =
    (typeof preview?.url === 'string' && preview.url) ||
    (typeof preview?.data?.audioUrl === 'string' && preview.data.audioUrl) ||
    (typeof params?.audioUrl === 'string' && (params.audioUrl as string)) ||
    undefined;
  return candidate || undefined;
}

function chipTypeFromDataType(dt: DataType): UIChipType | null {
  if (dt === 'image' || dt === 'video' || dt === 'audio' || dt === '3d') return dt;
  if (dt === 'text' || dt === 'string') return 'text';
  return null;
}

/** Resolve a single edge's source value into the wire format the binding expects. */
function resolveEdgeValue(
  sourceNode: NodeDefinition,
  edgeDataType: DataType,
  binding: HandleBinding | undefined
): { value: unknown; chipType: UIChipType | null } | null {
  // Prefer the source port's actual datatype if we can find it.
  // Caller passes `edgeDataType` already reconciled with the source port.
  const chipType = chipTypeFromDataType(edgeDataType);

  if (chipType === 'image' || chipType === 'video' || chipType === 'audio') {
    const url = getMediaUrlForType(sourceNode, chipType);
    if (!url) return null;
    return { value: url, chipType };
  }

  if (chipType === 'text') {
    const text = getNodeTextValue(sourceNode);
    if (!text) return null;
    return { value: text, chipType };
  }

  // 'any' / json / tensor / number / boolean — pass any non-null preview through.
  // For the UI we won't render a chip for these; for byHandle we expose preview.data or url.
  if (binding?.mode === 'append-unique' || binding?.mode === 'overwrite') {
    const preview = sourceNode.preview as { url?: unknown; data?: unknown } | undefined;
    if (typeof preview?.url === 'string' && preview.url.length > 0) {
      return { value: preview.url, chipType: null };
    }
    if (preview?.data !== undefined && preview.data !== null) {
      return { value: preview.data, chipType: null };
    }
  }
  return null;
}

function appendUnique(arr: unknown[] | undefined, value: unknown): unknown[] {
  const next = Array.isArray(arr) ? [...arr] : [];
  if (!next.includes(value)) next.push(value);
  return next;
}

// ---------- public API ----------

/**
 * Compute the param delta to merge into the target node when an edge is created.
 * Returns an empty object when nothing should change (e.g. source has no preview yet).
 */
export function applyOnConnect(args: {
  sourceNode: NodeDefinition;
  targetNode: NodeDefinition;
  sourcePort: Port;
  targetPort: Port;
  edgeDataType: DataType;
}): Record<string, unknown> {
  const { sourceNode, targetNode, targetPort, edgeDataType } = args;

  const binding =
    getActionInputBinding(targetNode.actionId ?? String(targetNode.params?.actionId ?? ''), targetPort.name) ??
    findBindingForHandle(targetNode.kind as CanonicalNodeKind, targetPort.name);
  if (!binding) return {};

  const resolved = resolveEdgeValue(sourceNode, edgeDataType, binding);
  if (!resolved) return {};

  const existing = (targetNode.params as Record<string, unknown>)?.[binding.paramKey];

  if (binding.mode === 'overwrite') {
    return { [binding.paramKey]: resolved.value };
  }
  if (binding.mode === 'append-unique') {
    return { [binding.paramKey]: appendUnique(existing as unknown[] | undefined, resolved.value) };
  }
  if (binding.mode === 'concat-prompt') {
    const existingText = typeof existing === 'string' ? existing : '';
    const next = existingText.length > 0 ? `${existingText}\n${resolved.value}` : String(resolved.value);
    return { [binding.paramKey]: next };
  }
  return {};
}

/**
 * Derive everything `StudioCanvas` needs to feed into a node's `data` prop:
 *   - `byHandle`: per-handle materialized value (used by node UIs that key off handle name)
 *   - `chips`: ordered list of upstream sources for chip rendering
 *
 * Pure: no React, no store access. `getNode` is the caller's lookup function.
 */
export function resolveIncomingForUI(args: {
  targetNode: NodeDefinition;
  edges: EdgeDefinition[]; // already filtered to those targeting this node
  getNode: (id: string) => NodeDefinition | undefined;
}): ResolvedIncoming {
  const { targetNode, edges, getNode } = args;
  const byHandle: Record<string, unknown> = {};
  const chips: UIChip[] = [];

  for (const edge of edges) {
    const sourceNode = getNode(edge.source.nodeId);
    if (!sourceNode) continue;

    const sourcePort = sourceNode.outputs.find((p) => p.id === edge.source.portId);
    const targetPort = targetNode.inputs.find((p) => p.id === edge.target.portId);

    const dataType = sourcePort?.datatype ?? edge.dataType;
    const binding = targetPort
      ? getActionInputBinding(targetNode.actionId ?? String(targetNode.params?.actionId ?? ''), targetPort.name) ??
        findBindingForHandle(targetNode.kind as CanonicalNodeKind, targetPort.name)
      : undefined;

    const resolved = resolveEdgeValue(sourceNode, dataType, binding);
    if (!resolved) continue;

    // chip
    if (resolved.chipType) {
      const chip: UIChip = {
        sourceNodeId: sourceNode.id,
        name: sourceNode.label || resolved.chipType.charAt(0).toUpperCase() + resolved.chipType.slice(1),
        type: resolved.chipType,
      };
      if (resolved.chipType === 'text') {
        chip.preview = String(resolved.value);
      } else {
        chip.url = String(resolved.value);
      }
      chips.push(chip);
    }

    // byHandle (only when we have a binding for this handle)
    if (binding) {
      if (binding.mode === 'overwrite') {
        byHandle[binding.handle] = resolved.value;
      } else if (binding.mode === 'append-unique') {
        const prev = byHandle[binding.handle];
        byHandle[binding.handle] = appendUnique(Array.isArray(prev) ? prev : undefined, resolved.value);
      } else if (binding.mode === 'concat-prompt') {
        const prev = typeof byHandle[binding.handle] === 'string' ? (byHandle[binding.handle] as string) : '';
        byHandle[binding.handle] = prev.length > 0 ? `${prev}\n${resolved.value}` : String(resolved.value);
      }
    }
  }

  return { byHandle, chips };
}

// re-export so consumers can type against bindings without importing two paths
export { HANDLE_BINDINGS, INPUT_FREE_KINDS };
