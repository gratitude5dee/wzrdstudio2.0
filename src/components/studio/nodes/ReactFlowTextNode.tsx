import { memo, type MouseEvent } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Copy, Play, SendHorizontal, Trash2, Type } from 'lucide-react';

import { BaseNode } from './BaseNode';
import { NodeStatusBadge } from '../status/NodeStatusBadge';
import { cn } from '@/lib/utils';
import type { NodeDefinition, Port, PortPosition } from '@/types/computeFlow';
import {
  getModelSummaryLabel,
  getNodeModelSelection,
  getNodePromptValue,
  getNodeTextPreviewValue,
} from '@/lib/studio/nodeUtils';

const portPositionToReactFlow = (position: PortPosition) => {
  switch (position) {
    case 'right':
      return Position.Right;
    case 'bottom':
      return Position.Bottom;
    case 'top':
      return Position.Top;
    case 'left':
    default:
      return Position.Left;
  }
};

const TEXT_MODEL_WORKFLOW_TYPES = ['text-to-text'];

type TextNodeData = Partial<Pick<NodeDefinition, 'label' | 'params' | 'preview' | 'status' | 'progress' | 'error' | 'inputs' | 'outputs'>> & {
  incomingReferenceSources?: Array<{ url: string; name: string; type?: 'image' | 'video' }>;
  onGenerate?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onModelSelectionChange?: (selection: { auto: boolean; selectedModelIds: string[]; useMultipleModels: boolean }) => void;
  onOpenConnectionMenu?: (sourcePortId: string, rect?: DOMRect | null) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdateParams?: (paramUpdates: Record<string, unknown>) => void;
  popoverBoundary?: HTMLElement | null;
  popoverContainer?: HTMLElement | null;
};

export const ReactFlowTextNode = memo(({ data, id, selected }: NodeProps) => {
  const nodeData = (data ?? {}) as TextNodeData;
  const status = nodeData?.status || 'idle';
  const progress = nodeData?.progress || 0;
  const error = nodeData?.error;
  const inputPorts = (nodeData?.inputs as Port[] | undefined) ?? [];
  const outputPorts = (nodeData?.outputs as Port[] | undefined) ?? [];
  const promptValue = getNodePromptValue({ params: nodeData?.params });
  const previewText = getNodeTextPreviewValue({
    params: nodeData?.params,
    preview: nodeData?.preview,
  });
  const hasGeneratedText =
    previewText.trim().length > 0 && previewText.trim() !== promptValue.trim();
  const modelSelection = getNodeModelSelection({
    kind: 'Text',
    params: nodeData?.params,
  });
  const modelLabel = getModelSummaryLabel(modelSelection);
  const title = nodeData?.label || 'Text';
  const referenceSources =
    (nodeData?.incomingReferenceSources as Array<{ url: string; name: string; type?: 'image' | 'video' }> | undefined) ?? [];
  const referenceCount = referenceSources.length;

  const handles = [
    ...inputPorts.map((port) => ({
      id: port.id,
      type: 'target' as const,
      position: portPositionToReactFlow(port.position),
      dataType: port.datatype,
      label: port.name,
      maxConnections: port.cardinality === '1' ? 1 : undefined,
      variant: 'flora' as const,
    })),
    ...outputPorts.map((port) => ({
      id: port.id,
      type: 'source' as const,
      position: portPositionToReactFlow(port.position),
      dataType: port.datatype,
      label: port.name,
      maxConnections: port.cardinality === '1' ? 1 : undefined,
      variant: 'flora' as const,
      onClick: (event: MouseEvent<HTMLDivElement>) =>
        nodeData?.onOpenConnectionMenu?.(port.id, event.currentTarget.getBoundingClientRect()),
    })),
  ];

  return (
    <BaseNode
      handles={handles}
      nodeType="text"
      isSelected={selected}
      minimalChrome
      className="text-white"
      hoverMenu={{
        mediaType: 'text',
        modelSelection,
        workflowTypes: TEXT_MODEL_WORKFLOW_TYPES,
        onModelSelectionChange: nodeData?.onModelSelectionChange,
        popoverBoundary: nodeData?.popoverBoundary,
        popoverContainer: nodeData?.popoverContainer,
        actionItems: [
          {
            key: 'generate',
            icon: Play,
            ariaLabel: 'Generate',
            onClick: nodeData?.onGenerate,
          },
          {
            key: 'duplicate',
            icon: Copy,
            ariaLabel: 'Duplicate',
            onClick: nodeData?.onDuplicate,
          },
          {
            key: 'delete',
            icon: Trash2,
            ariaLabel: 'Delete',
            onClick: nodeData?.onDelete,
          },
        ],
      }}
    >
      <NodeStatusBadge status={status} progress={progress} error={error} className="right-0 top-0" />

      <div className="w-[372px]">
        <div className="mb-2 flex items-center justify-between gap-3 px-1.5">
          <div className="flex min-w-0 items-center gap-2 text-[11px] tracking-[0.22em] text-zinc-500">
            <Type className="h-3.5 w-3.5 text-zinc-500" />
            <span className="truncate uppercase">{title}</span>
          </div>
          <div className="rounded-full border border-[rgba(249,115,22,0.1)] bg-[#141414] px-2.5 py-1 text-[10px] text-zinc-400">
            {modelLabel}
          </div>
        </div>

        <div
          className={cn(
            'overflow-hidden rounded-[20px] border bg-[#171717]/96 text-white shadow-[0_14px_40px_rgba(0,0,0,0.4)] backdrop-blur-sm transition-all',
            selected ? 'border-[#f97316]/30 shadow-[0_18px_50px_rgba(0,0,0,0.45)]' : 'border-[rgba(249,115,22,0.08)]'
          )}
        >
          {referenceCount > 0 ? (
            <div className="flex items-center gap-3 border-b border-[rgba(249,115,22,0.06)] px-4 py-3">
              <div className="flex -space-x-2.5">
                {referenceSources.slice(0, 3).map((source) => (
                  <div
                    key={`${source.name}-${source.url}`}
                    className="relative h-9 w-9 overflow-hidden rounded-xl border border-[rgba(249,115,22,0.08)] bg-[#141414]"
                  >
                    <img
                      src={source.url}
                      alt={source.name}
                      className="h-full w-full object-cover"
                    />
                    {source.type === 'video' ? (
                      <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[8px] uppercase tracking-[0.18em] text-zinc-200">
                        Video
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="rounded-full border border-[rgba(249,115,22,0.1)] bg-[#141414] px-2.5 py-1 text-[10px] text-zinc-400">
                {referenceCount}× reference{referenceCount === 1 ? '' : 's'}
              </div>
            </div>
          ) : null}

          <div className="space-y-4 p-4">
            {status === 'running' && !hasGeneratedText ? (
              <div className="space-y-2 rounded-[18px] border border-[rgba(249,115,22,0.06)] bg-[#111111] p-5">
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    className="h-2.5 animate-pulse rounded-full bg-white/8"
                    style={{ width: `${92 - row * 14}%` }}
                  />
                ))}
              </div>
            ) : null}

            {hasGeneratedText ? (
              <div className="max-h-48 overflow-y-auto rounded-[18px] border border-[rgba(249,115,22,0.06)] bg-[#111111] px-5 py-4 font-serif text-[17px] leading-7 text-zinc-100">
                {previewText}
              </div>
            ) : null}

            <div className="rounded-[18px] border border-[rgba(249,115,22,0.15)] bg-[#111111] shadow-[0_0_8px_rgba(249,115,22,0.06)]">
              <textarea
                value={promptValue}
                onChange={(event) => nodeData?.onUpdateParams?.({ prompt: event.target.value, content: event.target.value })}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className="min-h-[118px] w-full resize-none bg-transparent px-4 py-4 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                placeholder='Try "Describe this image in a few sentences"'
              />
              <div className="flex items-center justify-between border-t border-[rgba(249,115,22,0.12)] px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  {status === 'running' ? `~${Math.max(2, Math.round((100 - progress) / 6))}s` : 'Text'}
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    nodeData?.onGenerate?.();
                    nodeData?.onSelectNode?.(id);
                  }}
                  disabled={!promptValue.trim()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f97316] text-black transition-colors hover:bg-[#fb923c] disabled:cursor-not-allowed disabled:bg-[#f97316]/20 disabled:text-zinc-500"
                >
                  <SendHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BaseNode>
  );
});

ReactFlowTextNode.displayName = 'ReactFlowTextNode';
