import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

import { useStudioGraphActions } from '@/hooks/studio/useStudioGraphActions';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { EdgeDefinition, NodeDefinition } from '@/types/computeFlow';
import {
  applyNodeModelSelection,
  getDefaultModelForNodeKind,
  getNodeModelSelection,
  type NodeModelSelection,
} from '@/lib/studio/nodeUtils';

type StudioGeneratableKind = 'Text' | 'Prompt' | 'Image' | 'Video' | 'Audio';

function toStudioNodeType(kind: StudioGeneratableKind): 'text' | 'image' | 'video' | 'audio' {
  if (kind === 'Text' || kind === 'Prompt') {
    return 'text';
  }
  if (kind === 'Video') {
    return 'video';
  }
  if (kind === 'Audio') {
    return 'audio';
  }
  return 'image';
}

function resolveTargetPortId(
  originalNode: NodeDefinition,
  targetNode: NodeDefinition,
  edge: EdgeDefinition
): string | null {
  const sourcePort = originalNode.outputs.find((port) => port.id === edge.source.portId);
  const originalTargetPort = originalNode.inputs.find((port) => port.id === edge.target.portId);

  if (originalTargetPort) {
    const byName = targetNode.inputs.find((port) => port.name === originalTargetPort.name);
    if (byName) {
      return byName.id;
    }
  }

  const byType = targetNode.inputs.find((port) => port.datatype === (sourcePort?.datatype ?? edge.dataType));
  return byType?.id ?? targetNode.inputs[0]?.id ?? null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function paramsEqual(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
): boolean {
  return stableStringify(left ?? {}) === stableStringify(right ?? {});
}

export function useStudioNodeGeneration(projectId?: string) {
  const {
    nodeDefinitions,
    edgeDefinitions,
    updateNode,
    addNodesAndEdgesAtomic,
    saveGraph,
    executeGraphStreaming,
  } = useComputeFlowStore();
  const { buildNode, scheduleSave } = useStudioGraphActions(projectId);

  const nodeDefinitionsById = useMemo(
    () => new Map(nodeDefinitions.map((node) => [node.id, node])),
    [nodeDefinitions]
  );

  const updateNodeModelSelection = useCallback(
    (nodeId: string, selection: NodeModelSelection) => {
      const node = nodeDefinitionsById.get(nodeId);
      if (!node) {
        return;
      }

      const nextParams = applyNodeModelSelection(node.params, node.kind, selection);
      if (!paramsEqual(node.params, nextParams)) {
        updateNode(nodeId, {
          params: nextParams,
        });
        scheduleSave();
      }
    },
    [nodeDefinitionsById, scheduleSave, updateNode]
  );

  const prepareTargetsForModels = useCallback(
    (nodeId: string, selection: NodeModelSelection): NodeDefinition[] => {
      const sourceNode = nodeDefinitionsById.get(nodeId);
      if (!sourceNode) {
        return [];
      }

      const selectedModelIds = selection.selectedModelIds.length
        ? selection.selectedModelIds
        : [getDefaultModelForNodeKind(sourceNode.kind)];

      const nextSourceParams = applyNodeModelSelection(sourceNode.params, sourceNode.kind, {
        ...selection,
        selectedModelIds,
      });
      if (!paramsEqual(sourceNode.params, nextSourceParams)) {
        updateNode(nodeId, {
          params: nextSourceParams,
        });
      }

      if (
        sourceNode.kind !== 'Text' &&
        sourceNode.kind !== 'Prompt' &&
        sourceNode.kind !== 'Image' &&
        sourceNode.kind !== 'Video'
      ) {
        scheduleSave();
        return [sourceNode];
      }

      const currentState = useComputeFlowStore.getState();
      const latestNodesById = new Map(currentState.nodeDefinitions.map((node) => [node.id, node]));
      const latestSourceNode = latestNodesById.get(nodeId) ?? sourceNode;
      const sourceIncomingEdges = currentState.edgeDefinitions.filter((edge) => edge.target.nodeId === nodeId);
      const existingVariants = currentState.nodeDefinitions.filter(
        (node) => node.metadata?.variantSourceNodeId === nodeId
      );

      const nodesToCreate: NodeDefinition[] = [];
      const edgesToCreate: EdgeDefinition[] = [];
      const targets: NodeDefinition[] = [latestSourceNode];

      selectedModelIds.slice(1).forEach((modelId, index) => {
        const existingVariant = existingVariants.find(
          (candidate) => candidate.metadata?.variantModelId === modelId
        );

        if (existingVariant) {
          const nextVariantParams = applyNodeModelSelection(existingVariant.params, existingVariant.kind, {
            auto: false,
            selectedModelIds: [modelId],
            useMultipleModels: false,
          });
          if (!paramsEqual(existingVariant.params, nextVariantParams)) {
            updateNode(existingVariant.id, {
              params: nextVariantParams,
            });
          }
          targets.push(existingVariant);
          return;
        }

        const created = buildNode(
          toStudioNodeType(sourceNode.kind as StudioGeneratableKind),
          {
            x: sourceNode.position.x + 360 + index * 360,
            y: sourceNode.position.y + (index % 2) * 34,
          },
          {
            label: sourceNode.label,
            params: applyNodeModelSelection(sourceNode.params, sourceNode.kind, {
              auto: false,
              selectedModelIds: [modelId],
              useMultipleModels: false,
            }),
            metadata: {
              ...(sourceNode.metadata ?? {}),
              variantSourceNodeId: nodeId,
              variantModelId: modelId,
            },
            size: sourceNode.size,
          }
        );

        nodesToCreate.push(created);
        sourceIncomingEdges.forEach((edge) => {
          const targetPortId = resolveTargetPortId(sourceNode, created, edge);
          if (!targetPortId) {
            return;
          }

          edgesToCreate.push({
            id: uuidv4(),
            source: edge.source,
            target: {
              nodeId: created.id,
              portId: targetPortId,
              handle: created.inputs.find((port) => port.id === targetPortId)?.name,
            },
            dataType: edge.dataType,
            status: 'idle',
            metadata: edge.metadata,
          });
        });
        targets.push(created);
      });

      if (nodesToCreate.length > 0 || edgesToCreate.length > 0) {
        addNodesAndEdgesAtomic(
          nodesToCreate,
          edgesToCreate,
          `Created ${selectedModelIds.length} model variants`
        );
      }

      scheduleSave();
      return targets;
    },
    [addNodesAndEdgesAtomic, buildNode, nodeDefinitionsById, scheduleSave, updateNode]
  );

  const generateNode = useCallback(
    async (nodeId: string) => {
      if (!projectId) {
        toast.error('Studio generation requires a saved project.');
        return;
      }

      const node = nodeDefinitionsById.get(nodeId);
      if (!node) {
        return;
      }

      const selection = getNodeModelSelection(node);
      const targets = prepareTargetsForModels(nodeId, selection);
      if (targets.length === 0) {
        return;
      }

      await saveGraph(projectId);
      await executeGraphStreaming(projectId, targets.map((target) => target.id));
    },
    [executeGraphStreaming, nodeDefinitionsById, prepareTargetsForModels, projectId, saveGraph]
  );

  return {
    generateNode,
    updateNodeModelSelection,
  };
}

export default useStudioNodeGeneration;
