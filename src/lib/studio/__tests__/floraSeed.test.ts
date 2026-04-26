import { describe, expect, it } from 'vitest';
import { buildFloraSeedGraph, FLORA_EXAMPLE_COPY, isFloraSeedNode } from '@/lib/studio/floraSeed';

describe('buildFloraSeedGraph', () => {
  it('creates the seeded FLORA studio graph with a composite image edit node', () => {
    const graph = buildFloraSeedGraph({ x: 120, y: 80 });

    expect(graph.nodes).toHaveLength(7);
    expect(graph.edges).toHaveLength(7);

    const compositeNode = graph.nodes.find((node) => node.kind === 'ImageEdit');
    expect(compositeNode).toBeDefined();
    expect(compositeNode?.label).toBe('Landing Page Compositing');
    expect(isFloraSeedNode(compositeNode)).toBe(true);

    const params = compositeNode?.params as {
      pendingPrompt?: string;
      layers?: Array<{ name: string }>;
    };
    expect(params.pendingPrompt).toBe('remove text here');
    expect(params.layers?.map((layer) => layer.name)).toEqual([
      'Landing Page Visualization',
      'Pixelated Type',
    ]);
  });

  it('keeps the canonical prompt copy available for the prompt bar and seed graph', () => {
    expect(FLORA_EXAMPLE_COPY.landingPrompt).toContain('sleek, 16:9');
    expect(FLORA_EXAMPLE_COPY.pixelPromptExpanded).toContain('Pixel-art typography');
  });
});
