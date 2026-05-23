import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  insertMock,
  singleMock,
  orderMock,
  eqMock,
  selectMock,
  fromMock,
  setGraphAtomicMock,
  computeStoreSetStateMock,
  computeStoreState,
} = vi.hoisted(() => ({
  insertMock: vi.fn(),
  singleMock: vi.fn(),
  orderMock: vi.fn(),
  eqMock: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  setGraphAtomicMock: vi.fn(),
  computeStoreSetStateMock: vi.fn(),
  computeStoreState: {
    nodeDefinitions: [{ id: 'node-1', kind: 'Text' }],
    edgeDefinitions: [{ id: 'edge-1' }],
    schemaVersion: '2',
    graphMetadata: { source: 'test' },
    viewState: { zoom: 1.25, center: [10, 20] },
  },
}));

Object.assign(computeStoreState, {
  nodeDefinitions: [{ id: 'node-1', kind: 'Text' }],
  edgeDefinitions: [{ id: 'edge-1' }],
  schemaVersion: '2',
  graphMetadata: { source: 'test' },
  viewState: { zoom: 1.25, center: [10, 20] },
  setGraphAtomic: setGraphAtomicMock,
});

const useComputeFlowStoreMock = Object.assign(
  vi.fn(() => computeStoreState),
  {
    getState: () => computeStoreState,
    setState: computeStoreSetStateMock,
  }
);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock('@/store/computeFlowStore', () => ({
  useComputeFlowStore: useComputeFlowStoreMock,
}));

import { useFlowsStore } from '@/store/flowsStore';

describe('flowsStore snapshot contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useFlowsStore.setState({
      savedFlows: [],
      isLoading: false,
      error: null,
      selectedFlowId: null,
    });

    orderMock.mockResolvedValue({ data: [], error: null });
    singleMock.mockResolvedValue({ data: null, error: null });
    eqMock.mockImplementation(() => ({
      order: orderMock,
      single: singleMock,
    }));
    selectMock.mockImplementation(() => ({
      eq: eqMock,
      order: orderMock,
      single: singleMock,
    }));
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockImplementation(() => ({
      select: selectMock,
      insert: insertMock,
      delete: vi.fn(() => ({ eq: vi.fn() })),
      update: vi.fn(() => ({ eq: vi.fn() })),
    }));
  });

  it('saves flow snapshots with schema version, metadata, view state, and origin project id', async () => {
    await useFlowsStore.getState().saveCurrentFlow('project-1', 'Snapshot 1', 'Demo snapshot');

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        origin_project_id: 'project-1',
        schema_version: '2',
        graph_metadata: { source: 'test' },
        view_state: { zoom: 1.25, center: [10, 20] },
        flow_data: expect.objectContaining({
          schemaVersion: '2',
          graphMetadata: { source: 'test' },
          viewState: { zoom: 1.25, center: [10, 20] },
          nodes: computeStoreState.nodeDefinitions,
          edges: computeStoreState.edgeDefinitions,
        }),
      })
    );
  });

  it('loads flow snapshots and restores header state before graph content', async () => {
    singleMock.mockResolvedValue({
      data: {
        schema_version: '3',
        graph_metadata: { restored: true },
        view_state: { zoom: 2, center: [120, 240] },
        flow_data: {
          nodes: [{ id: 'node-2', kind: 'Image' }],
          edges: [{ id: 'edge-2' }],
        },
      },
      error: null,
    });

    await useFlowsStore.getState().loadFlow('flow-1');

    expect(computeStoreSetStateMock).toHaveBeenCalledWith({
      schemaVersion: '3',
      graphMetadata: { restored: true },
      viewState: { zoom: 2, center: [120, 240] },
    });
    expect(setGraphAtomicMock).toHaveBeenCalledWith(
      [{ id: 'node-2', kind: 'Image' }],
      [{ id: 'edge-2' }],
      { skipHistory: false, skipDirty: false }
    );
    expect(useFlowsStore.getState().selectedFlowId).toBe('flow-1');
  });
});
