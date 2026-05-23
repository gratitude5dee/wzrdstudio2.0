import { useEffect } from 'react';

import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { EdgeDefinition, NodeDefinition, Port } from '@/types/computeFlow';
import { DEFAULT_IMAGE_EDIT_PARAMS } from '@/types/imageEdit';

const E2E_QUERY_VALUE = 'node-population';

export const STUDIO_POPULATION_TEST_IDS = {
  imageEdit: '00000000-0000-4000-8000-000000000101',
  video: '00000000-0000-4000-8000-000000000102',
  populatedImageEdit: '00000000-0000-4000-8000-000000000201',
  populatedVideo: '00000000-0000-4000-8000-000000000202',
} as const;

declare global {
  interface Window {
    __wzrdStudioTest?: {
      seedPopulationGraph: () => Promise<void>;
      populateNewNodes: () => Promise<void>;
    };
  }
}

function afterAnimationFrames(count = 2): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let remaining = count;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function port(
  id: string,
  name: string,
  datatype: Port['datatype'],
  position: Port['position'],
  cardinality: Port['cardinality'] = '1'
): Port {
  return { id, name, datatype, position, cardinality };
}

function imageEditNode(id: string, label: string, position: NodeDefinition['position']): NodeDefinition {
  return {
    id,
    kind: 'ImageEdit',
    actionId: 'image.edit',
    mediaType: 'image',
    workflowType: 'image-edit',
    version: '1.0.0',
    label,
    position,
    size: { w: 404, h: 300 },
    inputs: [
      port('prompt', 'prompt', 'text', 'left', 'n'),
      port('image', 'image', 'image', 'left', 'n'),
    ],
    outputs: [
      port('image', 'image', 'image', 'right', 'n'),
      port('layers', 'layers', 'json', 'bottom', 'n'),
    ],
    params: {
      ...DEFAULT_IMAGE_EDIT_PARAMS,
      pendingPrompt: 'Composite cinematic references and preserve faces',
    },
    status: 'idle',
    progress: 0,
  };
}

function videoNode(id: string, label: string, position: NodeDefinition['position']): NodeDefinition {
  return {
    id,
    kind: 'Video',
    actionId: 'video.generate',
    mediaType: 'video',
    workflowType: 'text-to-video',
    version: '1.0.0',
    label,
    position,
    size: { w: 396, h: 360 },
    inputs: [
      port('prompt', 'prompt', 'text', 'left'),
      port('image', 'image', 'image', 'left'),
    ],
    outputs: [port('video', 'video', 'video', 'right', 'n')],
    params: {
      prompt: 'A slow cinematic push through a Mars archive vault',
      model: 'fal-ai/kling-video/o3/standard/text-to-video',
      selectedModels: ['fal-ai/kling-video/o3/standard/text-to-video'],
      aspectRatio: '16:9',
    },
    status: 'idle',
    progress: 0,
  };
}

function buildSeedGraph(): { nodes: NodeDefinition[]; edges: EdgeDefinition[] } {
  return {
    nodes: [
      imageEditNode(STUDIO_POPULATION_TEST_IDS.imageEdit, 'Left Image Edit Node', { x: 220, y: 300 }),
      videoNode(STUDIO_POPULATION_TEST_IDS.video, 'Right Video Node', { x: 760, y: 300 }),
    ],
    edges: [],
  };
}

function buildPopulationGraph(): { nodes: NodeDefinition[]; edges: EdgeDefinition[] } {
  const imageEdit = imageEditNode(
    STUDIO_POPULATION_TEST_IDS.populatedImageEdit,
    'Populated Image Edit Node',
    { x: 500, y: 40 }
  );
  const video = videoNode(
    STUDIO_POPULATION_TEST_IDS.populatedVideo,
    'Populated Video Node',
    { x: 960, y: 40 }
  );

  return {
    nodes: [imageEdit, video],
    edges: [
      {
        id: '00000000-0000-4000-8000-000000000301',
        source: { nodeId: imageEdit.id, portId: 'image', handle: 'image' },
        target: { nodeId: video.id, portId: 'image', handle: 'image' },
        dataType: 'image',
        status: 'idle',
      },
    ],
  };
}

function isHarnessEnabled(): boolean {
  return Boolean(
    import.meta.env.DEV &&
      import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true' &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('e2e') === E2E_QUERY_VALUE
  );
}

export function useStudioPopulationTestHarness(onSelectNode: (nodeId: string | null) => void) {
  const clearGraph = useComputeFlowStore((state) => state.clearGraph);
  const setGraphAtomic = useComputeFlowStore((state) => state.setGraphAtomic);
  const addGeneratedWorkflow = useComputeFlowStore((state) => state.addGeneratedWorkflow);
  const flushPendingEdges = useComputeFlowStore((state) => state.flushPendingEdges);

  useEffect(() => {
    if (!isHarnessEnabled()) {
      return;
    }

    window.__wzrdStudioTest = {
      seedPopulationGraph: async () => {
        const { nodes, edges } = buildSeedGraph();
        clearGraph();
        setGraphAtomic(nodes, edges, { skipDirty: true, skipHistory: true });
        onSelectNode(STUDIO_POPULATION_TEST_IDS.imageEdit);
        await afterAnimationFrames(3);
      },
      populateNewNodes: async () => {
        const { nodes, edges } = buildPopulationGraph();
        addGeneratedWorkflow(nodes, edges);
        await afterAnimationFrames(2);
        flushPendingEdges();
        await afterAnimationFrames(4);
      },
    };

    return () => {
      if (window.__wzrdStudioTest) {
        delete window.__wzrdStudioTest;
      }
    };
  }, [addGeneratedWorkflow, clearGraph, flushPendingEdges, onSelectNode, setGraphAtomic]);
}
