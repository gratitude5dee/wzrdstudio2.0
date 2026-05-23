import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas as FabricCanvas, FabricImage } from 'fabric';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownUp,
  ArrowLeftRight,
  Download,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  GripVertical,
  Move,
  RotateCcw,
  RotateCw,
  Scissors,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import type { NodeDefinition } from '@/types/computeFlow';
import type {
  ImageEditArtifact,
  ImageEditLayer,
  ImageEditNodeParams,
  ImageEditOperation,
  ImageEditTool,
} from '@/types/imageEdit';
import { imageEditService } from '@/services/imageEditService';
import { useSaveToProjectAssets } from '@/hooks/useSaveToProjectAssets';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import { calculateGridPositions } from '@/utils/smartNodePlacement';
import {
  cloneImageEditParams,
  deriveImageEditOperationLabel,
  getImageEditCanvasSize,
  getNodeImagePreviewUrl,
  syncIncomingImageLayers,
  type ImageEditIncomingSource,
} from '@/lib/imageEdit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useStudioGraphActions } from '@/hooks/studio/useStudioGraphActions';

const TOOL_ITEMS: Array<{
  key: ImageEditTool;
  label: string;
  enabled: boolean;
}> = [
  { key: 'enhancePrompt', label: 'Enhance prompt', enabled: true },
  { key: 'upscale', label: 'Upscale', enabled: false },
  { key: 'crop', label: 'Crop', enabled: false },
  { key: 'inpaint', label: 'Inpaint', enabled: true },
  { key: 'outpaint', label: 'Outpaint', enabled: false },
  { key: 'removeBackground', label: 'Remove background', enabled: true },
  { key: 'splitLayers', label: 'Split layers', enabled: true },
];

const POSITION_BUTTONS = [
  { key: 'left', icon: AlignStartHorizontal },
  { key: 'centerX', icon: AlignCenterHorizontal },
  { key: 'right', icon: AlignEndHorizontal },
  { key: 'top', icon: AlignStartVertical },
  { key: 'centerY', icon: AlignCenterVertical },
  { key: 'bottom', icon: AlignEndVertical },
  { key: 'distributeX', icon: ArrowLeftRight },
  { key: 'distributeY', icon: ArrowDownUp },
] as const;

const checkerboardStyle = {
  backgroundImage:
    'linear-gradient(45deg, #1A1A1A 25%, transparent 25%), linear-gradient(-45deg, #1A1A1A 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1A1A1A 75%), linear-gradient(-45deg, transparent 75%, #1A1A1A 75%)',
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
  backgroundColor: '#222222',
} as const;

type FabricImageWithLayer = FabricImage & { layerId?: string };

const layerToFabricOptions = (layer: ImageEditLayer) => ({
  left: layer.position.x,
  top: layer.position.y,
  angle: layer.rotation,
  opacity: layer.opacity / 100,
  selectable: !layer.locked,
  evented: true,
  hasControls: true,
  hasBorders: true,
  transparentCorners: false,
  cornerColor: '#ffffff',
  cornerStrokeColor: '#f97316',
  borderColor: '#f97316',
  cornerSize: 10,
  lockScalingFlip: true,
  flipX: Boolean(layer.flipX),
  flipY: Boolean(layer.flipY),
  visible: layer.visible,
});

const syncLayerFromObject = (layer: ImageEditLayer, object: FabricImageWithLayer): ImageEditLayer => ({
  ...layer,
  position: {
    x: Math.round(object.left ?? 0),
    y: Math.round(object.top ?? 0),
  },
  size: {
    width: Math.round((object.width ?? layer.size.width) * (object.scaleX ?? 1)),
    height: Math.round((object.height ?? layer.size.height) * (object.scaleY ?? 1)),
  },
  rotation: Math.round(object.angle ?? 0),
  opacity: Math.round((object.opacity ?? 1) * 100),
  flipX: Boolean(object.flipX),
  flipY: Boolean(object.flipY),
});

const LayerField = ({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) => (
  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
    <span>{label}</span>
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="h-10 rounded-xl border-white/8 bg-[#1A1A1A] font-mono text-white"
      />
      {suffix ? <span className="text-[11px] text-zinc-500">{suffix}</span> : null}
    </div>
  </label>
);

interface ImageEditDockProps {
  projectId?: string;
  node: NodeDefinition;
  incomingImageSources: ImageEditIncomingSource[];
  incomingPrompt?: string;
}

export function ImageEditDock({
  projectId,
  node,
  incomingImageSources,
  incomingPrompt,
}: ImageEditDockProps) {
  const { updateNode } = useComputeFlowStore();
  const { createConnectedNode, scheduleSave } = useStudioGraphActions(projectId);
  const { saveAsset } = useSaveToProjectAssets(projectId);

  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const stageRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const persistTimeoutRef = useRef<number | null>(null);
  const isDrawingMaskRef = useRef(false);

  const [editorParams, setEditorParams] = useState<ImageEditNodeParams>(() =>
    cloneImageEditParams(node.params as Partial<ImageEditNodeParams>)
  );
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | undefined>();
  const [isPersistingComposite, setIsPersistingComposite] = useState(false);
  const [isRunningOperation, setIsRunningOperation] = useState<ImageEditOperation | null>(null);

  const canvasSize = useMemo(
    () => getImageEditCanvasSize(editorParams.aspectRatio),
    [editorParams.aspectRatio]
  );
  const previewUrl = useMemo(
    () => localPreviewUrl || getNodeImagePreviewUrl({ preview: node.preview, params: editorParams as unknown as Record<string, unknown> }),
    [editorParams, localPreviewUrl, node.preview]
  );
  const selectedLayer = useMemo(
    () => editorParams.layers.find((layer) => layer.id === editorParams.selectedLayerId) ?? null,
    [editorParams.layers, editorParams.selectedLayerId]
  );

  const persistNode = useCallback(
    (nextParams: ImageEditNodeParams, preview?: string, options?: { save?: boolean }) => {
      updateNode(node.id, {
        params: {
          ...nextParams,
        },
        ...(preview
          ? {
              preview: {
                id: `${node.id}-preview`,
                type: 'image',
                url: preview,
                data: { url: preview },
              },
            }
          : {}),
      });

      if (options?.save !== false) {
        scheduleSave();
      }
    },
    [node.id, scheduleSave, updateNode]
  );

  const applyParams = useCallback(
    (nextParams: ImageEditNodeParams, preview?: string, options?: { save?: boolean }) => {
      setEditorParams(nextParams);
      persistNode(nextParams, preview, options);
    },
    [persistNode]
  );

  useEffect(() => {
    setEditorParams(cloneImageEditParams(node.params as Partial<ImageEditNodeParams>));
    setLocalPreviewUrl(undefined);
  }, [node.id, node.params]);

  useEffect(() => {
    if (!incomingPrompt) {
      return;
    }

    setEditorParams((current) => {
      if (current.pendingPrompt?.trim().length) {
        return current;
      }

      const next = {
        ...current,
        pendingPrompt: incomingPrompt,
      };
      persistNode(next, undefined, { save: false });
      return next;
    });
  }, [incomingPrompt, persistNode]);

  useEffect(() => {
    if (incomingImageSources.length === 0) {
      return;
    }

    setEditorParams((current) => {
      const next = syncIncomingImageLayers(current, incomingImageSources);
      if (JSON.stringify(next.layers) === JSON.stringify(current.layers)) {
        return current;
      }

      persistNode(next, undefined, { save: false });
      return next;
    });
  }, [incomingImageSources, persistNode]);

  const scheduleCompositePersist = useCallback(
    (nextParams: ImageEditNodeParams) => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
      }

      persistTimeoutRef.current = window.setTimeout(async () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || !projectId) {
          return;
        }

        try {
          setIsPersistingComposite(true);
          const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
          setLocalPreviewUrl(dataUrl);

          const savedAsset = await saveAsset({
            url: dataUrl,
            type: 'image',
            name: `${node.label || 'Image Edit'} Composite`,
            prompt: nextParams.pendingPrompt || node.label,
            metadata: {
              source: 'image-edit',
              nodeId: node.id,
            },
          });

          if (!savedAsset?.url) {
            return;
          }

          const persistedParams: ImageEditNodeParams = {
            ...nextParams,
            outputAssetUrl: savedAsset.url,
            previewAssetUrl: savedAsset.url,
          };

          setLocalPreviewUrl(savedAsset.url);
          applyParams(persistedParams, savedAsset.url);
        } catch (error) {
          console.error('Failed to persist image composite', error);
        } finally {
          setIsPersistingComposite(false);
        }
      }, 700);
    },
    [applyParams, node.id, node.label, projectId, saveAsset]
  );

  const updateSelectedLayer = useCallback(
    (updater: (layer: ImageEditLayer) => ImageEditLayer, options?: { persist?: boolean }) => {
      setEditorParams((current) => {
        if (!current.selectedLayerId) {
          return current;
        }

        const next: ImageEditNodeParams = {
          ...current,
          layers: current.layers.map((layer) =>
            layer.id === current.selectedLayerId ? updater(layer) : layer
          ),
        };

        persistNode(next, undefined, { save: false });
        if (options?.persist) {
          scheduleCompositePersist(next);
        }

        return next;
      });
    },
    [persistNode, scheduleCompositePersist]
  );

  const setLayerOrder = useCallback(
    (layers: ImageEditLayer[]) => {
      const next: ImageEditNodeParams = {
        ...editorParams,
        layers: layers.map((layer, index) => ({ ...layer, zIndex: index })),
      };
      applyParams(next);
      scheduleCompositePersist(next);
    },
    [applyParams, editorParams, scheduleCompositePersist]
  );

  useEffect(() => {
    if (!stageRef.current) {
      return;
    }

    const canvas = new FabricCanvas(stageRef.current, {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      selection: false,
    });
    fabricCanvasRef.current = canvas;

    const syncSelection = () => {
      const active = canvas.getActiveObject() as FabricImageWithLayer | null;
      if (!active?.layerId) {
        return;
      }

      setEditorParams((current) => {
        if (current.selectedLayerId === active.layerId) {
          return current;
        }

        const next = {
          ...current,
          selectedLayerId: active.layerId,
        };
        persistNode(next, undefined, { save: false });
        return next;
      });
    };

    const syncModifiedLayer = () => {
      const active = canvas.getActiveObject() as FabricImageWithLayer | null;
      if (!active?.layerId) {
        return;
      }

      setEditorParams((current) => {
        const next: ImageEditNodeParams = {
          ...current,
          layers: current.layers.map((layer) =>
            layer.id === active.layerId ? syncLayerFromObject(layer, active) : layer
          ),
        };

        persistNode(next, undefined, { save: false });
        scheduleCompositePersist(next);
        return next;
      });
    };

    canvas.on('selection:created', syncSelection);
    canvas.on('selection:updated', syncSelection);
    canvas.on('object:modified', syncModifiedLayer);

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [canvasSize.height, canvasSize.width, persistNode, scheduleCompositePersist]);

  useEffect(() => {
    if (!fabricCanvasRef.current) {
      return;
    }

    const canvas = fabricCanvasRef.current;
    let cancelled = false;

    const renderLayers = async () => {
      canvas.clear();
      canvas.setDimensions({ width: canvasSize.width, height: canvasSize.height });

      const sortedLayers = [...editorParams.layers].sort((a, b) => a.zIndex - b.zIndex);
      for (const layer of sortedLayers) {
        if (!layer.visible) {
          continue;
        }

        try {
          const image = await FabricImage.fromURL(layer.sourceAssetUrl, {
            crossOrigin: 'anonymous',
          });
          if (cancelled) {
            return;
          }

          image.set({
            ...layerToFabricOptions(layer),
            scaleX: layer.size.width / (image.width || layer.size.width),
            scaleY: layer.size.height / (image.height || layer.size.height),
          });
          (image as any).layerId = layer.id;
          canvas.add(image);
        } catch (error) {
          console.error('Failed to load image edit layer', error);
        }
      }

      canvas.renderAll();

      if (editorParams.selectedLayerId) {
        const selectedObject = canvas
          .getObjects()
          .find((object) => (object as FabricImageWithLayer).layerId === editorParams.selectedLayerId);
        if (selectedObject) {
          canvas.setActiveObject(selectedObject);
          canvas.renderAll();
        }
      }
    };

    void renderLayers();

    return () => {
      cancelled = true;
    };
  }, [canvasSize.height, canvasSize.width, editorParams.layers, editorParams.selectedLayerId]);

  useEffect(() => {
    if (!maskCanvasRef.current) {
      return;
    }

    maskCanvasRef.current.width = canvasSize.width;
    maskCanvasRef.current.height = canvasSize.height;
  }, [canvasSize.height, canvasSize.width]);

  const resetMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      return;
    }

    const context = maskCanvas.getContext('2d');
    if (!context) {
      return;
    }

    context.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }, []);

  const handleMaskPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingMaskRef.current || editorParams.activeTool !== 'inpaint') {
        return;
      }

      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

      context.fillStyle = 'rgba(120, 255, 80, 0.4)';
      context.beginPath();
      context.arc(x, y, 18, 0, Math.PI * 2);
      context.fill();
    },
    [editorParams.activeTool]
  );

  const handleDownload = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const href =
      editorParams.outputAssetUrl ||
      editorParams.previewAssetUrl ||
      previewUrl ||
      canvas?.toDataURL({ format: 'png', multiplier: 1 });

    if (!href) {
      toast.error('Nothing to download yet');
      return;
    }

    const link = document.createElement('a');
    link.href = href;
    link.download = `${(node.label || 'image-edit').replace(/\s+/g, '-').toLowerCase()}.png`;
    link.click();
  }, [editorParams.outputAssetUrl, editorParams.previewAssetUrl, node.label, previewUrl]);

  const handleToolSelect = useCallback(
    (tool: ImageEditTool) => {
      const next: ImageEditNodeParams = {
        ...editorParams,
        activeTool: tool,
      };
      applyParams(next, undefined, { save: false });
      if (tool !== 'inpaint') {
        resetMask();
      }
    },
    [applyParams, editorParams, resetMask]
  );

  const handleEnhancePrompt = useCallback(async () => {
    if (!projectId) {
      toast.error('Open a project before enhancing prompts');
      return;
    }

    setIsRunningOperation('enhancePrompt');
    try {
      const response = await imageEditService.executeOperation({
        projectId,
        nodeId: node.id,
        operation: 'enhancePrompt',
        prompt: editorParams.pendingPrompt || incomingPrompt,
      });

      const next: ImageEditNodeParams = {
        ...editorParams,
        pendingPrompt: response.prompt || editorParams.pendingPrompt,
        lastOperation: 'enhancePrompt',
      };
      applyParams(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Prompt enhancement failed');
    } finally {
      setIsRunningOperation(null);
    }
  }, [applyParams, editorParams, incomingPrompt, node.id, projectId]);

  const addGeneratedLayer = useCallback(
    (asset: ImageEditArtifact, operation: Exclude<ImageEditOperation, 'enhancePrompt' | 'splitLayers'>) => {
      if (!selectedLayer) {
        return;
      }

      const generatedLayer: ImageEditLayer = {
        ...selectedLayer,
        id: crypto.randomUUID(),
        name: `${selectedLayer.name} Copy`,
        sourceAssetUrl: asset.url,
        derivedFromLayerId: selectedLayer.id,
        kind: operation === 'removeBackground' ? 'cutout' : 'generated',
        zIndex: selectedLayer.zIndex + 1,
      };

      const nextLayers = editorParams.layers
        .map((layer) =>
          layer.zIndex > selectedLayer.zIndex ? { ...layer, zIndex: layer.zIndex + 1 } : layer
        )
        .concat(generatedLayer)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((layer, index) => ({ ...layer, zIndex: index }));

      const next: ImageEditNodeParams = {
        ...editorParams,
        activeTool: operation,
        lastOperation: operation,
        selectedLayerId: generatedLayer.id,
        layers: nextLayers,
      };

      applyParams(next);
      scheduleCompositePersist(next);
    },
    [applyParams, editorParams, scheduleCompositePersist, selectedLayer]
  );

  const handleLayerOperation = useCallback(
    async (operation: Exclude<ImageEditOperation, 'enhancePrompt'>) => {
      if (!projectId) {
        toast.error('Open a project before editing images');
        return;
      }
      if (!selectedLayer) {
        toast.error('Select a layer first');
        return;
      }

      setIsRunningOperation(operation);
      try {
        const response = await imageEditService.executeOperation({
          projectId,
          nodeId: node.id,
          operation,
          imageUrl: selectedLayer.sourceAssetUrl,
          prompt: editorParams.pendingPrompt,
          maskDataUrl:
            operation === 'inpaint' ? maskCanvasRef.current?.toDataURL('image/png') : undefined,
        });

        if (operation === 'splitLayers') {
          const layers = response.layers || [];
          if (layers.length === 0) {
            toast.error('No layers returned from split');
            return;
          }

          const outputPortId =
            node.outputs.find((port) => port.datatype === 'image')?.id ??
            node.outputs[0]?.id ??
            null;

          const basePosition = {
            x: node.position.x + 520,
            y: node.position.y - 120,
          };
          const positions = calculateGridPositions(basePosition, layers.length, 280, 2);

          layers.forEach((layer, index) => {
            const seed = {
              label: layer.name || `Layer ${index + 1}`,
              params: {
                imageUrl: layer.url,
                prompt: layer.name || `Layer ${index + 1}`,
              },
              preview: {
                id: crypto.randomUUID(),
                type: 'image' as const,
                url: layer.url,
                data: { url: layer.url },
              },
            };

            if (outputPortId) {
              createConnectedNode(
                node.id,
                outputPortId,
                'image',
                positions[index] || basePosition,
                seed
              );
              return;
            }

            toast.error('Split layer created without a source connection.');
          });

          const next: ImageEditNodeParams = {
            ...editorParams,
            activeTool: 'splitLayers',
            lastOperation: 'splitLayers',
          };
          applyParams(next);
          return;
        }

        if (response.asset) {
          addGeneratedLayer(response.asset, operation);
          if (operation === 'inpaint') {
            resetMask();
          }
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Operation failed');
      } finally {
        setIsRunningOperation(null);
      }
    },
    [addGeneratedLayer, applyParams, createConnectedNode, editorParams, node.id, node.outputs, node.position.x, node.position.y, projectId, resetMask, selectedLayer]
  );

  const handleApplyTransform = useCallback(
    (key: (typeof POSITION_BUTTONS)[number]['key']) => {
      if (!selectedLayer) {
        return;
      }

      const canvas = getImageEditCanvasSize(editorParams.aspectRatio);
      updateSelectedLayer((layer) => {
        const next = { ...layer };

        if (key === 'left') next.position.x = 0;
        if (key === 'centerX') next.position.x = Math.round((canvas.width - layer.size.width) / 2);
        if (key === 'right') next.position.x = canvas.width - layer.size.width;
        if (key === 'top') next.position.y = 0;
        if (key === 'centerY') next.position.y = Math.round((canvas.height - layer.size.height) / 2);
        if (key === 'bottom') next.position.y = canvas.height - layer.size.height;
        if (key === 'distributeX') next.position.x = Math.round(canvas.width * 0.18);
        if (key === 'distributeY') next.position.y = Math.round(canvas.height * 0.18);

        return next;
      }, { persist: true });
    },
    [editorParams.aspectRatio, selectedLayer, updateSelectedLayer]
  );

  const handleReorderLayer = useCallback(
    (draggedId: string, targetId: string) => {
      if (draggedId === targetId) {
        return;
      }

      const layers = [...editorParams.layers];
      const draggedIndex = layers.findIndex((layer) => layer.id === draggedId);
      const targetIndex = layers.findIndex((layer) => layer.id === targetId);
      if (draggedIndex === -1 || targetIndex === -1) {
        return;
      }

      const [dragged] = layers.splice(draggedIndex, 1);
      layers.splice(targetIndex, 0, dragged);
      setLayerOrder(layers);
    },
    [editorParams.layers, setLayerOrder]
  );

  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[#111111]">
      <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Image Editor</div>
          <div className="mt-1 truncate text-base font-semibold text-white">{node.label}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-[#f97316]/30 bg-[#f97316]/10 text-[#d4a574]">
            {editorParams.aspectRatio}
          </Badge>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={handleDownload}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 items-center justify-center border-r border-white/6 bg-[#0A0A0A] p-5">
          <div
            className="relative w-full max-w-[560px] overflow-hidden rounded-[28px] border border-white/5"
            style={{
              aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
              ...checkerboardStyle,
            }}
          >
            <canvas ref={stageRef} className="absolute inset-0 h-full w-full" />
            {editorParams.activeTool === 'inpaint' ? (
              <canvas
                ref={maskCanvasRef}
                className="absolute inset-0 h-full w-full cursor-crosshair"
                onPointerDown={() => {
                  isDrawingMaskRef.current = true;
                }}
                onPointerUp={() => {
                  isDrawingMaskRef.current = false;
                }}
                onPointerLeave={() => {
                  isDrawingMaskRef.current = false;
                }}
                onPointerMove={handleMaskPointerMove}
              />
            ) : null}
          </div>
        </div>

        <div className="flex w-[360px] min-w-[360px] flex-col bg-[#141414]">
          <div className="border-b border-white/5 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                  Landing Page Compositing
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-white">
                  {selectedLayer?.name || 'No layer selected'}
                </div>
              </div>
              <div className="text-[11px] text-zinc-500">
                {isPersistingComposite ? 'Saving composite...' : deriveImageEditOperationLabel(editorParams.lastOperation)}
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section className="space-y-3 rounded-[20px] border border-white/6 bg-[#111111] p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Selected Layer</div>
              <div className="grid grid-cols-2 gap-3">
                <LayerField
                  label="W"
                  value={selectedLayer?.size.width || canvasSize.width}
                  onChange={(value) =>
                    updateSelectedLayer(
                      (layer) => ({
                        ...layer,
                        size: { ...layer.size, width: Math.max(1, value) },
                      }),
                      { persist: true }
                    )
                  }
                />
                <LayerField
                  label="H"
                  value={selectedLayer?.size.height || canvasSize.height}
                  onChange={(value) =>
                    updateSelectedLayer(
                      (layer) => ({
                        ...layer,
                        size: { ...layer.size, height: Math.max(1, value) },
                      }),
                      { persist: true }
                    )
                  }
                />
                <LayerField
                  label="X"
                  value={selectedLayer?.position.x || 0}
                  onChange={(value) =>
                    updateSelectedLayer(
                      (layer) => ({
                        ...layer,
                        position: { ...layer.position, x: value },
                      }),
                      { persist: true }
                    )
                  }
                />
                <LayerField
                  label="Y"
                  value={selectedLayer?.position.y || 0}
                  onChange={(value) =>
                    updateSelectedLayer(
                      (layer) => ({
                        ...layer,
                        position: { ...layer.position, y: value },
                      }),
                      { persist: true }
                    )
                  }
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-white/8 bg-[#1A1A1A] text-zinc-300 hover:bg-[#222]"
                  onClick={() =>
                    updateSelectedLayer((layer) => ({ ...layer, flipX: !layer.flipX }), {
                      persist: true,
                    })
                  }
                >
                  <FlipHorizontal2 className="mr-2 h-4 w-4" />
                  Flip H
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-white/8 bg-[#1A1A1A] text-zinc-300 hover:bg-[#222]"
                  onClick={() =>
                    updateSelectedLayer((layer) => ({ ...layer, flipY: !layer.flipY }), {
                      persist: true,
                    })
                  }
                >
                  <FlipVertical2 className="mr-2 h-4 w-4" />
                  Flip V
                </Button>
                <LayerField
                  label="Deg"
                  value={selectedLayer?.rotation || 0}
                  onChange={(value) =>
                    updateSelectedLayer((layer) => ({ ...layer, rotation: value }), {
                      persist: true,
                    })
                  }
                  suffix="dg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-white/8 bg-[#1A1A1A] text-zinc-300 hover:bg-[#222]"
                  onClick={() =>
                    updateSelectedLayer((layer) => ({ ...layer, rotation: layer.rotation + 90 }), {
                      persist: true,
                    })
                  }
                >
                  <RotateCw className="mr-2 h-4 w-4" />
                  Rotate CW
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-white/8 bg-[#1A1A1A] text-zinc-300 hover:bg-[#222]"
                  onClick={() =>
                    updateSelectedLayer((layer) => ({ ...layer, rotation: layer.rotation - 90 }), {
                      persist: true,
                    })
                  }
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Rotate CCW
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {POSITION_BUTTONS.map((button) => (
                  <button
                    key={button.key}
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-white/8 bg-[#1A1A1A] text-zinc-300 transition hover:bg-[#222] hover:text-white"
                    onClick={() => handleApplyTransform(button.key)}
                  >
                    <button.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-[20px] border border-white/6 bg-[#111111] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">Appearance</span>
                <span className="text-sm text-white">{selectedLayer?.opacity ?? 100}%</span>
              </div>
              <Slider
                value={[selectedLayer?.opacity ?? 100]}
                min={0}
                max={100}
                step={1}
                onValueChange={([value]) =>
                  updateSelectedLayer((layer) => ({ ...layer, opacity: value }), {
                    persist: true,
                  })
                }
              />
            </section>

            <section className="space-y-3 rounded-[20px] border border-white/6 bg-[#111111] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">Tools</span>
                {isRunningOperation ? (
                  <Badge variant="outline" className="border-[#f97316]/20 bg-[#f97316]/10 text-[#d4a574]">
                    Running...
                  </Badge>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start rounded-xl border-white/8 bg-[#1A1A1A] text-zinc-300 hover:bg-[#222]"
                  onClick={handleEnhancePrompt}
                  disabled={isRunningOperation !== null}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Enhance prompt
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start rounded-xl border-white/8 bg-[#1A1A1A] text-zinc-300 hover:bg-[#222]"
                  onClick={() => handleLayerOperation('removeBackground')}
                  disabled={!selectedLayer || isRunningOperation !== null}
                >
                  <Eraser className="mr-2 h-4 w-4" />
                  Remove bg
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start rounded-xl border-white/8 bg-[#1A1A1A] text-zinc-300 hover:bg-[#222]"
                  onClick={() => handleToolSelect('inpaint')}
                  disabled={!selectedLayer}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Inpaint mode
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start rounded-xl border-white/8 bg-[#1A1A1A] text-zinc-300 hover:bg-[#222]"
                  onClick={() => handleLayerOperation('splitLayers')}
                  disabled={!selectedLayer || isRunningOperation !== null}
                >
                  <Scissors className="mr-2 h-4 w-4" />
                  Split layers
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                {TOOL_ITEMS.filter((tool) => !tool.enabled).map((tool) => (
                  <div
                    key={tool.key}
                    className="flex items-center justify-center rounded-xl border border-zinc-900 bg-[#121212] px-3 py-2 text-zinc-600"
                  >
                    {tool.label}
                  </div>
                ))}
              </div>
              <Textarea
                value={editorParams.pendingPrompt}
                onChange={(event) => {
                  const next = {
                    ...editorParams,
                    pendingPrompt: event.target.value,
                  };
                  applyParams(next, undefined, { save: false });
                }}
                className="min-h-[90px] rounded-[18px] border-white/8 bg-[#1A1A1A] text-white"
                placeholder={
                  editorParams.activeTool === 'inpaint'
                    ? 'Describe what should replace the painted region...'
                    : 'Describe the edit you want to make...'
                }
              />
              {editorParams.activeTool === 'inpaint' ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    className="bg-white text-black hover:bg-zinc-200"
                    onClick={() => handleLayerOperation('inpaint')}
                    disabled={!selectedLayer || isRunningOperation !== null}
                  >
                    <Move className="mr-2 h-4 w-4" />
                    Apply inpaint
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-white/8 bg-[#1A1A1A] text-zinc-300 hover:bg-[#222]"
                    onClick={resetMask}
                  >
                    Clear mask
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-[20px] border border-white/6 bg-[#111111] p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Layers</div>
              <div className="space-y-2">
                {[...editorParams.layers]
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((layer) => (
                    <div
                      key={layer.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', layer.id);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        const draggedId = event.dataTransfer.getData('text/plain');
                        handleReorderLayer(draggedId, layer.id);
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors',
                        editorParams.selectedLayerId === layer.id
                          ? 'border-[#f97316]/40 bg-[#2A2A2A]'
                          : 'border-zinc-900 bg-[#181818] hover:bg-[#1d1d1d]'
                      )}
                      onClick={() => {
                        const next = { ...editorParams, selectedLayerId: layer.id };
                        applyParams(next, undefined, { save: false });
                      }}
                    >
                      <GripVertical className="h-4 w-4 text-zinc-500" />
                      <div className="h-10 w-10 overflow-hidden rounded-lg" style={checkerboardStyle}>
                        <img src={layer.sourceAssetUrl} alt={layer.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-white">{layer.name}</div>
                        <div className="text-[11px] text-zinc-500">
                          {layer.kind === 'generated' || layer.kind === 'cutout'
                            ? 'Generated copy'
                            : layer.kind === 'base'
                              ? 'Base layer'
                              : 'Source layer'}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageEditDock;
