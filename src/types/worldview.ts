// ---------------------------------------------------------------------------
// Worldview — Type definitions for the 3D World Shot Compositor
// ---------------------------------------------------------------------------

// ---- World Models ---------------------------------------------------------

export type WorldModel = 'Marble 0.1-plus' | 'Marble 0.1-mini';

// ---- World Prompt ---------------------------------------------------------

export interface WorldPromptText {
  kind: 'text';
  text: string;
}

export interface WorldPromptImage {
  kind: 'image';
  imageUrl: string;
  text?: string;
}

export type WorldPrompt = WorldPromptText | WorldPromptImage;

// ---- World Assets ---------------------------------------------------------

export interface WorldAssets {
  thumbnailUrl?: string;
  panoramaUrl?: string;
  viewerUrl?: string;
  splatUrl?: string;
  caption?: string;
}

// ---- World ----------------------------------------------------------------

export interface World {
  id: string;
  displayName: string;
  model: WorldModel;
  prompt: WorldPrompt;
  assets: WorldAssets;
  createdAt: string;
  externalId?: string;
}

// ---- World Operation ------------------------------------------------------

export type WorldOperationStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorldOperation {
  id: string;
  worldId?: string;
  status: WorldOperationStatus;
  description?: string;
  progress?: number;
  error?: string;
}

// ---- Camera ---------------------------------------------------------------

export type LensType = '24mm' | '35mm' | '50mm' | '85mm' | '135mm';
export type ApertureType = 'f/1.4' | 'f/1.8' | 'f/2.8' | 'f/4' | 'f/8';
export type AspectRatioType = '16:9' | '4:3' | '1:1' | '2.39:1' | '9:16';

export interface CameraSettings {
  lens: LensType;
  aperture: ApertureType;
  aspectRatio: AspectRatioType;
  zoom: number;
}

export interface CameraTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  fov: number;
}

// ---- Scene / Take / Shot --------------------------------------------------

export type TakeStatus = 'capturing' | 'ready' | 'failed';
export type ShotStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface WorldviewTake {
  id: string;
  sceneId: string;
  imageUrl: string;
  camera: CameraSettings;
  cameraTransform: CameraTransform;
  status: TakeStatus;
  createdAt: string;
}

export interface GeneratedImage {
  url: string;
  width: number;
  height: number;
}

export interface GeneratedShot {
  id: string;
  sceneId: string;
  takeId?: string;
  prompt: string;
  model: GenerationModel;
  status: ShotStatus;
  images: GeneratedImage[];
  createdAt: string;
}

export interface CharacterRef {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface WorldviewScene {
  id: string;
  name: string;
  worldId?: string;
  takes: WorldviewTake[];
  generatedShots: GeneratedShot[];
  createdAt: string;
  generationError: string | null;
  showCreator: boolean;
}

// ---- Generation Models ----------------------------------------------------

export type GenerationModel =
  | 'nano-banana'
  | 'fal-ai/flux/dev'
  | 'fal-ai/flux-pro/v1.1-ultra'
  | 'fal-ai/omnigen-v1';

export type ResolutionType = '512' | '1K' | '2K' | '4K';

// ---- Store State ----------------------------------------------------------

export type WorldviewMode = 'canvas' | 'world-viewer' | 'shot-composer';

export interface WorldviewState {
  // View
  mode: WorldviewMode;

  // Scenes
  scenes: WorldviewScene[];
  activeSceneId: string | null;

  // Worlds
  worlds: World[];
  activeWorldId: string | null;

  // Takes
  activeTakeId: string | null;

  // Characters
  characters: CharacterRef[];

  // Camera
  camera: CameraSettings;
  cameraTransform: CameraTransform;

  // Flags
  motionEnabled: boolean;
  capturing: boolean;
  generatingShot: boolean;
}

// ---- Const Arrays ---------------------------------------------------------

export const GENERATION_MODELS: readonly { id: GenerationModel; name: string; icon: string }[] = [
  { id: 'nano-banana', name: 'Nano Banana', icon: '🍌' },
  { id: 'fal-ai/flux/dev', name: 'Flux Dev', icon: '⚡' },
  { id: 'fal-ai/flux-pro/v1.1-ultra', name: 'Flux Pro Ultra', icon: '🔥' },
  { id: 'fal-ai/omnigen-v1', name: 'OmniGen', icon: '🌀' },
] as const;

export const LENS_OPTIONS: readonly { value: LensType; fov: number }[] = [
  { value: '24mm', fov: 84 },
  { value: '35mm', fov: 63 },
  { value: '50mm', fov: 47 },
  { value: '85mm', fov: 28 },
  { value: '135mm', fov: 18 },
] as const;

export const APERTURE_OPTIONS: readonly { value: ApertureType }[] = [
  { value: 'f/1.4' },
  { value: 'f/1.8' },
  { value: 'f/2.8' },
  { value: 'f/4' },
  { value: 'f/8' },
] as const;

export const ASPECT_RATIO_OPTIONS: readonly { value: AspectRatioType; ratio: number }[] = [
  { value: '16:9', ratio: 16 / 9 },
  { value: '4:3', ratio: 4 / 3 },
  { value: '1:1', ratio: 1 },
  { value: '2.39:1', ratio: 2.39 },
  { value: '9:16', ratio: 9 / 16 },
] as const;
