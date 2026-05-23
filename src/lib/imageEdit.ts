import type { NodeDefinition } from '@/types/computeFlow';
import type {
  ImageEditAspectRatio,
  ImageEditLayer,
  ImageEditNodeParams,
  ImageEditOperation,
} from '@/types/imageEdit';
import { DEFAULT_IMAGE_EDIT_PARAMS } from '@/types/imageEdit';

export interface ImageEditIncomingSource {
  sourceNodeId: string;
  name: string;
  url: string;
}

export const IMAGE_EDIT_CANVAS_SIZES: Record<
  Exclude<ImageEditAspectRatio, 'auto'>,
  { width: number; height: number }
> = {
  '16:9': { width: 960, height: 540 },
  '9:16': { width: 540, height: 960 },
  '1:1': { width: 720, height: 720 },
  '4:3': { width: 880, height: 660 },
};

export function getImageEditCanvasSize(aspectRatio: ImageEditAspectRatio) {
  if (aspectRatio === 'auto') {
    return IMAGE_EDIT_CANVAS_SIZES['16:9'];
  }
  return IMAGE_EDIT_CANVAS_SIZES[aspectRatio];
}

export function cloneImageEditParams(
  params?: Partial<ImageEditNodeParams> | null
): ImageEditNodeParams {
  const next = {
    ...DEFAULT_IMAGE_EDIT_PARAMS,
    ...(params ?? {}),
    layers: Array.isArray(params?.layers)
      ? params.layers.map((layer) => ({
          ...layer,
          position: { ...layer.position },
          size: { ...layer.size },
        }))
      : [],
  };

  next.layers.sort((a, b) => a.zIndex - b.zIndex);
  return next;
}

export function buildImageEditLayer(
  source: ImageEditIncomingSource,
  index: number,
  aspectRatio: ImageEditAspectRatio,
  kind: ImageEditLayer['kind'] = 'image'
): ImageEditLayer {
  const canvas = getImageEditCanvasSize(aspectRatio);
  const isBase = kind === 'base';
  const layerWidth = isBase ? canvas.width : Math.round(canvas.width * 0.42);
  const layerHeight = isBase ? canvas.height : Math.round(canvas.height * 0.42);

  return {
    id: crypto.randomUUID(),
    name: source.name,
    sourceNodeId: source.sourceNodeId,
    sourceAssetUrl: source.url,
    kind,
    position: isBase
      ? { x: 0, y: 0 }
      : {
          x: Math.round((canvas.width - layerWidth) / 2),
          y: Math.round((canvas.height - layerHeight) / 2),
        },
    size: {
      width: layerWidth,
      height: layerHeight,
    },
    rotation: 0,
    opacity: 100,
    visible: true,
    locked: false,
    zIndex: index,
    flipX: false,
    flipY: false,
  };
}

export function syncIncomingImageLayers(
  params: ImageEditNodeParams,
  incomingSources: ImageEditIncomingSource[]
): ImageEditNodeParams {
  if (incomingSources.length === 0) {
    return params;
  }

  const next = cloneImageEditParams(params);
  const sourcesByNode = new Map(
    incomingSources.map((source, index) => [source.sourceNodeId, { source, index }])
  );

  next.layers = next.layers
    .filter((layer) => !layer.sourceNodeId || sourcesByNode.has(layer.sourceNodeId))
    .map((layer) => {
      if (!layer.sourceNodeId) {
        return layer;
      }

      const match = sourcesByNode.get(layer.sourceNodeId);
      if (!match) {
        return layer;
      }

      return {
        ...layer,
        name: match.source.name,
        sourceAssetUrl: match.source.url,
      };
    });

  const existingSourceIds = new Set(
    next.layers.map((layer) => layer.sourceNodeId).filter(Boolean) as string[]
  );

  incomingSources.forEach((source, index) => {
    if (existingSourceIds.has(source.sourceNodeId)) {
      return;
    }

    const hasBaseLayer = next.layers.some((layer) => layer.kind === 'base');
    next.layers.push(
      buildImageEditLayer(
        source,
        next.layers.length + index,
        next.aspectRatio,
        hasBaseLayer ? 'image' : 'base'
      )
    );
  });

  next.layers = next.layers
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((layer, index) => ({ ...layer, zIndex: index }));

  if (!next.selectedLayerId && next.layers.length > 0) {
    next.selectedLayerId = next.layers[next.layers.length - 1].id;
  }

  return next;
}

export function getNodeImagePreviewUrl(
  node?: Pick<NodeDefinition, 'preview' | 'params'> | null
): string | undefined {
  if (!node) return undefined;

  const preview = node.preview as
    | { url?: string; urls?: string[]; image?: { url?: string }; data?: { url?: string } }
    | undefined;
  if (preview?.url) return preview.url;
  if (preview?.image?.url) return preview.image.url;
  if (Array.isArray(preview?.urls) && preview.urls[0]) return preview.urls[0];
  if (preview?.data && typeof preview.data === 'object' && 'url' in preview.data) {
    return String(preview.data.url);
  }

  const params = node.params as Record<string, unknown> | undefined;
  const previewAssetUrl = params?.previewAssetUrl;
  const outputAssetUrl = params?.outputAssetUrl;
  const imageUrl = params?.imageUrl;
  const imageUrls = params?.urls;

  if (typeof previewAssetUrl === 'string' && previewAssetUrl.length > 0) return previewAssetUrl;
  if (typeof outputAssetUrl === 'string' && outputAssetUrl.length > 0) return outputAssetUrl;
  if (typeof imageUrl === 'string' && imageUrl.length > 0) return imageUrl;
  if (Array.isArray(imageUrls) && typeof imageUrls[0] === 'string') return imageUrls[0];

  return undefined;
}

export function deriveImageEditOperationLabel(operation: ImageEditOperation | null) {
  switch (operation) {
    case 'enhancePrompt':
      return 'Prompt enhanced';
    case 'inpaint':
      return 'Layer inpainted';
    case 'removeBackground':
      return 'Background removed';
    case 'splitLayers':
      return 'Layers split';
    default:
      return 'Ready';
  }
}
