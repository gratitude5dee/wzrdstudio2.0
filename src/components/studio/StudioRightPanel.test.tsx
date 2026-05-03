import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EdgeDefinition, NodeDefinition } from '@/types/computeFlow';

let mockNodeDefinitions: NodeDefinition[] = [];
let mockEdgeDefinitions: EdgeDefinition[] = [];

const updateNode = vi.fn();
const removeNode = vi.fn();
const scheduleSave = vi.fn();
const generateNode = vi.fn();
const updateNodeModelSelection = vi.fn();

vi.mock('@/hooks/useCatalogModels', () => ({
  useCatalogModels: () => ({
    models: [
      {
        id: 'fal-ai/flux/schnell',
        name: 'FLUX Schnell',
        description: 'Legacy image model',
        category: 'image-generation',
        media_type: 'image',
        workflow_type: 'text-to-image',
        ui_group: 'generation',
        supports: ['prompt'],
        defaults: {},
        controls: [],
        aliases: [],
        provider: 'fal-ai',
        credits: 3,
        time: '~3s',
      },
      {
        id: 'gmi/seedream-5.0-lite',
        name: 'Seedream 5 Lite',
        description: 'GMI image model',
        category: 'image-generation',
        media_type: 'image',
        workflow_type: 'text-to-image',
        ui_group: 'generation',
        supports: ['prompt'],
        defaults: {},
        controls: [],
        aliases: [],
        provider: 'gmi-cloud',
        credits: 0,
        time: '~4s',
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/store/computeFlowStore', () => ({
  useComputeFlowStore: () => ({
    nodeDefinitions: mockNodeDefinitions,
    edgeDefinitions: mockEdgeDefinitions,
    updateNode,
    removeNode,
  }),
}));

vi.mock('@/hooks/studio/useStudioGraphActions', () => ({
  useStudioGraphActions: () => ({
    scheduleSave,
  }),
}));

vi.mock('@/hooks/studio/useStudioNodeGeneration', () => ({
  useStudioNodeGeneration: () => ({
    generateNode,
    updateNodeModelSelection,
  }),
}));

vi.mock('@/components/studio/panels/AssetsGalleryPanel', () => ({
  AssetsGalleryPanel: () => <div data-testid="assets-gallery-panel">Gallery Panel</div>,
}));

vi.mock('@/components/studio/image-edit/ImageEditDock', () => ({
  default: () => <div data-testid="image-edit-dock">Image Edit Dock</div>,
}));

vi.mock('@/components/studio/model-selector/FloraModelMarketplace', () => ({
  FloraModelMarketplace: () => <div data-testid="flora-model-marketplace">Model Marketplace</div>,
}));

import { StudioRightPanel } from './StudioRightPanel';

function createNode(overrides: Partial<NodeDefinition>): NodeDefinition {
  return {
    id: 'node-1',
    kind: 'Image',
    version: '1.0.0',
    label: 'Pixelated Type',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    status: 'idle',
    progress: 0,
    params: { model: 'fal-ai/flux/schnell', resolution: '2K', aspectRatio: '16:9', prompt: 'prompt' },
    ...overrides,
  } as NodeDefinition;
}

describe('StudioRightPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockNodeDefinitions = [];
    mockEdgeDefinitions = [];
    updateNode.mockReset();
    removeNode.mockReset();
    scheduleSave.mockReset();
    generateNode.mockReset();
    updateNodeModelSelection.mockReset();
  });

  it('keeps Gallery and Nodes tabs visible when a node is selected and switches to Nodes', async () => {
    const user = userEvent.setup();
    mockNodeDefinitions = [createNode({ id: 'image-1' })];

    render(<StudioRightPanel projectId="project-1" selectedNodeId="image-1" />);

    await user.click(await screen.findByRole('button', { name: /Expand Nodes/i }));
    expect(await screen.findByRole('button', { name: /Gallery/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nodes/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Pixelated Type')).toBeInTheDocument();
    });
  });

  it('shows the Nodes creation palette and creates a node from the right rail', async () => {
    const user = userEvent.setup();
    const onCreateNode = vi.fn();

    render(<StudioRightPanel projectId="project-1" onCreateNode={onCreateNode} />);

    await user.click(await screen.findByRole('button', { name: /Expand Gallery/i }));
    await user.click(await screen.findByRole('button', { name: /Nodes/i }));
    await screen.findByText('Build the graph from the rail.');
    await user.click(screen.getByRole('button', { name: /Image Edit/i }));

    expect(onCreateNode).toHaveBeenCalledWith('imageEdit');
  }, 15_000);

  it('collapses to a slim stub and stays collapsed while selection changes', async () => {
    const user = userEvent.setup();

    mockNodeDefinitions = [
      createNode({ id: 'image-1', label: 'Graphic Design' }),
      createNode({ id: 'image-2', label: 'Poster Variant' }),
    ];

    const { rerender } = render(
      <StudioRightPanel projectId="project-1" selectedNodeId="image-1" />
    );

    await user.click(await screen.findByRole('button', { name: /Expand Nodes/i }));
    await waitFor(() => {
      expect(screen.getByText('Graphic Design')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /collapse panel/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand nodes/i })).toBeInTheDocument();
    });

    rerender(<StudioRightPanel projectId="project-1" selectedNodeId="image-2" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand nodes/i })).toBeInTheDocument();
      expect(screen.queryByText('Poster Variant')).not.toBeInTheDocument();
    });
  });

  it('uses the wide width only for ImageEdit while Nodes is active', async () => {
    const user = userEvent.setup();
    const onWidthChange = vi.fn();

    mockNodeDefinitions = [
      createNode({
        id: 'edit-1',
        kind: 'ImageEdit',
        label: 'Landing Page Compositing',
      }),
    ];

    render(
      <StudioRightPanel
        projectId="project-1"
        selectedNodeId="edit-1"
        onWidthChange={onWidthChange}
      />
    );

    await user.click(await screen.findByRole('button', { name: /Expand Nodes/i }));
    await waitFor(() => {
      expect(onWidthChange).toHaveBeenLastCalledWith(960);
    });

    await user.click(await screen.findByRole('button', { name: /Gallery/i }));

    await waitFor(() => {
      expect(onWidthChange).toHaveBeenLastCalledWith(372);
    });
  });
});
