import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, invokeMock, toastErrorMock, toastInfoMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  invokeMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
}));

let graphHeaderResponse: { data: any; error: any } = { data: null, error: null };
let nodesResponse: { data: any; error: any } = { data: [], error: null };
let edgesResponse: { data: any; error: any } = { data: [], error: null };

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    info: toastInfoMock,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          if (table === 'compute_graphs') {
            return {
              maybeSingle: vi.fn().mockResolvedValue(graphHeaderResponse),
            };
          }
          if (table === 'compute_nodes') {
            return Promise.resolve(nodesResponse);
          }
          if (table === 'compute_edges') {
            return Promise.resolve(edgesResponse);
          }
          return Promise.resolve({ data: [], error: null });
        }),
      })),
    })),
    rpc: rpcMock,
    functions: {
      invoke: invokeMock,
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

import { useComputeFlowStore } from '@/store/computeFlowStore';

describe('computeFlowStore persistence contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphHeaderResponse = { data: null, error: null };
    nodesResponse = { data: [], error: null };
    edgesResponse = { data: [], error: null };

    useComputeFlowStore.getState().clearGraph();
    useComputeFlowStore.setState({
      schemaVersion: '2',
      graphMetadata: { source: 'unit-test' },
      viewState: { zoom: 1.5, center: [32, 64] },
      revision: 4,
      error: null,
      isSaving: false,
      isLoading: false,
    });
  });

  it('saves the graph through the atomic RPC and updates revision', async () => {
    const node = useComputeFlowStore.getState().createNode('Text', { x: 120, y: 240 });
    const target = useComputeFlowStore.getState().createNode('Image', { x: 520, y: 240 });

    useComputeFlowStore.setState({
      nodeDefinitions: [node, target],
      edgeDefinitions: [
        {
          id: 'edge-1',
          source: { nodeId: node.id, portId: node.outputs[0].id },
          target: { nodeId: target.id, portId: target.inputs[0].id },
          dataType: node.outputs[0].datatype,
          status: 'idle',
        },
      ],
    });

    rpcMock.mockResolvedValue({
      data: { success: true, revision: 5, updated_at: new Date().toISOString() },
      error: null,
    });

    await useComputeFlowStore.getState().saveGraph('project-1');

    expect(rpcMock).toHaveBeenCalledWith(
      'save_compute_graph',
      expect.objectContaining({
        p_project_id: 'project-1',
        p_expected_revision: 4,
        p_schema_version: '2',
        p_graph_metadata: { source: 'unit-test' },
        p_view_state: { zoom: 1.5, center: [32, 64] },
        p_nodes: expect.any(Array),
        p_edges: expect.any(Array),
      })
    );
    expect(useComputeFlowStore.getState().revision).toBe(5);
  });

  it('rejects stale revision saves instead of silently overwriting newer graphs', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'revision mismatch' },
    });

    await useComputeFlowStore.getState().saveGraph('project-1');

    expect(toastErrorMock).toHaveBeenCalledWith(
      'Graph save rejected because a newer revision exists. Reload the project and try again.'
    );
  });

  it('backfills legacy studio blocks into canonical compute graph state', async () => {
    invokeMock.mockResolvedValue({
      data: {
        blocks: [
          {
            type: 'text',
            position: { x: 80, y: 140 },
            initialData: { prompt: 'Legacy prompt' },
            selectedModel: 'gemini-2.5-flash',
          },
        ],
        canvasState: {
          viewport: { zoom: 1.2, center: [25, 35] },
        },
      },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: { success: true, revision: 1, updated_at: new Date().toISOString() },
      error: null,
    });

    await useComputeFlowStore.getState().loadGraph('project-1');

    expect(invokeMock).toHaveBeenCalledWith('studio-load-state', {
      body: { projectId: 'project-1' },
    });
    expect(useComputeFlowStore.getState().nodeDefinitions).toHaveLength(1);
    expect(useComputeFlowStore.getState().nodeDefinitions[0].kind).toBe('Text');
    expect(useComputeFlowStore.getState().graphMetadata).toEqual({ backfilledFromLegacy: true });
  });
});
