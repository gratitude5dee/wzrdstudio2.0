import { ReactFlowProvider } from '@xyflow/react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { NodeDefinition, Port } from '@/types/computeFlow';
import { DEFAULT_IMAGE_EDIT_PARAMS } from '@/types/imageEdit';
import { ReactFlowImageEditNode } from './ReactFlowImageEditNode';
import { ReactFlowVideoNode } from './ReactFlowVideoNode';

function port(id: string, name: string, datatype: Port['datatype'], position: Port['position']): Port {
  return { id, name, datatype, position, cardinality: '1' };
}

function runtimeNode(id: string, kind: NodeDefinition['kind']): NodeDefinition {
  return {
    id,
    kind,
    version: '1.0.0',
    label: kind,
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    params: {},
    status: 'idle',
    progress: 0,
  };
}

const directNodeProps = {
  draggable: false,
  dragging: false,
  selectable: true,
  deletable: true,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  zIndex: 0,
};

describe('ReactFlow media node population stability', () => {
  beforeEach(() => {
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
    }

    useComputeFlowStore.setState({
      nodeDefinitions: [
        runtimeNode('image-edit-node', 'ImageEdit'),
        runtimeNode('video-node', 'Video'),
      ],
      edgeDefinitions: [],
    });
  });

  it('keeps ImageEdit preview DOM stable when unrelated populated nodes are added', () => {
    const data = {
      label: 'Image Edit',
      params: DEFAULT_IMAGE_EDIT_PARAMS,
      inputs: [port('prompt', 'prompt', 'text', 'left'), port('image', 'image', 'image', 'left')],
      outputs: [port('image-out', 'image', 'image', 'right')],
    };

    render(
      <ReactFlowProvider>
        <ReactFlowImageEditNode
          id="image-edit-node"
          data={data}
          selected={false}
          type="imageEdit"
          {...directNodeProps}
        />
      </ReactFlowProvider>
    );

    const preview = screen.getByTestId('studio-image-edit-preview-image-edit-node');

    act(() => {
      useComputeFlowStore.setState((state) => ({
        nodeDefinitions: [
          ...state.nodeDefinitions,
          runtimeNode('populated-image-edit-node', 'ImageEdit'),
          runtimeNode('populated-video-node', 'Video'),
        ],
      }));
    });

    expect(screen.getByTestId('studio-image-edit-preview-image-edit-node')).toBe(preview);
  });

  it('keeps Video preview DOM stable when unrelated populated nodes are added', () => {
    const data = {
      label: 'Video',
      params: {
        prompt: 'A cinematic Mars archive shot',
        aspectRatio: '16:9',
      },
      inputs: [port('prompt', 'prompt', 'text', 'left'), port('image', 'image', 'image', 'left')],
      outputs: [port('video-out', 'video', 'video', 'right')],
    };

    render(
      <ReactFlowProvider>
        <ReactFlowVideoNode
          id="video-node"
          data={data}
          selected={false}
          type="video"
          {...directNodeProps}
        />
      </ReactFlowProvider>
    );

    const preview = screen.getByTestId('studio-video-preview-video-node');

    act(() => {
      useComputeFlowStore.setState((state) => ({
        nodeDefinitions: [
          ...state.nodeDefinitions,
          runtimeNode('populated-image-edit-node', 'ImageEdit'),
          runtimeNode('populated-video-node', 'Video'),
        ],
      }));
    });

    expect(screen.getByTestId('studio-video-preview-video-node')).toBe(preview);
  });
});
