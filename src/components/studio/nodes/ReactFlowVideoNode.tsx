import { memo, type MouseEvent, useCallback, useMemo } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import {
  Bookmark,
  Download,
  Expand,
  Lock,
  PlayCircle,
  SendHorizontal,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react';

import { BaseNode } from './BaseNode';
import { NodeRuntimeStatus } from '../status/NodeRuntimeStatus';
import { ShotCameraControl } from './ShotCameraControl';
import { cn } from '@/lib/utils';
import type { NodeDefinition, Port, PortPosition } from '@/types/computeFlow';
import {
  getModelSummaryLabel,
  getNodeModelSelection,
  getNodePromptValue,
} from '@/lib/studio/nodeUtils';
import { type ShotControl } from '@/lib/studio/shotCamera';

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

const VIDEO_MODEL_WORKFLOW_TYPES = [
  'text-to-video',
  'image-to-video',
  'video-to-video',
  'video-edit',
  'reference-to-video',
  'video-reference',
  'talking-head',
  'lip-sync',
  'video-compose',
];
const EMPTY_PORTS: Port[] = [];
const EMPTY_PARAMS: Record<string, unknown> = {};
const EMPTY_IMAGE_SOURCES: Array<{ url: string; name: string }> = [];

type VideoNodeData = Partial<Pick<NodeDefinition, 'label' | 'params' | 'preview' | 'inputs' | 'outputs'>> & {
  incomingImageSources?: Array<{ url: string; name: string }>;
  onGenerate?: () => void;
  onModelSelectionChange?: (selection: { auto: boolean; selectedModelIds: string[]; useMultipleModels: boolean }) => void;
  onOpenConnectionMenu?: (sourcePortId: string, rect?: DOMRect | null) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdateParams?: (paramUpdates: Record<string, unknown>) => void;
  popoverBoundary?: HTMLElement | null;
  popoverContainer?: HTMLElement | null;
};

const VideoPreview = memo(({ nodeId, previewUrl, title }: { nodeId: string; previewUrl?: string; title: string }) => {
  if (previewUrl) {
    return (
      <video
        data-testid={`studio-video-preview-${nodeId}`}
        src={previewUrl}
        className="aspect-[16/9] w-full object-cover"
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <div
      className="flex aspect-[16/9] items-center justify-center gap-2 text-sm text-zinc-500"
      data-testid={`studio-video-preview-${nodeId}`}
    >
      <PlayCircle className="h-4 w-4" />
      <span>{title} preview will appear here</span>
    </div>
  );
});

VideoPreview.displayName = 'VideoPreview';

export const ReactFlowVideoNode = memo(({ data, id, selected }: NodeProps) => {
  const nodeData = (data ?? {}) as VideoNodeData;
  const onGenerate = nodeData?.onGenerate;
  const onModelSelectionChange = nodeData?.onModelSelectionChange;
  const onOpenConnectionMenu = nodeData?.onOpenConnectionMenu;
  const onSelectNode = nodeData?.onSelectNode;
  const onUpdateParams = nodeData?.onUpdateParams;
  const popoverBoundary = nodeData?.popoverBoundary;
  const popoverContainer = nodeData?.popoverContainer;
  const inputPorts = nodeData?.inputs ?? EMPTY_PORTS;
  const outputPorts = nodeData?.outputs ?? EMPTY_PORTS;
  const params = nodeData?.params ?? EMPTY_PARAMS;
  const promptValue = getNodePromptValue({ params });
  const previewUrl = nodeData?.preview?.url ?? (typeof params.videoUrl === 'string' ? params.videoUrl : undefined);
  const modelSelection = useMemo(
    () =>
      getNodeModelSelection({
        kind: 'Video',
        params,
      }),
    [params]
  );
  const modelLabel = getModelSummaryLabel(modelSelection);
  const title = nodeData?.label || 'Video';
  const referenceImages = nodeData?.incomingImageSources ?? EMPTY_IMAGE_SOURCES;
  const visibleReferenceImages = useMemo(() => referenceImages.slice(0, 4), [referenceImages]);
  const aspectRatio = typeof params.aspectRatio === 'string' ? params.aspectRatio : '16:9';
  const shot = (params?.shot ?? {}) as ShotControl;

  const handleDownload = useCallback(() => {
    if (!previewUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `${title.replace(/\s+/g, '-').toLowerCase() || 'video'}.mp4`;
    link.click();
  }, [previewUrl, title]);

  const handles = useMemo(
    () => [
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
          onOpenConnectionMenu?.(port.id, event.currentTarget.getBoundingClientRect()),
      })),
    ],
    [inputPorts, onOpenConnectionMenu, outputPorts]
  );

  const hoverMenu = useMemo(
    () => ({
      mediaType: 'video' as const,
      modelSelection,
      workflowTypes: VIDEO_MODEL_WORKFLOW_TYPES,
      aspectRatioLabel: aspectRatio,
      onModelSelectionChange,
      popoverBoundary,
      popoverContainer,
      toolItems: [
        { key: 'enhance-prompt', label: 'Enhance prompt', icon: Sparkles, disabled: true },
        { key: 'upscale', label: 'Upscale', icon: Expand, disabled: true },
        { key: 'crop', label: 'Crop', icon: Wand2, disabled: true },
        { key: 'outpaint', label: 'Outpaint', icon: Wand2, disabled: true },
      ],
      actionItems: [
        {
          key: 'generate',
          icon: PlayCircle,
          ariaLabel: 'Generate',
          onClick: onGenerate,
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
          onClick: () => onSelectNode?.(id),
        },
      ],
    }),
    [
      aspectRatio,
      handleDownload,
      id,
      modelSelection,
      onGenerate,
      onModelSelectionChange,
      onSelectNode,
      popoverBoundary,
      popoverContainer,
      previewUrl,
    ]
  );

  return (
    <BaseNode
      handles={handles}
      nodeType="video"
      isSelected={selected}
      minimalChrome
      className="text-white"
      hoverMenu={hoverMenu}
    >
      <NodeRuntimeStatus nodeId={id} className="right-0 top-0" />

      <div className="w-[396px]">
        <div className="mb-2 flex items-center justify-between gap-3 px-1.5">
          <div className="flex min-w-0 items-center gap-2 text-[11px] tracking-[0.22em] text-zinc-500">
            <Video className="h-3.5 w-3.5 text-zinc-500" />
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
            {referenceImages.length > 0 ? (
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  {visibleReferenceImages.map((source) => (
                    <img
                      key={`${source.name}-${source.url}`}
                      src={source.url}
                      alt={source.name}
                      className="h-10 w-10 rounded-xl border border-[rgba(249,115,22,0.08)] object-cover"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  ))}
                </div>
                <div className="rounded-full border border-[rgba(249,115,22,0.1)] bg-[#141414] px-2.5 py-1 text-[10px] text-zinc-400">
                  {referenceImages.length}× reference{referenceImages.length === 1 ? '' : 's'}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-[18px] border border-[rgba(249,115,22,0.06)] bg-[#111111]">
              <VideoPreview nodeId={id} previewUrl={previewUrl} title="Generated video" />
            </div>

            <div className="rounded-[18px] border border-[rgba(249,115,22,0.06)] bg-[#111111]">
              <textarea
                value={promptValue}
                onChange={(event) => onUpdateParams?.({ prompt: event.target.value })}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className="nodrag nowheel min-h-[112px] w-full resize-none bg-transparent px-4 py-4 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                placeholder='Describe the shot, motion, and atmosphere...'
              />
              <div className="flex items-center justify-between gap-2 border-t border-[rgba(249,115,22,0.06)] px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <span className="inline-flex h-7 items-center rounded-full border border-[rgba(249,115,22,0.10)] bg-[#141414] px-2.5 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                    {aspectRatio}
                  </span>
                  <span className="inline-flex h-7 items-center rounded-full border border-[rgba(249,115,22,0.10)] bg-[#141414] px-2.5 text-[11px] text-zinc-400">
                    {referenceImages.length > 0 ? 'I2V' : 'T2V'}
                  </span>
                  <ShotCameraControl
                    mediaType="video"
                    value={shot}
                    onChange={(next) => onUpdateParams?.({ shot: next })}
                    popoverContainer={popoverContainer}
                  />
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onGenerate?.();
                  }}
                  disabled={!promptValue.trim()}
                  className="nodrag inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-[#E8E8E8] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-zinc-500"
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

ReactFlowVideoNode.displayName = 'ReactFlowVideoNode';
