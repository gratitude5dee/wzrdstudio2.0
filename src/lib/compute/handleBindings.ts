import type { CanonicalNodeKind } from '@/lib/compute/contract';
import type { DataType } from '@/types/computeFlow';

export type BindingMode = 'overwrite' | 'append-unique' | 'concat-prompt';

export interface HandleBinding {
  /** Input port `name` (matches Port.name in NODE_TYPE_CONFIGS). */
  handle: string;
  /** Param key on NodeDefinition.params that this handle writes into. */
  paramKey: string;
  /** Merge strategy when the upstream value resolves. */
  mode: BindingMode;
  /** Datatype hint — informational only; edge validation is the source of truth. */
  datatype?: DataType;
}

/**
 * Single source of truth for handle → param mapping.
 *
 * Both the UI (chip rendering, derived `inputValue`) and the on-connect
 * param-write path consume this table so the user always sees the value
 * the server will actually receive.
 */
export const HANDLE_BINDINGS: Record<CanonicalNodeKind, HandleBinding[]> = {
  Image: [
    { handle: 'prompt', paramKey: 'prompt', mode: 'overwrite', datatype: 'text' },
    { handle: 'reference', paramKey: 'referenceImageUrls', mode: 'append-unique', datatype: 'image' },
    { handle: 'mask', paramKey: 'maskImageUrl', mode: 'overwrite', datatype: 'image' },
  ],
  ImageEdit: [
    { handle: 'image', paramKey: 'sourceImageUrl', mode: 'overwrite', datatype: 'image' },
    { handle: 'prompt', paramKey: 'prompt', mode: 'overwrite', datatype: 'text' },
    { handle: 'mask', paramKey: 'maskImageUrl', mode: 'overwrite', datatype: 'image' },
  ],
  Video: [
    { handle: 'image', paramKey: 'firstFrameImageUrl', mode: 'overwrite', datatype: 'image' },
    { handle: 'prompt', paramKey: 'prompt', mode: 'overwrite', datatype: 'text' },
  ],
  Text: [
    { handle: 'input', paramKey: 'input', mode: 'overwrite', datatype: 'text' },
    { handle: 'context', paramKey: 'contextRefs', mode: 'append-unique', datatype: 'any' },
  ],
  Audio: [
    { handle: 'prompt', paramKey: 'prompt', mode: 'overwrite', datatype: 'text' },
    { handle: 'audio', paramKey: 'audioUrl', mode: 'overwrite', datatype: 'audio' },
  ],
  Model: [
    { handle: 'prompt', paramKey: 'prompt', mode: 'overwrite', datatype: 'text' },
    { handle: 'input', paramKey: 'input', mode: 'overwrite', datatype: 'any' },
  ],
  Transform: [
    { handle: 'input', paramKey: 'input', mode: 'append-unique', datatype: 'any' },
  ],
  Output: [
    { handle: 'input', paramKey: 'input', mode: 'append-unique', datatype: 'any' },
  ],
  Combine: [
    { handle: 'input', paramKey: 'input', mode: 'append-unique', datatype: 'any' },
  ],
  Gateway: [
    { handle: 'input', paramKey: 'input', mode: 'overwrite', datatype: 'any' },
    { handle: 'condition', paramKey: 'condition', mode: 'overwrite', datatype: 'text' },
  ],
  // Kinds with no input ports — explicitly empty to make CI fail-loud
  // when a new kind is added without a binding decision.
  Prompt: [],
  Upload: [],
  comment: [],
};

/** Kinds that have zero input handles by design. */
export const INPUT_FREE_KINDS = new Set<CanonicalNodeKind>(['Prompt', 'Upload', 'comment']);

export function getBindingsForKind(kind: CanonicalNodeKind): HandleBinding[] {
  return HANDLE_BINDINGS[kind] ?? [];
}

export function findBindingForHandle(
  kind: CanonicalNodeKind,
  handleName: string
): HandleBinding | undefined {
  return getBindingsForKind(kind).find((b) => b.handle === handleName);
}
