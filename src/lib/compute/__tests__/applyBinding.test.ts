import { describe, expect, it } from 'vitest';

import { applyOnConnect, resolveIncomingForUI } from '@/lib/compute/applyBinding';
import type { EdgeDefinition, NodeDefinition, Port } from '@/types/computeFlow';

function port(id: string, name: string, datatype: Port['datatype'], position: Port['position']): Port {
  return { id, name, datatype, cardinality: '1', position };
}

function makeImageSource(url = 'https://cdn.example/img.png'): NodeDefinition {
  return {
    id: 'src-img',
    kind: 'Image',
    version: '1',
    label: 'Hero Image',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [port('out', 'image', 'image', 'right')],
    params: {},
    preview: { id: 'a', type: 'image', url },
    status: 'succeeded',
  };
}

function makeTextSource(text = 'a cinematic shot'): NodeDefinition {
  return {
    id: 'src-text',
    kind: 'Prompt',
    version: '1',
    label: 'Prompt',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [port('out', 'prompt', 'text', 'right')],
    params: { prompt: text },
    status: 'succeeded',
  };
}

function makeImageTarget(): NodeDefinition {
  return {
    id: 'tgt',
    kind: 'Image',
    version: '1',
    label: 'New Image',
    position: { x: 200, y: 0 },
    inputs: [
      port('in-prompt', 'prompt', 'text', 'left'),
      port('in-ref', 'reference', 'image', 'left'),
      port('in-mask', 'mask', 'image', 'left'),
    ],
    outputs: [port('out', 'image', 'image', 'right')],
    params: {},
    status: 'idle',
  };
}

describe('applyOnConnect', () => {
  it('writes a single image url into Image.reference (append-unique)', () => {
    const source = makeImageSource('https://cdn.example/a.png');
    const target = makeImageTarget();
    const delta = applyOnConnect({
      sourceNode: source,
      targetNode: target,
      sourcePort: source.outputs[0],
      targetPort: target.inputs[1], // reference
      edgeDataType: 'image',
    });
    expect(delta).toEqual({ referenceImageUrls: ['https://cdn.example/a.png'] });
  });

  it('append-unique deduplicates and preserves prior values', () => {
    const source = makeImageSource('https://cdn.example/b.png');
    const target = makeImageTarget();
    target.params = { referenceImageUrls: ['https://cdn.example/a.png'] };

    const delta1 = applyOnConnect({
      sourceNode: source,
      targetNode: target,
      sourcePort: source.outputs[0],
      targetPort: target.inputs[1],
      edgeDataType: 'image',
    });
    expect(delta1.referenceImageUrls).toEqual([
      'https://cdn.example/a.png',
      'https://cdn.example/b.png',
    ]);

    // Second connect with the same URL should not duplicate.
    target.params = delta1;
    const delta2 = applyOnConnect({
      sourceNode: source,
      targetNode: target,
      sourcePort: source.outputs[0],
      targetPort: target.inputs[1],
      edgeDataType: 'image',
    });
    expect(delta2.referenceImageUrls).toEqual([
      'https://cdn.example/a.png',
      'https://cdn.example/b.png',
    ]);
  });

  it('overwrites prompt text', () => {
    const source = makeTextSource('hello');
    const target = makeImageTarget();
    const delta = applyOnConnect({
      sourceNode: source,
      targetNode: target,
      sourcePort: source.outputs[0],
      targetPort: target.inputs[0], // prompt
      edgeDataType: 'text',
    });
    expect(delta).toEqual({ prompt: 'hello' });
  });

  it('returns empty when source has no preview yet', () => {
    const source = makeImageSource('');
    source.preview = undefined;
    const target = makeImageTarget();
    const delta = applyOnConnect({
      sourceNode: source,
      targetNode: target,
      sourcePort: source.outputs[0],
      targetPort: target.inputs[1],
      edgeDataType: 'image',
    });
    expect(delta).toEqual({});
  });
});

describe('resolveIncomingForUI', () => {
  it('produces an image chip and binds reference handle for Image target', () => {
    const source = makeImageSource('https://cdn.example/x.png');
    const target = makeImageTarget();
    const edges: EdgeDefinition[] = [
      {
        id: 'e1',
        source: { nodeId: source.id, portId: source.outputs[0].id, handle: 'image' },
        target: { nodeId: target.id, portId: target.inputs[1].id, handle: 'reference' },
        dataType: 'image',
        status: 'idle',
      },
    ];
    const { chips, byHandle } = resolveIncomingForUI({
      targetNode: target,
      edges,
      getNode: (id) => (id === source.id ? source : undefined),
    });
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ type: 'image', url: 'https://cdn.example/x.png' });
    expect(byHandle.reference).toEqual(['https://cdn.example/x.png']);
  });

  it('binds prompt text into byHandle.prompt for Image target', () => {
    const source = makeTextSource('a sunset');
    const target = makeImageTarget();
    const edges: EdgeDefinition[] = [
      {
        id: 'e1',
        source: { nodeId: source.id, portId: source.outputs[0].id, handle: 'prompt' },
        target: { nodeId: target.id, portId: target.inputs[0].id, handle: 'prompt' },
        dataType: 'text',
        status: 'idle',
      },
    ];
    const { chips, byHandle } = resolveIncomingForUI({
      targetNode: target,
      edges,
      getNode: (id) => (id === source.id ? source : undefined),
    });
    expect(byHandle.prompt).toBe('a sunset');
    expect(chips[0]).toMatchObject({ type: 'text', preview: 'a sunset' });
  });

  it('skips edges whose source node cannot be resolved', () => {
    const target = makeImageTarget();
    const edges: EdgeDefinition[] = [
      {
        id: 'e1',
        source: { nodeId: 'missing', portId: 'p', handle: 'image' },
        target: { nodeId: target.id, portId: target.inputs[1].id, handle: 'reference' },
        dataType: 'image',
        status: 'idle',
      },
    ];
    const { chips, byHandle } = resolveIncomingForUI({
      targetNode: target,
      edges,
      getNode: () => undefined,
    });
    expect(chips).toEqual([]);
    expect(byHandle).toEqual({});
  });
});
