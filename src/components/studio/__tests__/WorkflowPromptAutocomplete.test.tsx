import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { NodeDefinition } from '@/types/computeFlow';

let mockNodeDefinitions: NodeDefinition[] = [];

vi.mock('@/store/computeFlowStore', () => ({
  useComputeFlowStore: (selector: (state: { nodeDefinitions: NodeDefinition[] }) => unknown) =>
    selector({ nodeDefinitions: mockNodeDefinitions }),
}));

import { WorkflowPromptAutocomplete } from '../WorkflowPromptAutocomplete';

function createNode(kind: string): NodeDefinition {
  return {
    id: `node-${kind}`,
    kind: kind as NodeDefinition['kind'],
    version: '1.0.0',
    label: kind,
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    status: 'idle',
    progress: 0,
    params: {},
  } as NodeDefinition;
}

describe('WorkflowPromptAutocomplete', () => {
  it('renders suggestions when visible with a query', () => {
    mockNodeDefinitions = [];
    const onSelect = vi.fn();

    render(
      <WorkflowPromptAutocomplete
        query="video"
        visible={true}
        onSelect={onSelect}
      />
    );

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Suggestions')).toBeInTheDocument();
  });

  it('does not render when not visible', () => {
    mockNodeDefinitions = [];
    const onSelect = vi.fn();

    render(
      <WorkflowPromptAutocomplete
        query="video"
        visible={false}
        onSelect={onSelect}
      />
    );

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filters suggestions based on query', () => {
    mockNodeDefinitions = [];
    const onSelect = vi.fn();

    render(
      <WorkflowPromptAutocomplete
        query="image"
        visible={true}
        onSelect={onSelect}
      />
    );

    // Should show image-related suggestions
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
  });

  it('calls onSelect when a suggestion is clicked', async () => {
    mockNodeDefinitions = [];
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <WorkflowPromptAutocomplete
        query="video"
        visible={true}
        onSelect={onSelect}
      />
    );

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    await user.click(options[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows context-aware suggestions when canvas has Text nodes but no Image', () => {
    mockNodeDefinitions = [createNode('Text')];
    const onSelect = vi.fn();

    render(
      <WorkflowPromptAutocomplete
        query=""
        visible={true}
        onSelect={onSelect}
      />
    );

    // Should show "Visualize text as images" contextual suggestion
    expect(screen.getByText('Visualize text as images')).toBeInTheDocument();
  });

  it('shows "start fresh" suggestion on empty canvas', () => {
    mockNodeDefinitions = [];
    const onSelect = vi.fn();

    render(
      <WorkflowPromptAutocomplete
        query=""
        visible={true}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText('Start with a content workflow')).toBeInTheDocument();
  });
});
