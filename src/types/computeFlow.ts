import {
  CANONICAL_NODE_KINDS,
  EDGE_TYPE_COMPATIBILITY,
  type CanonicalNodeKind,
  type CanonicalNodeStatus,
  isCompatibleDataType,
} from '@/lib/compute/contract';
import type {
  MediaActionBatchPolicy,
  MediaActionControl,
  MediaActionDataType,
  MediaActionExecutor,
} from '@/lib/studio/mediaActionRegistry';

// Compute Flow Type Definitions - Based on Functional Requirements

export type DataType = 'image' | 'text' | 'video' | 'tensor' | '3d' | 'json' | 'audio' | 'string' | 'number' | 'boolean' | 'any';
export type Cardinality = '1' | 'n'; // 1 = single connection, n = multiple
export type NodeStatus = CanonicalNodeStatus;
export type EdgeStatus = 'idle' | 'running' | 'succeeded' | 'error';
export type PortPosition = 'top' | 'right' | 'bottom' | 'left';

// Color mapping for data types - Premium vivid palette
export const HANDLE_COLORS: Record<DataType, string> = {
  text: '#3B82F6',       // Blue - text
  image: '#f97316',      // Orange - image
  video: '#8B5CF6',      // Violet - video
  audio: '#EC4899',      // Pink - audio
  tensor: '#F59E0B',     // Amber - 3d/tensor
  '3d': '#06B6D4',       // Cyan - 3d assets
  json: '#6366F1',       // Indigo - json
  string: '#3B82F6',     // Blue - same as text
  number: '#F59E0B',     // Amber - same as tensor
  boolean: '#6B7280',    // Gray - same as any
  any: '#6B7280',        // Gray - any
};

// Glow variants for handles (20% opacity)
export const HANDLE_GLOW_COLORS: Record<DataType, string> = {
  text: 'rgba(59, 130, 246, 0.4)',
  image: 'rgba(249, 115, 22, 0.4)',
  video: 'rgba(139, 92, 246, 0.4)',
  audio: 'rgba(236, 72, 153, 0.4)',
  tensor: 'rgba(245, 158, 11, 0.4)',
  '3d': 'rgba(6, 182, 212, 0.4)',
  json: 'rgba(99, 102, 241, 0.4)',
  string: 'rgba(59, 130, 246, 0.4)',
  number: 'rgba(245, 158, 11, 0.4)',
  boolean: 'rgba(107, 114, 128, 0.3)',
  any: 'rgba(107, 114, 128, 0.3)',
};

// Type compatibility matrix
export const TYPE_COMPATIBILITY = EDGE_TYPE_COMPATIBILITY as Record<DataType, DataType[]>;

export function isTypeCompatible(sourceType: DataType, targetType: DataType): boolean {
  return isCompatibleDataType(sourceType, targetType);
}

export interface Port {
  id: string;
  name: string;
  datatype: DataType;
  cardinality: Cardinality;
  optional?: boolean;
  position: 'top' | 'right' | 'bottom' | 'left';
  paramKey?: string;
}

export interface NodeDefinition {
  id: string;
  kind: CanonicalNodeKind;
  actionId?: string;
  mediaType?: MediaActionDataType;
  workflowType?: string;
  executor?: MediaActionExecutor;
  controls?: MediaActionControl[];
  batch?: {
    policy: MediaActionBatchPolicy;
    items?: unknown[];
    status?: 'idle' | 'running' | 'partial' | 'succeeded' | 'failed';
  };
  variants?: ArtifactRef[];
  assetRefs?: ArtifactRef[];
  version: string;
  label: string;
  position: { x: number; y: number };
  size?: { w: number; h: number };
  inputs: Port[];
  outputs: Port[];
  params: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  preview?: ArtifactRef;
  status: NodeStatus;
  progress?: number; // 0-100
  error?: string;
  isDirty?: boolean;
}

export interface EdgeDefinition {
  id: string;
  source: { nodeId: string; portId: string; handle?: string };
  target: { nodeId: string; portId: string; handle?: string };
  dataType: DataType;
  status: EdgeStatus;
  metadata?: Record<string, unknown> & {
    label?: string;
    validationError?: string;
  };
}

export interface ArtifactRef {
  id: string;
  type: 'image' | 'video' | 'text' | 'json' | 'audio' | '3d';
  url?: string;
  data?: any;
  metadata?: Record<string, unknown>;
}

export interface RunEvent {
  runId: string;
  nodeId: string;
  status: NodeStatus;
  progress?: number;
  logs?: Array<{ timestamp: string; message: string; level: 'info' | 'warn' | 'error' }>;
  artifacts?: ArtifactRef[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface ComputeFlowGraph {
  schemaVersion: string;
  metadata: {
    title: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  };
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  viewState: {
    zoom: number;
    center: [number, number];
  };
}

// (Connection validation lives in src/utils/edgeValidation.ts; the legacy
// ConnectionValidator class was removed in PR-7 along with its consumers.)


// Node Type Definitions with Port Configurations
export const NODE_TYPE_CONFIGS: Record<string, { inputs: Omit<Port, 'id'>[]; outputs: Omit<Port, 'id'>[] }> = {
  Prompt: {
    inputs: [
      { name: 'context', datatype: 'any', cardinality: 'n', optional: true, position: 'left' }
    ],
    outputs: [
      { name: 'text', datatype: 'text', cardinality: 'n', position: 'right' }
    ]
  },
  Image: {
    inputs: [
      { name: 'prompt', datatype: 'text', cardinality: '1', optional: true, position: 'left' },
      { name: 'reference', datatype: 'image', cardinality: '1', optional: true, position: 'top' }
    ],
    outputs: [
      { name: 'image', datatype: 'image', cardinality: 'n', position: 'right' },
      { name: 'metadata', datatype: 'json', cardinality: 'n', position: 'bottom' }
    ]
  },
  ImageEdit: {
    inputs: [
      { name: 'prompt', datatype: 'text', cardinality: 'n', optional: true, position: 'left' },
      { name: 'image', datatype: 'image', cardinality: 'n', optional: true, position: 'left' }
    ],
    outputs: [
      { name: 'image', datatype: 'image', cardinality: 'n', position: 'right' },
      { name: 'layers', datatype: 'json', cardinality: 'n', position: 'bottom' }
    ]
  },
  Text: {
    inputs: [
      { name: 'input', datatype: 'text', cardinality: '1', optional: true, position: 'left' },
      { name: 'context', datatype: 'any', cardinality: 'n', optional: true, position: 'top' }
    ],
    outputs: [
      { name: 'text', datatype: 'text', cardinality: 'n', position: 'right' }
    ]
  },
  Video: {
    inputs: [
      { name: 'prompt', datatype: 'text', cardinality: '1', optional: true, position: 'left' },
      { name: 'image', datatype: 'image', cardinality: '1', optional: true, position: 'top' }
    ],
    outputs: [
      { name: 'video', datatype: 'video', cardinality: 'n', position: 'right' }
    ]
  },
  Audio: {
    inputs: [
      { name: 'prompt', datatype: 'text', cardinality: '1', optional: true, position: 'left' }
    ],
    outputs: [
      { name: 'audio', datatype: 'audio', cardinality: 'n', position: 'right' }
    ]
  },
  Upload: {
    inputs: [],
    outputs: [
      { name: 'asset', datatype: 'any', cardinality: 'n', position: 'right' }
    ]
  },
  Transform: {
    inputs: [
      { name: 'input', datatype: 'any', cardinality: 'n', position: 'left' }
    ],
    outputs: [
      { name: 'output', datatype: 'any', cardinality: 'n', position: 'right' }
    ]
  },
  Combine: {
    inputs: [
      { name: 'input', datatype: 'any', cardinality: 'n', position: 'left' }
    ],
    outputs: [
      { name: 'output', datatype: 'any', cardinality: 'n', position: 'right' }
    ]
  },
  Model: {
    inputs: [
      { name: 'prompt', datatype: 'text', cardinality: '1', position: 'left' },
      { name: 'input', datatype: 'any', cardinality: '1', optional: true, position: 'top' }
    ],
    outputs: [
      { name: 'output', datatype: 'any', cardinality: 'n', position: 'right' }
    ]
  },
  Output: {
    inputs: [
      { name: 'input', datatype: 'any', cardinality: 'n', position: 'left' }
    ],
    outputs: []
  },
  Gateway: {
    inputs: [
      { name: 'input', datatype: 'any', cardinality: 'n', position: 'left' }
    ],
    outputs: [
      { name: 'output', datatype: 'any', cardinality: 'n', position: 'right' }
    ]
  },
  comment: {
    inputs: [],
    outputs: []
  }
};

// (DirtyStateTracker was removed in PR-7; per-node dirty propagation now
// happens inside the compute store and the upcoming engine module.)
