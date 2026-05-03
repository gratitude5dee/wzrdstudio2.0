import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { NodeDefinition } from '@/types/computeFlow';
import { NodeRuntimeStatus } from './NodeRuntimeStatus';

function runtimeNode(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id: 'node-1',
    kind: 'Video',
    version: '1.0.0',
    label: 'Video',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    params: {},
    status: 'idle',
    progress: 0,
    ...overrides,
  };
}

describe('NodeRuntimeStatus', () => {
  beforeEach(() => {
    useComputeFlowStore.setState({
      nodeDefinitions: [runtimeNode()],
      edgeDefinitions: [],
    });
  });

  it('rerenders from the narrow runtime selector without rerendering the parent card', async () => {
    let parentRenders = 0;

    function ParentCard() {
      parentRenders += 1;
      return <NodeRuntimeStatus nodeId="node-1" />;
    }

    render(<ParentCard />);
    expect(parentRenders).toBe(1);
    expect(screen.queryByText('Running')).not.toBeInTheDocument();

    act(() => {
      useComputeFlowStore.getState().updateNodeSilent('node-1', {
        status: 'running',
        progress: 42,
      });
    });

    await screen.findByText('Running');
    await waitFor(() => expect(parentRenders).toBe(1));
  });
});
