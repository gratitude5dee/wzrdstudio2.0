import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStrictConnectionValidation } from '@/hooks/useStrictConnectionValidation';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import { validateConnection } from '@/utils/edgeValidation';
import type { EdgeDefinition, NodeDefinition, Port } from '@/types/computeFlow';

const buildNode = ({
  id,
  outputDatatype = 'image',
  inputDatatype = 'image',
  outputCardinality = 'n',
  inputCardinality = '1',
}: {
  id: string;
  outputDatatype?: Port['datatype'];
  inputDatatype?: Port['datatype'];
  outputCardinality?: Port['cardinality'];
  inputCardinality?: Port['cardinality'];
}): NodeDefinition => ({
  id,
  kind: 'Image',
  version: '1.0.0',
  label: id,
  position: { x: 0, y: 0 },
  inputs: [
    {
      id: `${id}-input-0`,
      name: 'input',
      datatype: inputDatatype,
      cardinality: inputCardinality,
      position: 'left',
    },
  ],
  outputs: [
    {
      id: `${id}-output-0`,
      name: 'output',
      datatype: outputDatatype,
      cardinality: outputCardinality,
      position: 'right',
    },
  ],
  params: {},
  status: 'idle',
});

describe('useStrictConnectionValidation', () => {
  beforeEach(() => {
    act(() => {
      useComputeFlowStore.setState({
        nodeDefinitions: [],
        edgeDefinitions: [],
      });
    });
  });

  it('matches canonical validator result for a valid connection', () => {
    const sourceNode = buildNode({ id: 'source' });
    const targetNode = buildNode({ id: 'target' });
    const existingEdges: EdgeDefinition[] = [];

    act(() => {
      useComputeFlowStore.setState({
        nodeDefinitions: [sourceNode, targetNode],
        edgeDefinitions: existingEdges,
      });
    });

    const { result } = renderHook(() => useStrictConnectionValidation());
    const strictResult = result.current.validateNewEdge(
      sourceNode.id,
      sourceNode.outputs[0].id,
      targetNode.id,
      targetNode.inputs[0].id
    );

    const canonicalResult = validateConnection({
      sourceNode,
      sourcePort: sourceNode.outputs[0],
      targetNode,
      targetPort: targetNode.inputs[0],
      existingEdges,
    });

    expect(strictResult.valid).toBe(canonicalResult.valid);
    expect(strictResult.error).toBe(canonicalResult.error);
  });

  it('matches canonical validator for source-cardinality conflict', () => {
    const sourceNode = buildNode({ id: 'source', outputCardinality: '1' });
    const targetNodeA = buildNode({ id: 'target-a' });
    const targetNodeB = buildNode({ id: 'target-b' });

    const existingEdges: EdgeDefinition[] = [
      {
        id: 'edge-existing',
        source: { nodeId: sourceNode.id, portId: sourceNode.outputs[0].id },
        target: { nodeId: targetNodeA.id, portId: targetNodeA.inputs[0].id },
        dataType: 'image',
        status: 'idle',
      },
    ];

    act(() => {
      useComputeFlowStore.setState({
        nodeDefinitions: [sourceNode, targetNodeA, targetNodeB],
        edgeDefinitions: existingEdges,
      });
    });

    const { result } = renderHook(() => useStrictConnectionValidation());
    const strictResult = result.current.validateNewEdge(
      sourceNode.id,
      sourceNode.outputs[0].id,
      targetNodeB.id,
      targetNodeB.inputs[0].id
    );

    const canonicalResult = validateConnection({
      sourceNode,
      sourcePort: sourceNode.outputs[0],
      targetNode: targetNodeB,
      targetPort: targetNodeB.inputs[0],
      existingEdges,
    });

    expect(strictResult.valid).toBe(false);
    expect(strictResult.valid).toBe(canonicalResult.valid);
    expect(strictResult.error).toBe(canonicalResult.error);
    expect(strictResult.error).toContain('already connected');
  });
});
