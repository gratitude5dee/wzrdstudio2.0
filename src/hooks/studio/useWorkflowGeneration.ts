import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { NodeDefinition, EdgeDefinition } from '@/types/computeFlow';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import { useAppStore } from '@/store/appStore';
import { useStudioGraphActions } from '@/hooks/studio/useStudioGraphActions';
import {
  isWorkflowBlueprint,
  type WorkflowGenerationContext,
} from '@/lib/studio/workflowBlueprint';
import { getNodeModelSelection, getNodePromptValue } from '@/lib/studio/nodeUtils';

export interface WorkflowGenerationSettings {
  defaultModel?: 'auto' | 'fast' | 'quality' | 'premium';
  outputResolution?: '1K' | '2K' | '4K';
  workflowComplexity?: 'simple' | 'standard' | 'advanced';
}

interface UseWorkflowGenerationOptions {
  projectId?: string;
  selectedNodeId?: string | null;
  onWorkflowGenerated: (nodes: NodeDefinition[], edges: EdgeDefinition[]) => void;
  onComplete?: () => void;
  settings?: WorkflowGenerationSettings;
}

export function useWorkflowGeneration({
  projectId,
  selectedNodeId,
  onWorkflowGenerated,
  onComplete,
  settings,
}: UseWorkflowGenerationOptions) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const nodeDefinitions = useComputeFlowStore((state) => state.nodeDefinitions);
  const edgeDefinitions = useComputeFlowStore((state) => state.edgeDefinitions);
  const projectTitle = useAppStore((state) => state.activeProjectName);
  const { materializeWorkflowBlueprint } = useStudioGraphActions(projectId);

  const buildContext = useCallback((): WorkflowGenerationContext => {
    const nodesById = new Map(nodeDefinitions.map((node) => [node.id, node]));
    const selectedNode = selectedNodeId
      ? nodeDefinitions.find((node) => node.id === selectedNodeId) ?? null
      : null;

    return {
      projectTitle: projectTitle || undefined,
      selectedNode: selectedNode
        ? {
            id: selectedNode.id,
            kind: selectedNode.kind,
            label: selectedNode.label,
            model: getNodeModelSelection(selectedNode).selectedModelIds[0],
            prompt: getNodePromptValue(selectedNode) || undefined,
          }
        : null,
      nodes: nodeDefinitions.slice(0, 16).map((node) => ({
        id: node.id,
        kind: node.kind,
        label: node.label,
        model: getNodeModelSelection(node).selectedModelIds[0],
        hasPreview: Boolean(node.preview?.url || node.preview?.data),
      })),
      edges: edgeDefinitions.slice(0, 24).map((edge) => ({
        sourceKind: nodesById.get(edge.source.nodeId)?.kind ?? 'Transform',
        targetKind: nodesById.get(edge.target.nodeId)?.kind ?? 'Transform',
        dataType: edge.dataType,
      })),
    };
  }, [edgeDefinitions, nodeDefinitions, projectTitle, selectedNodeId]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-workflow', {
        body: {
          prompt,
          context: buildContext(),
          settings: settings ?? {},
        },
      });

      if (error) throw error;

      if (data?.nodes && data?.edges && data.nodes.every((node: NodeDefinition) => typeof node?.id === 'string')) {
        onWorkflowGenerated(data.nodes, data.edges);
        toast.success(`Created ${data.nodes.length} nodes!`);
        setPrompt('');
        onComplete?.();
        return;
      }

      const blueprintCandidate = data?.blueprint ?? data;

      if (isWorkflowBlueprint(blueprintCandidate)) {
        const materialized = materializeWorkflowBlueprint(blueprintCandidate);
        if (materialized.nodes.length === 0) {
          throw new Error('Workflow blueprint did not contain any supported nodes');
        }
        onWorkflowGenerated(materialized.nodes, materialized.edges);
        toast.success(`Created ${materialized.nodes.length} nodes!`);
        setPrompt('');
        onComplete?.();
      } else {
        throw new Error('Invalid workflow response');
      }
    } catch (error: unknown) {
      console.error('Workflow generation failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate workflow');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, buildContext, settings, materializeWorkflowBlueprint, onWorkflowGenerated, onComplete]);

  const handleExampleClick = useCallback((examplePrompt: string) => {
    setPrompt(examplePrompt);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate]
  );

  return { prompt, setPrompt, isGenerating, handleGenerate, handleExampleClick, handleKeyDown };
}
