import { memo, type MouseEvent, useCallback, useMemo } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import {
  Bookmark,
  Crop,
  Download,
  Expand,
  Lock,
  ScanText,
  Sparkles,
  Wand2,
  ZoomIn,
} from 'lucide-react';

import { BaseNode } from './BaseNode';
import { NodeRuntimeStatus } from '../status/NodeRuntimeStatus';
import { cn } from '@/lib/utils';
import { getNodeModelSelection } from '@/lib/studio/nodeUtils';
import {
  cloneImageEditParams,
  deriveImageEditOperationLabel,
  getNodeImagePreviewUrl,
  syncIncomingImageLayers,
  type ImageEditIncomingSource,
} from '@/lib/imageEdit';
import type { ImageEditNodeParams, ImageEditTool } from '@/types/imageEdit';
import type { NodeDefinition, Port, PortPosition } from '@/types/computeFlow';

type ImageEditNodeData = {
  label?: string;
  params?: Partial<ImageEditNodeParams>;
  preview?: NodeDefinition['preview'];
  status?: string;
  progress?: number;
  error?: string;
  inputs?: Port[];
  outputs?: Port[];
  incomingImageSources?: ImageEditIncomingSource[];
  incomingPrompt?: string;
  onUpdateNode?: (updates: Partial<NodeDefinition>) => void;
  onModelSelectionChange?: (selection: { auto: boolean; selectedModelIds: string[]; useMultipleModels: boolean }) => void;
  onSelectNode?: (nodeId: string) => void;
  onOpenConnectionMenu?: (sourcePortId: string, rect?: DOMRect | null) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  popoverBoundary?: HTMLElement | null;
  popoverContainer?: HTMLElement | null;
};

const checkerboardStyle = {
  backgroundImage:
    'linear-gradient(45deg, #1A1A1A 25%, transparent 25%), linear-gradient(-45deg, #1A1A1A 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1A1A1A 75%), linear-gradient(-45deg, transparent 75%, #1A1A1A 75%)',
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
  backgroundColor: '#222222',
} as const;

const EMPTY_IMAGE_SOURCES: ImageEditIncomingSource[] = [];
const IMAGE_EDIT_MODEL_WORKFLOW_TYPES = ['image-to-image', 'image-edit'];

const portPositionToReactFlow = (position: PortPosition) => {
  switch (position) {
    case 'left':
      return Position.Left;
    case 'right':
      return Position.Right;
    case 'bottom':
      return Position.Bottom;
    case 'top':
    default:
      return Position.Top;
  }
};

export const ReactFlowImageEditNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = (data ?? {}) as ImageEditNodeData;
  const onOpenConnectionMenu = nodeData.onOpenConnectionMenu;
  const onSelectNode = nodeData.onSelectNode;
  const onUpdateNode = nodeData.onUpdateNode;
  const popoverBoundary = nodeData.popoverBoundary;
  const popoverContainer = nodeData.popoverContainer;
  const incomingImageSources = nodeData.incomingImageSources ?? EMPTY_IMAGE_SOURCES;
  const baseEditorParams = useMemo(
    () => cloneImageEditParams(nodeData.params),
    [nodeData.params]
  );
  const editorParams = useMemo(() => {
    let next = baseEditorParams;

    if (nodeData.incomingPrompt && (next.pendingPrompt?.trim() ?? '').length === 0) {
      next = {
        ...next,
        pendingPrompt: nodeData.incomingPrompt,
      };
    }

    if (incomingImageSources.length > 0) {
      next = syncIncomingImageLayers(next, incomingImageSources);
    }

    return next;
  }, [
    baseEditorParams,
    incomingImageSources,
    nodeData.incomingPrompt,
  ]);
  const modelSelection = useMemo(
    () => getNodeModelSelection({ kind: 'ImageEdit', params: nodeData.params as NodeDefinition['params'] }),
    [nodeData.params]
  );

  const previewUrl = useMemo(
    () => getNodeImagePreviewUrl({ preview: nodeData.preview, params: editorParams as unknown as Record<string, unknown> }),
    [editorParams, nodeData.preview]
  );

  const buildHandles = useMemo(() => {
    const outputPorts = nodeData.outputs || [];
    const outputPortIds = new Set(outputPorts.map((output) => output.id));
    const handles = [...(nodeData.inputs || []), ...outputPorts];
    return handles.map((port) => ({
      id: port.id,
      type: outputPortIds.has(port.id) ? ('source' as const) : ('target' as const),
      position: portPositionToReactFlow(port.position),
      dataType: port.datatype,
      label: port.name,
      variant: 'flora' as const,
      onClick: outputPortIds.has(port.id)
        ? (event: MouseEvent<HTMLDivElement>) =>
            onOpenConnectionMenu?.(port.id, event.currentTarget.getBoundingClientRect())
        : undefined,
    }));
  }, [nodeData.inputs, nodeData.outputs, onOpenConnectionMenu]);

  const openDock = useCallback((tool?: ImageEditTool) => {
    if (tool) {
      const next = {
        ...editorParams,
        activeTool: tool,
      };
      onUpdateNode?.({
        params: {
          ...next,
        },
      });
    }

    onSelectNode?.(id);
  }, [editorParams, id, onSelectNode, onUpdateNode]);

  const handleDownload = useCallback(() => {
    if (!previewUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `${(nodeData.label || 'image-edit').replace(/\s+/g, '-').toLowerCase()}.png`;
    link.click();
  }, [nodeData.label, previewUrl]);

  const hoverMenu = useMemo(
    () => ({
      mediaType: 'image' as const,
      modelSelection,
      workflowTypes: IMAGE_EDIT_MODEL_WORKFLOW_TYPES,
      onModelSelectionChange: nodeData.onModelSelectionChange,
      aspectRatioLabel: editorParams.aspectRatio,
      popoverBoundary,
      popoverContainer,
      toolItems: [
        {
          key: 'enhancePrompt',
          label: 'Enhance prompt',
          icon: Sparkles,
          onClick: () => openDock('enhancePrompt'),
        },
        {
          key: 'upscale',
          label: 'Upscale',
          icon: ZoomIn,
          disabled: true,
        },
        {
          key: 'crop',
          label: 'Crop',
          icon: Crop,
          disabled: true,
        },
        {
          key: 'inpaint',
          label: 'Inpaint',
          icon: Wand2,
          onClick: () => openDock('inpaint'),
        },
        {
          key: 'outpaint',
          label: 'Outpaint',
          icon: Expand,
          disabled: true,
        },
        {
          key: 'removeBackground',
          label: 'Remove background',
          icon: ScanText,
          onClick: () => openDock('removeBackground'),
        },
        {
          key: 'splitLayers',
          label: 'Split into layers',
          icon: Sparkles,
          onClick: () => openDock('splitLayers'),
          trailing: (
            <>
              {[2, 3, 4, 5].map((count) => (
                <span key={count} className="rounded-full border border-[rgba(249,115,22,0.08)] px-1.5 py-0.5">
                  {count}
                </span>
              ))}
            </>
          ),
        },
      ],
      actionItems: [
        {
          key: 'enhance',
          icon: Sparkles,
          ariaLabel: 'Enhance prompt',
          onClick: () => openDock('enhancePrompt'),
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
          ariaLabel: 'Open editor',
          onClick: () => openDock(),
        },
      ],
    }),
    [
      editorParams.aspectRatio,
      handleDownload,
      modelSelection,
      nodeData.onModelSelectionChange,
      openDock,
      popoverBoundary,
      popoverContainer,
      previewUrl,
    ]
  );

  return (
    <BaseNode
      handles={buildHandles}
      nodeType="image"
      isSelected={selected}
      minimalChrome
      className="overflow-visible text-white"
      hoverMenu={hoverMenu}
    >
      <NodeRuntimeStatus nodeId={id} className="right-0 top-0" />
      <div className="w-[404px]">
        <div className="mb-2 flex items-center justify-between gap-3 px-1.5">
          <div className="min-w-0 truncate text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            {nodeData.label || 'Image Edit'}
          </div>
          <div className="rounded-full border border-[rgba(249,115,22,0.1)] bg-[#141414] px-2.5 py-1 text-[10px] text-zinc-400">
            {deriveImageEditOperationLabel(editorParams.lastOperation || null)}
          </div>
        </div>

        <div
          className={cn(
            'relative overflow-hidden rounded-[20px] border bg-[#171717]/96 shadow-[0_14px_40px_rgba(0,0,0,0.4)] backdrop-blur-sm transition-all',
            selected ? 'border-[#f97316]/30 shadow-[0_18px_50px_rgba(0,0,0,0.45)]' : 'border-[rgba(249,115,22,0.08)]'
          )}
          onDoubleClick={() => openDock()}
        >
          <div
            className="aspect-[16/9] w-full"
            style={checkerboardStyle}
            data-testid={`studio-image-edit-preview-${id}`}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={nodeData.label || 'Image Edit preview'}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Connect one or more images to start compositing
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-1.5 pt-3 text-[11px] text-zinc-500">
          <span>{editorParams.layers.length} layers</span>
          <span>{selected ? 'Editing in dock' : 'Select to edit'}</span>
        </div>
      </div>
    </BaseNode>
  );
});

ReactFlowImageEditNode.displayName = 'ReactFlowImageEditNode';
