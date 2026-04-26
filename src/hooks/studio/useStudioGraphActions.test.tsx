import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useStudioGraphActions } from './useStudioGraphActions';
import { useComputeFlowStore } from '@/store/computeFlowStore';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

describe('useStudioGraphActions', () => {
  beforeEach(() => {
    useComputeFlowStore.getState().clearGraph();
  });

  it('materializes a workflow blueprint into canonical nodes and valid semantic edges', () => {
    const { result } = renderHook(() => useStudioGraphActions());

    const materialized = result.current.materializeWorkflowBlueprint({
      layout: 'horizontal',
      nodes: [
        { kind: 'Text', label: 'Prompt Builder', prompt: 'Describe the hero image' },
        { kind: 'Image', label: 'Hero Image', model: 'fal-ai/nano-banana-pro', prompt: 'A cinematic hero image' },
        { kind: 'Video', label: 'Motion Pass', prompt: 'Animate the scene' },
      ],
      edges: [
        { from: 0, to: 1, sourceHandle: 'text', targetHandle: 'prompt' },
        { from: 1, to: 2, sourceHandle: 'image', targetHandle: 'image' },
      ],
    });

    expect(materialized.nodes).toHaveLength(3);
    expect(materialized.edges).toHaveLength(2);

    expect(materialized.nodes[0].inputs[0].name).toBe('input');
    expect(materialized.nodes[1].inputs.map((port) => port.name)).toContain('prompt');
    expect(materialized.nodes[1].outputs.map((port) => port.name)).toContain('image');

    expect(materialized.edges[0].dataType).toBe('text');
    expect(materialized.edges[1].dataType).toBe('image');
    expect(materialized.nodes[0].params.content).toBe('Describe the hero image');
    expect(materialized.nodes[1].params.model).toBe('fal-ai/nano-banana-pro');
  });

  it('falls back to generation-safe defaults when the workflow blueprint requests an incompatible model', () => {
    const { result } = renderHook(() => useStudioGraphActions());

    const materialized = result.current.materializeWorkflowBlueprint({
      layout: 'horizontal',
      nodes: [
        { kind: 'Image', label: 'Hero Image', model: 'fal-ai/kling-video/o3/pro/text-to-video', prompt: 'A cinematic hero image' },
        { kind: 'Video', label: 'Motion Pass', model: 'fal-ai/nano-banana-pro', prompt: 'Animate the scene' },
      ],
      edges: [],
    });

    expect(materialized.nodes[0].params.model).toBe('fal-ai/flux/schnell');
    expect(materialized.nodes[1].params.model).toBe('fal-ai/kling-video/o3/standard/text-to-video');
  });
});
