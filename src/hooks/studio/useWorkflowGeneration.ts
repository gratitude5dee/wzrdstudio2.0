import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { NodeDefinition, EdgeDefinition } from '@/types/computeFlow';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import { useAppStore } from '@/store/appStore';
import { useStudioGraphActions } from '@/hooks/studio/useStudioGraphActions';
import {
  isWorkflowBlueprint,
  type WzrdGeneratedQuestion,
  type WzrdAssetRef,
  type WorkflowGenerationContext,
} from '@/lib/studio/workflowBlueprint';
import { getNodeModelSelection, getNodePromptValue } from '@/lib/studio/nodeUtils';

export interface WorkflowGenerationSettings {
  defaultModel?: 'auto' | 'fast' | 'quality' | 'premium';
  outputResolution?: '1K' | '2K' | '4K';
  workflowComplexity?: 'simple' | 'standard' | 'advanced';
}

export type WzrdAgentPhase =
  | 'draft'
  | 'analyzing_assets'
  | 'asking_questions'
  | 'planning'
  | 'preview_blueprint'
  | 'materializing'
  | 'ready_to_run';

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
  const [phase, setPhase] = useState<WzrdAgentPhase>('draft');
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [questions, setQuestions] = useState<WzrdGeneratedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const nodeDefinitions = useComputeFlowStore((state) => state.nodeDefinitions);
  const edgeDefinitions = useComputeFlowStore((state) => state.edgeDefinitions);
  const projectTitle = useAppStore((state) => state.activeProjectName);
  const { materializeWorkflowBlueprint } = useStudioGraphActions(projectId);

  const buildAssetContext = useCallback((): WzrdAssetRef[] => {
    const refs: WzrdAssetRef[] = [];
    nodeDefinitions.forEach((node) => {
      const candidates = [
        ...(node.assetRefs ?? []),
        ...(node.preview ? [node.preview] : []),
      ];

      candidates.forEach((asset) => {
        if (!asset?.id || refs.some((existing) => existing.id === asset.id)) {
          return;
        }
        refs.push({
          id: asset.id,
          type: asset.type,
          url: asset.url,
          name:
            typeof asset.metadata?.name === 'string'
              ? asset.metadata.name
              : typeof asset.data?.name === 'string'
                ? asset.data.name
                : node.label,
          durationMs:
            typeof asset.metadata?.durationMs === 'number'
              ? asset.metadata.durationMs
              : typeof asset.data?.durationMs === 'number'
                ? asset.data.durationMs
                : undefined,
          trimStartMs:
            typeof asset.metadata?.trimStartMs === 'number'
              ? asset.metadata.trimStartMs
              : typeof asset.data?.trimStartMs === 'number'
                ? asset.data.trimStartMs
                : undefined,
          trimEndMs:
            typeof asset.metadata?.trimEndMs === 'number'
              ? asset.metadata.trimEndMs
              : typeof asset.data?.trimEndMs === 'number'
                ? asset.data.trimEndMs
                : undefined,
          role:
            typeof asset.metadata?.role === 'string'
              ? asset.metadata.role
              : typeof asset.data?.role === 'string'
                ? asset.data.role
                : undefined,
          metadata: asset.metadata,
        });
      });
    });
    return refs.slice(0, 12);
  }, [nodeDefinitions]);

  const buildContext = useCallback((nextAnswers: Record<string, unknown> = answers): WorkflowGenerationContext => {
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
      assets: buildAssetContext(),
      answers: nextAnswers,
    };
  }, [answers, buildAssetContext, edgeDefinitions, nodeDefinitions, projectTitle, selectedNodeId]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setPhase('analyzing_assets');
    try {
      const { data, error } = await supabase.functions.invoke('generate-workflow', {
        body: {
          mode: 'plan',
          prompt,
          projectId,
          context: buildContext(),
          settings: settings ?? {},
        },
      });

      if (error) throw error;

      setAssistantMessage(data?.assistantMessage ?? data?.blueprint?.assistantMessage ?? null);
      const nextQuestions = Array.isArray(data?.questions)
        ? data.questions
        : Array.isArray(data?.blueprint?.questions)
          ? data.blueprint.questions
          : [];

      if (nextQuestions.length > 0) {
        const defaults = Object.fromEntries(
          nextQuestions
            .filter((question: WzrdGeneratedQuestion) => question.defaultValue !== undefined)
            .map((question: WzrdGeneratedQuestion) => [question.id, question.defaultValue])
        );
        setAnswers(defaults);
        setQuestions(nextQuestions);
        setPhase('asking_questions');
        toast.success('WZRD prepared a few setup choices');
        return;
      }

      const blueprintCandidate = data?.blueprint ?? data;

      if (isWorkflowBlueprint(blueprintCandidate)) {
        const materialized = materializeWorkflowBlueprint(blueprintCandidate);
        if (materialized.nodes.length === 0) {
          throw new Error('Workflow blueprint did not contain any supported nodes');
        }
        onWorkflowGenerated(materialized.nodes, materialized.edges);
        setPhase('ready_to_run');
        toast.success(`Created ${materialized.nodes.length} WZRD nodes`);
        setPrompt('');
        onComplete?.();
      } else {
        throw new Error('Invalid workflow response');
      }
    } catch (error: unknown) {
      console.error('Workflow generation failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate workflow');
      setPhase('draft');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, projectId, buildContext, settings, materializeWorkflowBlueprint, onWorkflowGenerated, onComplete]);

  const setAnswer = useCallback((questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleMaterialize = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setPhase('materializing');
    try {
      const { data, error } = await supabase.functions.invoke('generate-workflow', {
        body: {
          mode: 'materialize',
          prompt,
          projectId,
          answers,
          context: buildContext(answers),
          settings: settings ?? {},
        },
      });

      if (error) throw error;
      const blueprintCandidate = data?.blueprint ?? data;
      if (!isWorkflowBlueprint(blueprintCandidate)) {
        throw new Error('Invalid workflow response');
      }
      const validationErrors = data?.validationErrors ?? blueprintCandidate.validationErrors;
      if (Array.isArray(validationErrors) && validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      const materialized = materializeWorkflowBlueprint(blueprintCandidate);
      if (materialized.nodes.length === 0) {
        throw new Error('Workflow blueprint did not contain any supported nodes');
      }
      onWorkflowGenerated(materialized.nodes, materialized.edges);
      setQuestions([]);
      setAnswers({});
      setAssistantMessage(data?.assistantMessage ?? blueprintCandidate.assistantMessage ?? null);
      setPrompt('');
      setPhase('ready_to_run');
      toast.success(`Created ${materialized.nodes.length} WZRD nodes`);
      onComplete?.();
    } catch (error: unknown) {
      console.error('Workflow materialization failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create WZRD nodes');
      setPhase('asking_questions');
    } finally {
      setIsGenerating(false);
    }
  }, [answers, buildContext, materializeWorkflowBlueprint, onComplete, onWorkflowGenerated, projectId, prompt, settings]);

  const resetAgent = useCallback(() => {
    setQuestions([]);
    setAnswers({});
    setAssistantMessage(null);
    setPhase('draft');
  }, []);

  const handleExampleClick = useCallback((examplePrompt: string) => {
    setPrompt(examplePrompt);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (questions.length > 0) {
          handleMaterialize();
        } else {
          handleGenerate();
        }
      }
    },
    [handleGenerate, handleMaterialize, questions.length]
  );

  return {
    prompt,
    setPrompt,
    isGenerating,
    phase,
    assistantMessage,
    questions,
    answers,
    setAnswer,
    handleGenerate,
    handleMaterialize,
    handleExampleClick,
    handleKeyDown,
    resetAgent,
  };
}
