import { memo, type MouseEvent } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import {
  Bookmark,
  Download,
  Expand,
  Image as ImageIcon,
  Info,
  Lock,
  SendHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react';

import { BaseNode } from './BaseNode';
import { NodeStatusBadge } from '../status/NodeStatusBadge';
import { ShotCameraControl } from './ShotCameraControl';
import { cn } from '@/lib/utils';
import type { NodeDefinition, Port, PortPosition } from '@/types/computeFlow';
import {
  getModelSummaryLabel,
  getNodeModelSelection,
  getNodePromptValue,
} from '@/lib/studio/nodeUtils';
import { type ShotControl } from '@/lib/studio/shotCamera';
import { getNodeImagePreviewUrl } from '@/lib/imageEdit';

const checkerboardStyle = {
  backgroundImage:
    'linear-gradient(45deg, #1A1A1A 25%, transparent 25%), linear-gradient(-45deg, #1A1A1A 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1A1A1A 75%), linear-gradient(-45deg, transparent 75%, #1A1A1A 75%)',
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
  backgroundColor: '#222222',
} as const;

const IMAGE_MODEL_WORKFLOW_TYPES = ['text-to-image', 'image-to-image', 'image-edit'];

type ImageNodeData = Partial<Pick<NodeDefinition, 'label' | 'params' | 'preview' | 'status' | 'progress' | 'error' | 'inputs' | 'outputs'>> & {
  incomingImageSources?: Array<{ url: string; name: string }>;
  onGenerate?: () => void;
  onModelSelectionChange?: (selection: { auto: boolean; selectedModelIds: string[]; useMultipleModels: boolean }) => void;
  onOpenConnectionMenu?: (sourcePortId: string, rect?: DOMRect | null) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdateParams?: (paramUpdates: Record<string, unknown>) => void;
  popoverBoundary?: HTMLElement | null;
  popoverContainer?: HTMLElement | null;
};

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

export const ReactFlowImageNode = memo(({ data, id, selected }: NodeProps) => {
  const nodeData = (data ?? {}) as ImageNodeData;
  const status = nodeData?.status || 'idle';
  const progress = nodeData?.progress || 0;
  const error = nodeData?.error;
  const inputPorts = (nodeData?.inputs as Port[] | undefined) ?? [];
  const outputPorts = (nodeData?.outputs as Port[] | undefined) ?? [];
  const promptValue = getNodePromptValue({ params: nodeData?.params });
  const previewUrl = getNodeImagePreviewUrl({
    preview: nodeData?.preview,
    params: nodeData?.params,
  });
  const modelSelection = getNodeModelSelection({
    kind: 'Image',
    params: nodeData?.params,
  });
  const modelLabel = getModelSummaryLabel(modelSelection);
  const title = nodeData?.label || 'Image';
  const referenceImages = (nodeData?.incomingImageSources as Array<{ url: string; name: string }> | undefined) ?? [];
  const aspectRatio = typeof nodeData?.params?.aspectRatio === 'string' ? nodeData.params.aspectRatio : 'Auto';
  const shot = (nodeData?.params?.shot ?? {}) as ShotControl;

  const handleDownload = () => {
    if (!previewUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `${title.replace(/\s+/g, '-').toLowerCase() || 'image'}.png`;
    link.click();
  };

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
      nodeType="image"
      isSelected={selected}
      minimalChrome
      className="text-white"
      hoverMenu={{
        mediaType: 'image',
        modelSelection,
        workflowTypes: IMAGE_MODEL_WORKFLOW_TYPES,
        aspectRatioLabel: aspectRatio,
        onModelSelectionChange: nodeData?.onModelSelectionChange,
        popoverBoundary: nodeData?.popoverBoundary,
        popoverContainer: nodeData?.popoverContainer,
        toolItems: [
          { key: 'enhance-prompt', label: 'Enhance prompt', icon: Sparkles, disabled: true },
          { key: 'upscale', label: 'Upscale', icon: Expand, disabled: true },
          { key: 'crop', label: 'Crop', icon: Wand2, disabled: true },
          { key: 'remove-background', label: 'Remove background', icon: Wand2, disabled: true },
          { key: 'split-layers', label: 'Split into layers', icon: Wand2, disabled: true },
        ],
        actionItems: [
          {
            key: 'generate',
            icon: Sparkles,
            ariaLabel: 'Generate',
            onClick: nodeData?.onGenerate,
          },
          {
            key: 'lock',
            icon: Lock,
            ariaLabel: 'Lock',
            disabled: true,
          },
          {
            key: 'bookmark',
            icon: Bookmark,
            ariaLabel: 'Bookmark',
            disabled: true,
          },
          {
            key: 'download',
            icon: Download,
            ariaLabel: 'Download',
            onClick: previewUrl ? handleDownload : undefined,
            disabled: !previewUrl,
          },
          {
            key: 'expand',
            icon: Expand,
            ariaLabel: 'Open node',
            onClick: () => nodeData?.onSelectNode?.(id),
          },
        ],
      }}
    >
      <NodeStatusBadge status={status} progress={progress} error={error} className="right-0 top-0" />

      <div className="w-[396px]">
        <div className="mb-2 flex items-center justify-between gap-3 px-1.5">
          <div className="flex min-w-0 items-center gap-2 text-[11px] tracking-[0.22em] text-zinc-500">
            <ImageIcon className="h-3.5 w-3.5 text-zinc-500" />
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
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2 rounded-[14px] border border-[rgba(249,115,22,0.06)] bg-[#111111] px-3 py-2 text-[11px] text-zinc-400">
              <Info className="h-3.5 w-3.5 text-[#d4a574]" />
              <span>Learn about Image Blocks</span>
            </div>

            {referenceImages.length > 0 ? (
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  {referenceImages.slice(0, 4).map((source) => (
                    <img
                      key={`${source.name}-${source.url}`}
                      src={source.url}
                      alt={source.name}
                      className="h-10 w-10 rounded-xl border border-[rgba(249,115,22,0.08)] object-cover"
                    />
                  ))}
                </div>
                <div className="rounded-full border border-[rgba(249,115,22,0.1)] bg-[#141414] px-2.5 py-1 text-[10px] text-zinc-400">
                  {referenceImages.length}× reference{referenceImages.length === 1 ? '' : 's'}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-[18px] border border-[rgba(249,115,22,0.06)]" style={checkerboardStyle}>
              {previewUrl ? (
                <img src={previewUrl} alt={nodeData?.label || 'Generated image'} className="aspect-[16/9] w-full object-cover" />
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center text-sm text-zinc-500">
                  {status === 'running' ? `Generating ${progress}%` : 'Generated image preview will appear here'}
                </div>
              )}
            </div>

            <div className="rounded-[18px] border border-[rgba(249,115,22,0.06)] bg-[#111111]">
              <textarea
                value={promptValue}
                onChange={(event) => nodeData?.onUpdateParams?.({ prompt: event.target.value })}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className="min-h-[112px] w-full resize-none bg-transparent px-4 py-4 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                placeholder='Try "A charming illustration of a small town"'
              />
              <div className="flex items-center justify-between gap-2 border-t border-[rgba(249,115,22,0.06)] px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <span className="inline-flex h-7 items-center rounded-full border border-[rgba(249,115,22,0.10)] bg-[#141414] px-2.5 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                    {aspectRatio}
                  </span>
                  {referenceImages.length > 0 ? (
                    <span className="inline-flex h-7 items-center rounded-full border border-[rgba(249,115,22,0.10)] bg-[#141414] px-2.5 text-[11px] text-zinc-400">
                      {referenceImages.length} ref
                    </span>
                  ) : null}
                  <ShotCameraControl
                    mediaType="image"
                    value={shot}
                    onChange={(next) => nodeData?.onUpdateParams?.({ shot: next })}
                    popoverContainer={nodeData?.popoverContainer}
                  />
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    nodeData?.onGenerate?.();
                  }}
                  disabled={!promptValue.trim()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-[#E8E8E8] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-zinc-500"
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

ReactFlowImageNode.displayName = 'ReactFlowImageNode';
