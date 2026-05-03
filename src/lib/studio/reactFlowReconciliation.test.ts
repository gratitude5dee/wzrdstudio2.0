import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import {
  reconcileReactFlowEdges,
  reconcileReactFlowNodes,
  stableStringify,
} from './reactFlowReconciliation';

function node(id: string, signature: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: 'compute',
    position: { x: 10, y: 20 },
    selected: false,
    data: { __signature: signature },
    ...overrides,
  };
}

function edge(id: string, signature: string, overrides: Partial<Edge> = {}): Edge {
  return {
    id,
    source: 'source',
    target: 'target',
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'compute',
    data: { __signature: signature },
    ...overrides,
  };
}

describe('reactFlowReconciliation', () => {
  it('uses stable signatures independent of object key order', () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it('preserves unchanged node array and object identity across unrelated ticks', () => {
    const previous = [node('a', 'same'), node('b', 'same')];
    const next = [node('a', 'same'), node('b', 'same')];

    const reconciled = reconcileReactFlowNodes(previous, next);

    expect(reconciled).toBe(previous);
    expect(reconciled[0]).toBe(previous[0]);
    expect(reconciled[1]).toBe(previous[1]);
  });

  it('updates node data without replacing the stable shell when only content changes', () => {
    const previous = [node('a', 'old', { data: { __signature: 'old', progress: 10 } })];
    const next = [node('a', 'new', { data: { __signature: 'new', progress: 20 } })];

    const reconciled = reconcileReactFlowNodes(previous, next);

    expect(reconciled).not.toBe(previous);
    expect(reconciled[0]).not.toBe(previous[0]);
    expect(reconciled[0]).toMatchObject({
      id: 'a',
      type: 'compute',
      position: { x: 10, y: 20 },
      selected: false,
      data: { __signature: 'new', progress: 20 },
    });
  });

  it('preserves unchanged edge identity and replaces changed edge signatures', () => {
    const previous = [edge('a', 'same'), edge('b', 'old')];
    const next = [edge('a', 'same'), edge('b', 'new')];

    const reconciled = reconcileReactFlowEdges(previous, next);

    expect(reconciled).not.toBe(previous);
    expect(reconciled[0]).toBe(previous[0]);
    expect(reconciled[1]).not.toBe(previous[1]);
    expect(reconciled[1].data).toEqual({ __signature: 'new' });
  });
});
