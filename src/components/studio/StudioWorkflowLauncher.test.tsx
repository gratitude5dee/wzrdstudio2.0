import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { NodeDefinition } from '@/types/computeFlow';

const mockNodeDefinitions: NodeDefinition[] = [
  {
    id: 'node-1',
    kind: 'Image',
    version: '1.0.0',
    label: 'Full Body Shot',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    status: 'idle',
    progress: 0,
    params: {},
  } as NodeDefinition,
];

vi.mock('@/store/computeFlowStore', () => ({
  useComputeFlowStore: (selector: (state: { nodeDefinitions: NodeDefinition[] }) => unknown) =>
    selector({ nodeDefinitions: mockNodeDefinitions }),
}));

vi.mock('./WorkflowGeneratorTab', () => ({
  WorkflowGeneratorTab: ({ selectedNodeLabel }: { selectedNodeLabel?: string | null }) => (
    <div data-testid="workflow-popup">{selectedNodeLabel || 'No selection'}</div>
  ),
}));

import { StudioWorkflowLauncher } from './StudioWorkflowLauncher';

describe('StudioWorkflowLauncher', () => {
  it('opens the bottom-right workflow popup with selected-node context', async () => {
    const user = userEvent.setup();

    render(
      <StudioWorkflowLauncher
        projectId="project-1"
        selectedNodeId="node-1"
        onWorkflowGenerated={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /open workflow generator/i }));

    expect(await screen.findByTestId('workflow-popup')).toHaveTextContent('Full Body Shot');
  });
});
