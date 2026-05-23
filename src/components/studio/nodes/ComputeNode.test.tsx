import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NodeProps } from '@xyflow/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const updateNodeInternals = vi.fn();

vi.mock('@xyflow/react', () => ({
  Handle: ({ id, type }: { id: string; type: string }) => <div data-testid={`handle-${type}-${id}`} />,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ getEdges: () => [] }),
  useUpdateNodeInternals: () => updateNodeInternals,
}));

vi.mock('@/hooks/useCatalogModels', () => ({
  useCatalogModels: () => ({
    models: [
      {
        id: 'fal-ai/nano-banana-2',
        name: 'Nano Banana 2',
        media_type: 'image',
        workflow_type: 'text-to-image',
        ui_group: 'generation',
        supports: [],
        defaults: {},
        controls: [],
        aliases: [],
        provider: 'fal-ai',
        provider_label: 'fal.ai',
      },
      {
        id: 'fal-ai/nano-banana-2/edit',
        name: 'Nano Banana 2 Edit',
        media_type: 'image',
        workflow_type: 'image-to-image',
        ui_group: 'advanced',
        supports: [],
        defaults: {},
        controls: [],
        aliases: [],
        provider: 'fal-ai',
        provider_label: 'fal.ai',
      },
    ],
  }),
}));

import { ComputeNode } from './ComputeNode';

describe('ComputeNode', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn();
  });

  it('displays the persisted params.model and refreshes dynamic handles', () => {
    render(
      <ComputeNode
        {...({
          id: 'node-1',
          selected: false,
          data: {
          kind: 'ImageEdit',
          label: 'Image Edit',
          actionId: 'image.edit',
          mediaType: 'image',
          workflowType: 'image-edit',
          params: { model: 'fal-ai/nano-banana-2/edit' },
          status: 'idle',
          inputs: [{ id: 'image', name: 'image', datatype: 'image', cardinality: 'n', position: 'left' }],
          outputs: [{ id: 'image', name: 'image', datatype: 'image', cardinality: 'n', position: 'right' }],
          },
        } as unknown as NodeProps)}
      />
    );

    expect(screen.getByText('Nano Banana 2 Edit')).toBeInTheDocument();
    expect(screen.getByTestId('handle-target-image')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source-image')).toBeInTheDocument();
    expect(updateNodeInternals).toHaveBeenCalledWith('node-1');
  });

  it('writes editable registry controls through onUpdateParams', async () => {
    const user = userEvent.setup();
    const onUpdateParams = vi.fn();

    render(
      <ComputeNode
        {...({
          id: 'node-2',
          selected: false,
          data: {
          kind: 'Image',
          label: 'Image Prompt',
          actionId: 'image.generate',
          mediaType: 'image',
          workflowType: 'text-to-image',
          params: { model: 'fal-ai/nano-banana-2', aspectRatio: '1:1' },
          status: 'idle',
          inputs: [],
          outputs: [{ id: 'image', name: 'image', datatype: 'image', cardinality: 'n', position: 'right' }],
          onUpdateParams,
          },
        } as unknown as NodeProps)}
      />
    );

    await user.selectOptions(screen.getByLabelText('Aspect Ratio'), '16:9');

    expect(onUpdateParams).toHaveBeenCalledWith({ aspectRatio: '16:9' });
  });
});
