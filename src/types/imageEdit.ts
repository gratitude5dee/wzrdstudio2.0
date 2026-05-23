export type ImageEditAspectRatio = 'auto' | '16:9' | '9:16' | '1:1' | '4:3';

export type ImageEditTool =
  | 'enhancePrompt'
  | 'upscale'
  | 'crop'
  | 'inpaint'
  | 'outpaint'
  | 'removeBackground'
  | 'splitLayers'
  | 'productPlacement';

export type ImageEditOperation = ImageEditTool;

export type ImageEditLayerKind = 'base' | 'image' | 'generated' | 'cutout';

export interface ImageEditLayer {
  id: string;
  name: string;
  sourceAssetUrl: string;
  kind: ImageEditLayerKind;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  flipX?: boolean;
  flipY?: boolean;
  sourceNodeId?: string;
  derivedFromLayerId?: string;
}

export interface ImageEditNodeParams {
  aspectRatio: ImageEditAspectRatio;
  activeTool: ImageEditTool;
  lastOperation: ImageEditOperation | null;
  pendingPrompt: string;
  layers: ImageEditLayer[];
  selectedLayerId?: string;
  previewAssetUrl?: string;
  outputAssetUrl?: string;
}

export interface ImageEditArtifact {
  url: string;
  name?: string;
}

export interface ImageEditOperationRequest {
  projectId: string;
  nodeId: string;
  operation: ImageEditOperation;
  prompt?: string;
  imageUrl?: string;
  maskDataUrl?: string;
  modelId?: string;
  productImageUrl?: string;
}

export interface ImageEditOperationResponse {
  prompt?: string;
  asset?: ImageEditArtifact;
  layers?: ImageEditArtifact[];
}

export const DEFAULT_IMAGE_EDIT_PARAMS: ImageEditNodeParams = {
  aspectRatio: '16:9',
  activeTool: 'enhancePrompt',
  lastOperation: null,
  pendingPrompt: '',
  layers: [],
  selectedLayerId: undefined,
  previewAssetUrl: undefined,
  outputAssetUrl: undefined,
};
