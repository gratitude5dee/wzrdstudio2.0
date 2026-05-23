import {
  getCatalogModelById,
  listCatalogModels,
  toKanvasCatalogModel,
} from './ai-model-catalog.ts';
import { extractGmiElementId, extractGmiMedia } from './gmi-types.ts';
import type { CatalogSurface } from './ai-model-catalog.ts';

export type KanvasStudio = 'image' | 'video' | 'edit' | 'cinema' | 'lipsync';
export type KanvasMode =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'reference-to-video'
  | 'cinematic-image'
  | 'talking-head'
  | 'lip-sync';

export type KanvasJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type KanvasAssetType = 'image' | 'video' | 'audio';
export type KanvasMediaType = 'image' | 'video';

export interface KanvasSelectOption {
  label: string;
  value: string | number | boolean;
}

export interface KanvasControlDefinition {
  key: string;
  label: string;
  type: 'select' | 'number' | 'boolean';
  defaultValue?: string | number | boolean;
  options?: KanvasSelectOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface KanvasStudioModel {
  id: string;
  name: string;
  description: string;
  studio: KanvasStudio;
  mode: KanvasMode;
  mediaType: KanvasMediaType;
  workflowType: string;
  uiGroup: 'generation' | 'advanced';
  credits: number;
  requiresAssets: KanvasAssetType[];
  supportsPrompt: boolean;
  controls: KanvasControlDefinition[];
  defaults: Record<string, unknown>;
  aliases: string[];
}

export interface KanvasAssetRecord {
  id: string;
  userId: string;
  projectId: string | null;
  assetType: KanvasAssetType;
  originalFileName: string;
  url: string;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown>;
}

export interface KanvasReferenceAsset {
  assetId?: string;
  url: string;
  type: KanvasAssetType | 'model';
  role: string;
}

export interface KanvasCinemaSettings {
  camera: string;
  lens: string;
  focalLength: number;
  aperture: string;
}

export interface KanvasGenerationBase {
  projectId?: string | null;
  modelId: string;
  settings?: Record<string, unknown>;
  elementIds?: string[];
  referenceAssets?: KanvasReferenceAsset[];
  referenceBlueprintIds?: string[];
  generationRole?: string;
}

export interface KanvasTextToImageRequest extends KanvasGenerationBase {
  studio: 'image';
  mode: 'text-to-image';
  prompt: string;
}

export interface KanvasImageToImageRequest extends KanvasGenerationBase {
  studio: 'image';
  mode: 'image-to-image';
  prompt?: string;
  assetSelections: {
    imageIds: string[];
  };
}

export interface KanvasTextToVideoRequest extends KanvasGenerationBase {
  studio: 'video';
  mode: 'text-to-video';
  prompt: string;
}

export interface KanvasImageToVideoRequest extends KanvasGenerationBase {
  studio: 'video';
  mode: 'image-to-video';
  prompt?: string;
  assetSelections: {
    imageId: string;
  };
}

export interface KanvasReferenceToVideoRequest extends KanvasGenerationBase {
  studio: 'video';
  mode: 'reference-to-video';
  prompt?: string;
  assetSelections: {
    assetId: string;
  };
}

export interface KanvasCinemaRequest extends KanvasGenerationBase {
  studio: 'cinema';
  mode: 'cinematic-image';
  prompt: string;
  cinema: KanvasCinemaSettings;
  assetSelections?: {
    imageIds: string[];
  };
}

export interface KanvasTalkingHeadRequest extends KanvasGenerationBase {
  studio: 'lipsync';
  mode: 'talking-head';
  prompt?: string;
  assetSelections: {
    imageId?: string;
    audioId: string;
  };
}

export interface KanvasLipSyncRequest extends KanvasGenerationBase {
  studio: 'lipsync';
  mode: 'lip-sync';
  prompt?: string;
  assetSelections: {
    videoId: string;
    audioId: string;
  };
}

export type KanvasGenerationRequest =
  | KanvasTextToImageRequest
  | KanvasImageToImageRequest
  | KanvasTextToVideoRequest
  | KanvasImageToVideoRequest
  | KanvasReferenceToVideoRequest
  | KanvasCinemaRequest
  | KanvasTalkingHeadRequest
  | KanvasLipSyncRequest;

export interface KanvasOutputFile {
  url: string;
  contentType?: string;
  fileName?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface KanvasNormalizedResult {
  mediaType: KanvasMediaType;
  primaryUrl: string;
  previewUrl: string;
  outputs: KanvasOutputFile[];
  thumbnailUrl?: string;
  elementId?: string;
  raw: unknown;
}

export interface KanvasQueueConfig {
  statusUrl: string | null;
  responseUrl: string | null;
}

export interface KanvasBillingConfig {
  holdId: string | null;
  skipped: boolean;
  amount: number;
}

export interface KanvasJobConfig {
  request: KanvasGenerationRequest;
  queue: KanvasQueueConfig;
  billing: KanvasBillingConfig;
}

export interface KanvasJobRecord {
  id: string;
  userId: string;
  projectId: string | null;
  studio: KanvasStudio;
  modelId: string;
  externalRequestId: string | null;
  jobType: KanvasMediaType;
  status: KanvasJobStatus;
  progress: number | null;
  resultUrl: string | null;
  errorMessage: string | null;
  config: KanvasJobConfig;
  inputAssets: string[];
  resultPayload: KanvasNormalizedResult | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface KanvasJobInsert {
  id: string;
  userId: string;
  projectId: string | null;
  studio: KanvasStudio;
  modelId: string;
  externalRequestId: string | null;
  jobType: KanvasMediaType;
  status: KanvasJobStatus;
  progress: number;
  resultUrl: string | null;
  errorMessage: string | null;
  config: KanvasJobConfig;
  inputAssets: string[];
  resultPayload: KanvasNormalizedResult | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface KanvasJobUpdate {
  status?: KanvasJobStatus;
  progress?: number | null;
  resultUrl?: string | null;
  errorMessage?: string | null;
  externalRequestId?: string | null;
  resultPayload?: KanvasNormalizedResult | null;
  completedAt?: string | null;
  startedAt?: string | null;
  updatedAt: string;
  config?: KanvasJobConfig;
}

export interface KanvasJobRepository {
  getAssetById(assetId: string, userId: string): Promise<KanvasAssetRecord | null>;
  insertJob(job: KanvasJobInsert): Promise<KanvasJobRecord>;
  updateJob(jobId: string, updates: KanvasJobUpdate): Promise<KanvasJobRecord>;
  getJob(jobId: string, userId: string): Promise<KanvasJobRecord | null>;
  saveGeneratedAsset?(input: {
    userId: string;
    projectId: string | null;
    jobId: string;
    modelId: string;
    mediaType: KanvasMediaType;
    url: string;
    thumbnailUrl?: string | null;
    generationRole?: string | null;
  }): Promise<string | null>;
  linkBlueprintImage?(input: {
    blueprintId: string;
    assetId: string | null;
    imageUrl: string;
    generationRole: string;
    generationMetadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface KanvasReservation {
  holdId: string | null;
  skipped: boolean;
}

export interface KanvasSubmitResponse {
  success: boolean;
  requestId?: string;
  statusUrl?: string | null;
  responseUrl?: string | null;
  data?: unknown;
  error?: string;
}

export interface KanvasPollResponse {
  success: boolean;
  status?: string;
  queuePosition?: number;
  result?: unknown;
  logs?: unknown[];
  error?: string;
}

export interface KanvasCreditsAdapter {
  reserve(input: {
    userId: string;
    modelId: string;
    resourceType: KanvasMediaType;
    referenceId: string;
    amount: number;
  }): Promise<KanvasReservation>;
  commit(input: {
    userId: string;
    holdId: string | null;
    skipped: boolean;
    amount: number;
    requestId: string | null;
    modelId: string;
  }): Promise<void>;
  release(input: {
    userId: string;
    holdId: string | null;
    skipped: boolean;
    amount: number;
    reason: string;
    requestId: string | null;
    modelId: string;
  }): Promise<void>;
}

export interface KanvasFalAdapter {
  submit(modelId: string, input: Record<string, unknown>): Promise<KanvasSubmitResponse>;
  poll(requestId: string, statusUrl?: string | null): Promise<KanvasPollResponse>;
  fetchResult(responseUrl: string): Promise<unknown>;
}

export interface KanvasServiceDeps {
  now(): string;
  randomId(): string;
  getCost(modelId: string, mediaType: KanvasMediaType): number;
  credits: KanvasCreditsAdapter;
  fal: KanvasFalAdapter;
}

const baseAspectRatios: KanvasSelectOption[] = [
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

const imageResolutions: KanvasSelectOption[] = [
  { label: '1K', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
];

const videoDurations: KanvasSelectOption[] = [
  { label: '5 sec', value: 5 },
  { label: '8 sec', value: 8 },
  { label: '10 sec', value: 10 },
];

const videoResolutions: KanvasSelectOption[] = [
  { label: '480p', value: '480p' },
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
];

const ltxDurations: KanvasSelectOption[] = [
  { label: '6 sec', value: 6 },
  { label: '8 sec', value: 8 },
  { label: '10 sec', value: 10 },
  { label: '12 sec', value: 12 },
  { label: '14 sec', value: 14 },
  { label: '16 sec', value: 16 },
  { label: '18 sec', value: 18 },
  { label: '20 sec', value: 20 },
];

const ltxFastResolutions: KanvasSelectOption[] = [
  { label: '1080p', value: '1920x1080' },
  { label: '1440p', value: '2560x1440' },
  { label: '4K', value: '3840x2160' },
];

const ltxFpsOptions: KanvasSelectOption[] = [
  { label: '25 FPS', value: 25 },
  { label: '50 FPS', value: 50 },
];

const ltxCameraMotionOptions: KanvasSelectOption[] = [
  { label: 'Auto', value: '' },
  { label: 'Dolly In', value: 'dolly_in' },
  { label: 'Dolly Out', value: 'dolly_out' },
  { label: 'Dolly Left', value: 'dolly_left' },
  { label: 'Dolly Right', value: 'dolly_right' },
  { label: 'Jib Up', value: 'jib_up' },
  { label: 'Jib Down', value: 'jib_down' },
  { label: 'Static', value: 'static' },
  { label: 'Focus Shift', value: 'focus_shift' },
];

export const KANVAS_CAMERAS: Record<string, string> = {
  'Modular 8K Digital': 'modular 8K digital cinema camera',
  'Full-Frame Cine Digital': 'full-frame digital cinema camera',
  'Grand Format 70mm Film': 'grand format 70mm film camera',
  'Studio Digital S35': 'Super 35 studio digital camera',
  'Classic 16mm Film': 'classic 16mm film camera',
  'Premium Large Format Digital': 'premium large-format digital cinema camera',
};

export const KANVAS_LENSES: Record<string, string> = {
  'Creative Tilt Lens': 'creative tilt lens effect',
  'Compact Anamorphic': 'compact anamorphic lens',
  'Extreme Macro': 'extreme macro lens',
  '70s Cinema Prime': '1970s cinema prime lens',
  'Classic Anamorphic': 'classic anamorphic lens',
  'Premium Modern Prime': 'premium modern prime lens',
  'Warm Cinema Prime': 'warm-toned cinema prime lens',
  'Swirl Bokeh Portrait': 'swirl bokeh portrait lens',
  'Vintage Prime': 'vintage prime lens',
  'Halation Diffusion': 'halation diffusion filter',
  'Clinical Sharp Prime': 'ultra-sharp clinical prime lens',
};

const FOCAL_PERSPECTIVES: Record<number, string> = {
  8: 'ultra-wide perspective',
  14: 'wide-angle perspective',
  24: 'wide-angle dynamic perspective',
  35: 'natural cinematic perspective',
  50: 'standard portrait perspective',
  85: 'classic portrait perspective',
};

const APERTURE_EFFECTS: Record<string, string> = {
  'f/1.4': 'shallow depth of field, creamy bokeh',
  'f/4': 'balanced depth of field',
  'f/11': 'deep focus clarity, sharp foreground to background',
};

function selectControl(
  key: string,
  label: string,
  options: KanvasSelectOption[],
  defaultValue?: string | number | boolean
): KanvasControlDefinition {
  return { key, label, type: 'select', options, defaultValue };
}

function booleanControl(
  key: string,
  label: string,
  defaultValue = false
): KanvasControlDefinition {
  return { key, label, type: 'boolean', defaultValue };
}

function studioModel(input: KanvasStudioModel): KanvasStudioModel {
  return input;
}

export const KANVAS_MODELS: KanvasStudioModel[] = [
  // ===================== IMAGE — text-to-image =====================
  studioModel({
    id: 'fal-ai/flux-pro/v2',
    name: 'FLUX.2 Pro',
    description: 'Maximum quality photorealism from Black Forest Labs.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 7, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('resolution', 'Resolution', imageResolutions, '2K'),
    ],
    defaults: { aspect_ratio: '16:9', resolution: '2K', output_format: 'png', num_images: 1, num_inference_steps: 50, guidance_scale: 3.5 },
    aliases: ['flux-2-pro'],
  }),
  studioModel({
    id: 'fal-ai/flux-pro/v1.1',
    name: 'FLUX.2 Pro v1.1',
    description: 'Highest quality FLUX variant. ELO 1265.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 9, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9', output_format: 'png', num_images: 1, num_inference_steps: 50 },
    aliases: ['flux-2-pro-v1-1'],
  }),
  studioModel({
    id: 'fal-ai/flux-pro/v2/flex',
    name: 'FLUX.2 Flex',
    description: 'Adjustable steps and guidance. Enhanced typography.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 6, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9', output_format: 'png', num_images: 1, num_inference_steps: 28 },
    aliases: ['flux-2-flex'],
  }),
  studioModel({
    id: 'fal-ai/flux/dev',
    name: 'FLUX.1 Dev',
    description: 'Fast dev model with LoRA support.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 5, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9', output_format: 'png', num_images: 1, num_inference_steps: 28 },
    aliases: ['flux-1-dev'],
  }),
  studioModel({
    id: 'fal-ai/flux/schnell',
    name: 'FLUX.1 Schnell',
    description: '12B params, 1-4 steps. Ultra-fast.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 2, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9', output_format: 'png', num_images: 1, num_inference_steps: 4 },
    aliases: ['flux-1-schnell'],
  }),
  studioModel({
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro',
    description: 'Google Gemini 3 Pro. Multimodal reasoning. 4K.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 7, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', [...baseAspectRatios, { label: '3:2', value: '3:2' }, { label: '2:3', value: '2:3' }], '3:4'),
      selectControl('resolution', 'Resolution', imageResolutions, '2K'),
    ],
    defaults: { aspect_ratio: '3:4', resolution: '2K', output_format: 'png', num_images: 1 },
    aliases: ['nano-banana-pro', 'google/gemini-2.5-flash-image'],
  }),
  studioModel({
    id: 'fal-ai/nano-banana-2',
    name: 'Nano Banana 2',
    description: 'Gemini 3.1 Flash. Fast + Pro quality. 4K.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 5, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '3:4')],
    defaults: { aspect_ratio: '3:4', output_format: 'png', num_images: 1 },
    aliases: ['nano-banana-2'],
  }),
  studioModel({
    id: 'fal-ai/gpt-image-1-5',
    name: 'GPT Image 1.5',
    description: 'Highest photorealism. ELO 1264. Best text rendering.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 8, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9', quality: 'standard' },
    aliases: ['gpt-image-1-5'],
  }),
  studioModel({
    id: 'fal-ai/qwen-image-2/text-to-image',
    name: 'Qwen Image 2',
    description: 'Balanced text-to-image for stylized and realistic scenes.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 5, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9', output_format: 'png', num_images: 1 },
    aliases: ['qwen-image-2'],
  }),
  studioModel({
    id: 'fal-ai/ideogram/v3',
    name: 'Ideogram V3',
    description: 'Best text rendering and typography.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 5, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['ideogram-v3'],
  }),
  studioModel({
    id: 'fal-ai/seedream-4-5',
    name: 'Seedream 4.5',
    description: 'ByteDance unified generation and editing.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 6, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['seedream-4-5'],
  }),
  studioModel({
    id: 'fal-ai/recraft/v3',
    name: 'Recraft V3',
    description: 'Design-focused with SVG vector support.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 5, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['recraft-v3'],
  }),

  // ===================== IMAGE — image-to-image =====================
  studioModel({
    id: 'fal-ai/flux-pro/kontext',
    name: 'FLUX Kontext Pro',
    description: 'Reference image editing and scene transformations.',
    studio: 'image', mode: 'image-to-image', mediaType: 'image', workflowType: 'image-edit', uiGroup: 'advanced',
    credits: 8, requiresAssets: ['image'], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['flux-kontext-pro', 'flux-1-kontext-pro'],
  }),
  studioModel({
    id: 'fal-ai/flux/kontext/dev',
    name: 'FLUX Kontext Dev',
    description: 'Fast Kontext with LoRA support.',
    studio: 'image', mode: 'image-to-image', mediaType: 'image', workflowType: 'image-edit', uiGroup: 'advanced',
    credits: 6, requiresAssets: ['image'], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['flux-kontext-dev'],
  }),
  studioModel({
    id: 'fal-ai/nano-banana-pro/edit',
    name: 'Nano Banana Pro Edit',
    description: 'Premium semantic editing.',
    studio: 'image', mode: 'image-to-image', mediaType: 'image', workflowType: 'image-edit', uiGroup: 'advanced',
    credits: 8, requiresAssets: ['image'], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('resolution', 'Resolution', imageResolutions, '2K'),
    ],
    defaults: { aspect_ratio: '16:9', resolution: '2K', output_format: 'png' },
    aliases: ['nano-banana-edit', 'nano-banana-pro-edit'],
  }),
  studioModel({
    id: 'fal-ai/nano-banana-2/edit',
    name: 'NB2 Edit',
    description: 'Semantic editing with 14 reference images.',
    studio: 'image', mode: 'image-to-image', mediaType: 'image', workflowType: 'image-edit', uiGroup: 'advanced',
    credits: 7, requiresAssets: ['image'], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['nano-banana-2-edit'],
  }),
  studioModel({
    id: 'fal-ai/gpt-image-1-5/edit',
    name: 'GPT 1.5 Edit',
    description: 'Budget image editing from OpenAI.',
    studio: 'image', mode: 'image-to-image', mediaType: 'image', workflowType: 'image-edit', uiGroup: 'advanced',
    credits: 4, requiresAssets: ['image'], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['gpt-image-1-5-edit'],
  }),
  studioModel({
    id: 'fal-ai/qwen-image-2/edit',
    name: 'Qwen Image 2 Edit',
    description: 'Prompt-guided image transformations.',
    studio: 'image', mode: 'image-to-image', mediaType: 'image', workflowType: 'image-edit', uiGroup: 'advanced',
    credits: 6, requiresAssets: ['image'], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9', output_format: 'png' },
    aliases: ['gpt4o-image-to-image'],
  }),
  studioModel({
    id: 'fal-ai/seedream-5-lite/edit',
    name: 'Seedream 5 Edit',
    description: 'Fast editing from Seedream 5.',
    studio: 'image', mode: 'image-to-image', mediaType: 'image', workflowType: 'image-edit', uiGroup: 'advanced',
    credits: 6, requiresAssets: ['image'], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['seedream-5.0-edit', 'seedream-5-lite-edit'],
  }),
  studioModel({
    id: 'fal-ai/grok-imagine/edit',
    name: 'Grok Edit',
    description: 'Budget editing from xAI.',
    studio: 'image', mode: 'image-to-image', mediaType: 'image', workflowType: 'image-edit', uiGroup: 'advanced',
    credits: 5, requiresAssets: ['image'], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['grok-imagine-edit'],
  }),

  // ===================== VIDEO — text-to-video =====================
  studioModel({
    id: 'fal-ai/kling-video/v3/pro/text-to-video',
    name: 'Kling 3.0 Pro',
    description: 'Top-tier T2V with native audio and multi-shot.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 30, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', videoDurations, 5),
      booleanControl('generate_audio', 'Generate Audio', true),
    ],
    defaults: { aspect_ratio: '16:9', duration: '5', generate_audio: true },
    aliases: ['kling-3-0-pro-t2v'],
  }),
  studioModel({
    id: 'fal-ai/kling-video/v3/omni',
    name: 'Kling 3.0 Omni',
    description: 'Multi-modal Kling variant.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 25, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', videoDurations, 5),
      booleanControl('generate_audio', 'Generate Audio', true),
    ],
    defaults: { aspect_ratio: '16:9', duration: '5', generate_audio: true },
    aliases: ['kling-3-0-omni'],
  }),
  studioModel({
    id: 'fal-ai/kling-video/o3/standard/text-to-video',
    name: 'Kling O3 Standard',
    description: 'Fast text-to-video generation.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 22, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', videoDurations, 5),
      booleanControl('generate_audio', 'Generate Audio', true),
    ],
    defaults: { aspect_ratio: '16:9', duration: '5', generate_audio: true },
    aliases: ['kling-2-1', 'kling-v3.0-standard-text-to-video'],
  }),
  studioModel({
    id: 'fal-ai/kling-video/o3/pro/text-to-video',
    name: 'Kling O3 Pro',
    description: 'Cinema-grade text-to-video.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 32, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', videoDurations, 5),
      booleanControl('generate_audio', 'Generate Audio', true),
    ],
    defaults: { aspect_ratio: '16:9', duration: '5', generate_audio: true },
    aliases: ['kling-o3-pro-t2v'],
  }),
  studioModel({
    id: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    name: 'Kling 2.5 Turbo',
    description: 'Fast turbo T2V.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 22, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', videoDurations, 5),
    ],
    defaults: { aspect_ratio: '16:9', duration: '5' },
    aliases: ['kling-2-5-turbo-pro-t2v'],
  }),
  studioModel({
    id: 'fal-ai/kling-video/o1/text-to-video',
    name: 'Kling O1',
    description: 'Reasoning-enhanced generation.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 25, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', videoDurations, 5),
    ],
    defaults: { aspect_ratio: '16:9', duration: '5' },
    aliases: ['kling-o1-t2v'],
  }),
  studioModel({
    id: 'fal-ai/veo3.1/text-to-video',
    name: 'Veo 3.1',
    description: 'Most advanced model. Native audio. 4K. Best lip-sync.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 40, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', [{ label: '5 sec', value: 5 }, { label: '8 sec', value: 8 }, { label: '10 sec', value: 10 }], 8),
    ],
    defaults: { aspect_ratio: '16:9', duration: 8 },
    aliases: ['veo-3-1-t2v', 'google-veo-3.1'],
  }),
  studioModel({
    id: 'fal-ai/veo3.1/fast/text-to-video',
    name: 'Veo 3.1 Fast',
    description: 'Faster affordable Veo 3.1.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 25, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', [{ label: '5 sec', value: 5 }, { label: '8 sec', value: 8 }], 8),
    ],
    defaults: { aspect_ratio: '16:9', duration: 8 },
    aliases: ['veo-3-1-fast-t2v'],
  }),
  studioModel({
    id: 'fal-ai/sora/pro/text-to-video',
    name: 'Sora 2 Pro',
    description: 'Film-grade cinematic. Exceptional prompt adherence.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 50, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('duration', 'Duration', [{ label: '5 sec', value: 5 }, { label: '10 sec', value: 10 }, { label: '15 sec', value: 15 }, { label: '20 sec', value: 20 }], 10),
    ],
    defaults: { duration: 10 },
    aliases: ['sora-2-pro-t2v'],
  }),
  studioModel({
    id: 'fal-ai/sora-2/text-to-video',
    name: 'Sora 2',
    description: 'Higher-fidelity text-to-video generation.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 35, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('duration_seconds', 'Duration', videoDurations, 5)],
    defaults: { duration_seconds: 5 },
    aliases: ['openai-sora-2-text-to-video'],
  }),
  studioModel({
    id: 'fal-ai/seedance/v2/text-to-video',
    name: 'Seedance 2.0',
    description: 'First unified audio-video joint gen. Multi-shot. 8+ lang lip-sync.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 30, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', videoDurations, 8),
    ],
    defaults: { aspect_ratio: '16:9', duration: 8 },
    aliases: ['seedance-2-0-t2v'],
  }),
  studioModel({
    id: 'fal-ai/bytedance/seedance/v1/pro/text-to-video',
    name: 'Seedance 1.5 Pro',
    description: 'Quality-first cinematic text-to-video.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 28, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('duration_seconds', 'Duration', videoDurations, 5)],
    defaults: { duration_seconds: 5 },
    aliases: ['seedance-pro-t2v'],
  }),
  studioModel({
    id: 'fal-ai/minimax/hailuo-2.3/pro',
    name: 'Hailuo 2.3 Pro',
    description: 'MiniMax Hailuo 2.3 at 1080p.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 28, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9' },
    aliases: ['hailuo-2-3-pro'],
  }),
  studioModel({
    id: 'fal-ai/wan/v2.5/text-to-video',
    name: 'Wan 2.5',
    description: 'Affordable open-source T2V.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 15, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('duration', 'Duration', videoDurations, 5),
    ],
    defaults: { aspect_ratio: '16:9', duration: 5 },
    aliases: ['wan-2-5-t2v'],
  }),
  studioModel({
    id: 'fal-ai/ltx-video/v2-19b',
    name: 'LTX 2.0',
    description: 'Ultra-budget open-source. Up to 4K.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 12, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('duration', 'Duration', videoDurations, 5)],
    defaults: { duration: 5 },
    aliases: ['ltx-2-19b'],
  }),
  studioModel({
    id: 'fal-ai/pixverse/v6',
    name: 'PixVerse V6',
    description: 'Lifelike physics simulation.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 18, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('duration', 'Duration', videoDurations, 5)],
    defaults: { duration: 5 },
    aliases: ['pixverse-v6'],
  }),
  studioModel({
    id: 'fal-ai/higgsfield/dop',
    name: 'Higgsfield DoP',
    description: 'Director of Photography with cinematic presets.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 20, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('duration', 'Duration', videoDurations, 5)],
    defaults: { duration: 5 },
    aliases: ['higgsfield-dop'],
  }),

  // ===================== VIDEO — image-to-video =====================
  studioModel({
    id: 'fal-ai/kling-video/v3/pro/image-to-video',
    name: 'Kling 3.0 Pro I2V',
    description: 'Cinematic image-to-video with native audio.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'generation',
    credits: 30, requiresAssets: ['image'], supportsPrompt: true,
    controls: [
      selectControl('duration_seconds', 'Duration', videoDurations, 5),
      selectControl('fps', 'FPS', [{ label: '24', value: 24 }, { label: '30', value: 30 }], 24),
      booleanControl('generate_audio', 'Generate Audio', true),
    ],
    defaults: { duration_seconds: 5, fps: 24, generate_audio: true },
    aliases: ['kling-v3.0-pro-image-to-video'],
  }),
  studioModel({
    id: 'fal-ai/kling-video/o3/standard/image-to-video',
    name: 'Kling O3 Standard I2V',
    description: 'Image-to-video with stable motion.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'generation',
    credits: 24, requiresAssets: ['image'], supportsPrompt: true,
    controls: [
      selectControl('duration', 'Duration', videoDurations, 5),
      booleanControl('generate_audio', 'Generate Audio', false),
    ],
    defaults: { duration: '5', generate_audio: false },
    aliases: ['kling-o3-image-to-video'],
  }),
  studioModel({
    id: 'fal-ai/veo3.1/image-to-video',
    name: 'Veo 3.1 I2V',
    description: 'Best I2V. 4K, audio, character consistency.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'generation',
    credits: 40, requiresAssets: ['image'], supportsPrompt: true,
    controls: [
      selectControl('duration', 'Duration', [{ label: '5 sec', value: 5 }, { label: '8 sec', value: 8 }, { label: '10 sec', value: 10 }], 8),
    ],
    defaults: { duration: 8 },
    aliases: ['veo-3-1-i2v'],
  }),
  studioModel({
    id: 'fal-ai/veo3.1/fast/image-to-video',
    name: 'Veo 3.1 Fast I2V',
    description: 'Fast I2V from Veo 3.1.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'generation',
    credits: 25, requiresAssets: ['image'], supportsPrompt: true,
    controls: [
      selectControl('duration', 'Duration', [{ label: '5 sec', value: 5 }, { label: '8 sec', value: 8 }], 8),
    ],
    defaults: { duration: 8 },
    aliases: ['veo-3-1-fast-i2v'],
  }),
  studioModel({
    id: 'fal-ai/sora/pro/image-to-video',
    name: 'Sora 2 Pro I2V',
    description: 'Premium I2V from Sora 2.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'generation',
    credits: 50, requiresAssets: ['image'], supportsPrompt: true,
    controls: [
      selectControl('duration', 'Duration', [{ label: '5 sec', value: 5 }, { label: '10 sec', value: 10 }, { label: '15 sec', value: 15 }], 10),
    ],
    defaults: { duration: 10 },
    aliases: ['sora-2-pro-i2v'],
  }),
  studioModel({
    id: 'fal-ai/seedance/v2/image-to-video',
    name: 'Seedance 2.0 I2V',
    description: 'I2V with unified audio-video.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'generation',
    credits: 30, requiresAssets: ['image'], supportsPrompt: true,
    controls: [
      selectControl('duration', 'Duration', videoDurations, 8),
    ],
    defaults: { duration: 8 },
    aliases: ['seedance-2-0-i2v'],
  }),
  studioModel({
    id: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
    name: 'Seedance 1.5 Pro I2V',
    description: 'High-fidelity I2V with strong motion consistency.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'generation',
    credits: 28, requiresAssets: ['image'], supportsPrompt: false,
    controls: [selectControl('duration_seconds', 'Duration', videoDurations, 5)],
    defaults: { duration_seconds: 5 },
    aliases: ['seedance-v2.0-i2v'],
  }),

  // ===================== VIDEO — special (motion control / editing) =====================
  studioModel({
    id: 'fal-ai/kling-video/v3/motion-control',
    name: 'Kling 3.0 Motion',
    description: 'Copy motion from video to your character.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'motion-control', uiGroup: 'advanced',
    credits: 30, requiresAssets: ['image'], supportsPrompt: false,
    controls: [
      selectControl('quality', 'Quality', [{ label: '720p', value: '720p' }], '720p'),
    ],
    defaults: { quality: '720p' },
    aliases: ['kling-3-0-motion'],
  }),
  studioModel({
    id: 'fal-ai/kling-video/o1/edit',
    name: 'Kling O1 Edit',
    description: 'Modify, restyle, transform videos.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'video-editing', uiGroup: 'advanced',
    credits: 28, requiresAssets: ['image'], supportsPrompt: true,
    controls: [],
    defaults: {},
    aliases: ['kling-o1-edit'],
  }),

  // ===================== CINEMA =====================
  studioModel({
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro Cinema',
    description: 'Curated cinematic still generation.',
    studio: 'cinema', mode: 'cinematic-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 7, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('resolution', 'Resolution', imageResolutions, '2K'),
    ],
    defaults: { aspect_ratio: '16:9', resolution: '2K', output_format: 'png' },
    aliases: ['cinema-nano-banana'],
  }),
  studioModel({
    id: 'fal-ai/qwen-image-2/text-to-image',
    name: 'Qwen Cinema',
    description: 'Cinematic still generation with strong prompt adherence.',
    studio: 'cinema', mode: 'cinematic-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 5, requiresAssets: [], supportsPrompt: true,
    controls: [selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9')],
    defaults: { aspect_ratio: '16:9', output_format: 'png' },
    aliases: ['cinema-qwen'],
  }),

  // ===================== LIPSYNC =====================
  studioModel({
    id: 'veed/fabric-1.0',
    name: 'VEED Fabric 1.0',
    description: 'Turn a portrait and audio track into a talking video.',
    studio: 'lipsync', mode: 'talking-head', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'advanced',
    credits: 20, requiresAssets: ['image', 'audio'], supportsPrompt: false,
    controls: [selectControl('resolution', 'Resolution', videoResolutions.slice(0, 2), '720p')],
    defaults: { resolution: '720p' },
    aliases: ['VEED/fabric-1.0'],
  }),
  studioModel({
    id: 'fal-ai/creatify/aurora',
    name: 'Creatify Aurora',
    description: 'Studio-quality avatar speaking video generation.',
    studio: 'lipsync', mode: 'talking-head', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'advanced',
    credits: 20, requiresAssets: ['image', 'audio'], supportsPrompt: true,
    controls: [selectControl('resolution', 'Resolution', videoResolutions.slice(0, 2), '720p')],
    defaults: { resolution: '720p', guidance_scale: 1, audio_guidance_scale: 2 },
    aliases: ['creatify-aurora'],
  }),
  studioModel({
    id: 'fal-ai/wan/v2.2-14b/speech-to-video',
    name: 'Wan 2.2 Speech to Video',
    description: 'Speech-driven portrait animation with expressive motion.',
    studio: 'lipsync', mode: 'talking-head', mediaType: 'video', workflowType: 'audio-to-video', uiGroup: 'advanced',
    credits: 20, requiresAssets: ['image', 'audio'], supportsPrompt: true,
    controls: [
      selectControl('fps', 'FPS', [{ label: '16', value: 16 }, { label: '24', value: 24 }], 16),
    ],
    defaults: { fps: 16, num_frames: 81 },
    aliases: ['wan2.2-speech-to-video'],
  }),
  studioModel({
    id: 'fal-ai/ltx-2.3/audio-to-video',
    name: 'LTX-2.3 Audio to Video',
    description: 'Generate visuals that follow an audio performance.',
    studio: 'lipsync', mode: 'talking-head', mediaType: 'video', workflowType: 'audio-to-video', uiGroup: 'advanced',
    credits: 20, requiresAssets: ['audio'], supportsPrompt: true,
    controls: [
      selectControl('resolution', 'Resolution', videoResolutions.slice(0, 2), '720p'),
      selectControl('fps', 'FPS', [{ label: '24', value: 24 }, { label: '48', value: 48 }], 24),
    ],
    defaults: { resolution: '720p', fps: 24 },
    aliases: ['ltx-2.3-lipsync'],
  }),
  studioModel({
    id: 'fal-ai/sync-lipsync/v2',
    name: 'Sync Lipsync 2.0',
    description: 'Frame-accurate video lip sync from audio.',
    studio: 'lipsync', mode: 'lip-sync', mediaType: 'video', workflowType: 'video-to-video', uiGroup: 'advanced',
    credits: 20, requiresAssets: ['video', 'audio'], supportsPrompt: false,
    controls: [],
    defaults: { model: 'lipsync-2' },
    aliases: ['sync-lipsync', 'sync-lipsync-2'],
  }),
  studioModel({
    id: 'fal-ai/latentsync',
    name: 'LatentSync',
    description: 'Advanced audio-driven lip sync for existing video.',
    studio: 'lipsync', mode: 'lip-sync', mediaType: 'video', workflowType: 'video-to-video', uiGroup: 'advanced',
    credits: 20, requiresAssets: ['video', 'audio'], supportsPrompt: false,
    controls: [],
    defaults: {},
    aliases: ['latent-sync'],
  }),

  // ===================== GMI CLOUD =====================

  // GMI Image
  studioModel({
    id: 'gmi/seedream-5.0-lite',
    name: 'Seedream 5 Lite',
    description: 'High-fidelity image generation by BytePlus.',
    studio: 'image', mode: 'text-to-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 2, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('output_format', 'Format', [
        { label: 'JPEG', value: 'jpeg' },
        { label: 'PNG', value: 'png' },
      ], 'jpeg'),
    ],
    defaults: { size: '2048x2048', output_format: 'jpeg', max_images: 1 },
    aliases: ['seedream-5-lite', 'seedream-5.0-lite'],
  }),

  // GMI Video — Kling V3 Omni
  studioModel({
    id: 'gmi/kling-v3-omni',
    name: 'Kling V3 Omni',
    description: 'Unified video generation — text, image, multi-shot storyboards.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 28, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('mode', 'Quality', [
        { label: 'Standard (720p)', value: 'std' },
        { label: 'Professional (1080p)', value: 'pro' },
      ], 'std'),
      selectControl('duration', 'Duration', [
        { label: '3 seconds', value: '3' },
        { label: '5 seconds', value: '5' },
        { label: '8 seconds', value: '8' },
        { label: '10 seconds', value: '10' },
      ], '5'),
    ],
    defaults: { mode: 'std', duration: '5', aspect_ratio: '16:9', sound: 'off' },
    aliases: ['kling-v3-omni'],
  }),

  // GMI Video — Wan 2.6 T2V
  studioModel({
    id: 'gmi/wan2.6-t2v',
    name: 'Wan 2.6 T2V',
    description: 'Text-to-video generation by Wan.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 18, requiresAssets: [], supportsPrompt: true,
    controls: [],
    defaults: { video_length: 5 },
    aliases: ['wan-2-6-t2v'],
  }),

  // GMI Video — Minimax Hailuo 2.3
  studioModel({
    id: 'gmi/minimax-hailuo-2.3',
    name: 'Minimax Hailuo 2.3',
    description: 'Improved motion and visual consistency.',
    studio: 'video', mode: 'text-to-video', mediaType: 'video', workflowType: 'text-to-video', uiGroup: 'generation',
    credits: 22, requiresAssets: [], supportsPrompt: true,
    controls: [],
    defaults: {},
    aliases: ['minimax-hailuo-2-3'],
  }),
  studioModel({
    id: 'gmi/ltx-fast-i2v',
    name: 'LTX Fast I2V',
    description: 'Image-to-video animation with optional audio and camera motion.',
    studio: 'video', mode: 'image-to-video', mediaType: 'video', workflowType: 'image-to-video', uiGroup: 'generation',
    credits: 5, requiresAssets: ['image'], supportsPrompt: true,
    controls: [
      selectControl('duration', 'Duration', ltxDurations, 6),
      selectControl('resolution', 'Resolution', ltxFastResolutions, '1920x1080'),
      selectControl('fps', 'FPS', ltxFpsOptions, 25),
      booleanControl('generate_audio', 'Generate Audio', true),
      selectControl('camera_motion', 'Camera Motion', ltxCameraMotionOptions, ''),
    ],
    defaults: { duration: 6, resolution: '1920x1080', fps: 25, generate_audio: true, camera_motion: '' },
    aliases: ['ltx-fast-i2v', 'ltx-2-fast-image-to-video'],
  }),
  studioModel({
    id: 'gmi/seedream-5.0-lite',
    name: 'Seedream 5 Cinema',
    description: 'Cinematic still generation via GMI Cloud.',
    studio: 'cinema', mode: 'cinematic-image', mediaType: 'image', workflowType: 'text-to-image', uiGroup: 'generation',
    credits: 2, requiresAssets: [], supportsPrompt: true,
    controls: [
      selectControl('aspect_ratio', 'Aspect Ratio', baseAspectRatios, '16:9'),
      selectControl('output_format', 'Format', [
        { label: 'JPEG', value: 'jpeg' },
        { label: 'PNG', value: 'png' },
      ], 'png'),
    ],
    defaults: { aspect_ratio: '16:9', size: '2560x1440', output_format: 'png', max_images: 1, watermark: false },
    aliases: ['seedream-5-cinema', 'gmi-seedream-cinema'],
  }),
  studioModel({
    id: 'gmi/ltx-pro-a2v',
    name: 'LTX Pro Audio Video',
    description: 'Audio-driven talking-head generation with optional portrait conditioning.',
    studio: 'lipsync', mode: 'talking-head', mediaType: 'video', workflowType: 'audio-to-video', uiGroup: 'generation',
    credits: 12, requiresAssets: ['audio'], supportsPrompt: true,
    controls: [],
    defaults: { resolution: '1920x1080' },
    aliases: ['ltx-pro-a2v', 'ltx-2-pro-audio-to-video'],
  }),
];

function hasProperty(value: unknown, key: string): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && key in value);
}

function extractString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function extractNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function kanvasSurface(studio: KanvasStudio): CatalogSurface {
  return `kanvas:${studio}` as CatalogSurface;
}

function inferKanvasStudio(row: { studioSurfaces: string[] }, preferred?: KanvasStudio): KanvasStudio | null {
  if (preferred) {
    return preferred;
  }

  const surface = row.studioSurfaces.find((value) => value.startsWith('kanvas:'));
  return surface ? (surface.replace('kanvas:', '') as KanvasStudio) : null;
}

function inferKanvasMode(row: { kanvasModes: string[] }, preferred?: KanvasMode): KanvasMode | null {
  return preferred ?? (row.kanvasModes[0] as KanvasMode | undefined) ?? null;
}

export async function listKanvasModels(input?: {
  studio?: KanvasStudio;
  mode?: KanvasMode;
}): Promise<KanvasStudioModel[]> {
  const rows = await listCatalogModels({
    studioSurface: input?.studio ? kanvasSurface(input.studio) : undefined,
    kanvasMode: input?.mode,
  });

  return rows.flatMap((row) => {
    const studio = inferKanvasStudio(row, input?.studio);
    const mode = inferKanvasMode(row, input?.mode);
    if (!studio || !mode) {
      return [];
    }
    return [toKanvasCatalogModel(row, studio, mode)];
  });
}

export async function getKanvasModelById(
  modelId: string,
  filters?: {
    studio?: KanvasStudio;
    mode?: KanvasMode;
  }
): Promise<KanvasStudioModel | null> {
  const row = await getCatalogModelById(modelId, {
    studioSurface: filters?.studio ? kanvasSurface(filters.studio) : undefined,
    kanvasMode: filters?.mode,
  });
  if (!row) {
    return null;
  }

  const studio = inferKanvasStudio(row, filters?.studio);
  const mode = inferKanvasMode(row, filters?.mode);
  if (!studio || !mode) {
    return null;
  }

  return toKanvasCatalogModel(row, studio, mode);
}

export function buildCinemaPrompt(prompt: string, cinema: KanvasCinemaSettings): string {
  const camera = KANVAS_CAMERAS[cinema.camera] ?? cinema.camera;
  const lens = KANVAS_LENSES[cinema.lens] ?? cinema.lens;
  const perspective = FOCAL_PERSPECTIVES[cinema.focalLength] ?? '';
  const aperture = APERTURE_EFFECTS[cinema.aperture] ?? '';

  return [
    prompt,
    `shot on a ${camera}`,
    `using a ${lens} at ${cinema.focalLength}mm${perspective ? ` (${perspective})` : ''}`,
    `aperture ${cinema.aperture}`,
    aperture,
    'cinematic lighting',
    'natural color science',
    'high dynamic range',
    'professional photography, ultra-detailed, 8K resolution',
  ]
    .filter((part) => part.trim().length > 0)
    .join(', ');
}

export function collectAssetIds(request: KanvasGenerationRequest): string[] {
  const referenceAssetIds = (request.referenceAssets ?? [])
    .map((asset) => asset.assetId)
    .filter((assetId): assetId is string => typeof assetId === 'string' && assetId.length > 0);

  switch (request.mode) {
    case 'image-to-image':
      return Array.from(new Set([...request.assetSelections.imageIds, ...referenceAssetIds]));
    case 'image-to-video':
      return Array.from(new Set([request.assetSelections.imageId, ...referenceAssetIds]));
    case 'reference-to-video':
      return Array.from(new Set([request.assetSelections.assetId, ...referenceAssetIds]));
    case 'cinematic-image':
      return Array.from(new Set([...(request.assetSelections?.imageIds ?? []), ...referenceAssetIds]));
    case 'talking-head':
      return [request.assetSelections.audioId, request.assetSelections.imageId, ...referenceAssetIds]
        .filter((assetId): assetId is string => typeof assetId === 'string' && assetId.length > 0);
    case 'lip-sync':
      return Array.from(new Set([request.assetSelections.videoId, request.assetSelections.audioId, ...referenceAssetIds]));
    default:
      return referenceAssetIds;
  }
}

export async function resolveAssetsForRequest(
  request: KanvasGenerationRequest,
  userId: string,
  repository: KanvasJobRepository
): Promise<KanvasAssetRecord[]> {
  const assetIds = collectAssetIds(request);
  const assets: KanvasAssetRecord[] = [];

  for (const assetId of assetIds) {
    const asset = await repository.getAssetById(assetId, userId);
    if (!asset) {
      throw new Error(`Asset ${assetId} was not found or is not accessible.`);
    }
    assets.push(asset);
  }

  return assets;
}

function findFirstAsset(assets: KanvasAssetRecord[], type: KanvasAssetType): KanvasAssetRecord | null {
  return assets.find((asset) => asset.assetType === type) ?? null;
}

function findAllAssets(assets: KanvasAssetRecord[], type: KanvasAssetType): KanvasAssetRecord[] {
  return assets.filter((asset) => asset.assetType === type);
}

function findReferenceUrls(request: KanvasGenerationRequest, type: KanvasAssetType): string[] {
  return (request.referenceAssets ?? [])
    .filter((asset) => asset.type === type)
    .map((asset) => asset.url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
}

export function buildFalInput(
  request: KanvasGenerationRequest,
  model: KanvasStudioModel,
  assets: KanvasAssetRecord[]
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    ...model.defaults,
    ...(request.settings ?? {}),
  };

  if (request.studio === 'cinema') {
    input.prompt = buildCinemaPrompt(request.prompt, request.cinema);
  } else if ('prompt' in request && request.prompt) {
    input.prompt = request.prompt;
  }

  if (request.elementIds?.length && model.id === 'gmi/kling-v3-omni') {
    input.element_ids = request.elementIds;
  }

  switch (request.mode) {
    case 'image-to-image': {
      const imageUrls = Array.from(new Set([
        ...findAllAssets(assets, 'image').map((asset) => asset.url),
        ...findReferenceUrls(request, 'image'),
      ]));
      input.image_urls = imageUrls;
      break;
    }
    case 'image-to-video': {
      const imageAsset = findFirstAsset(assets, 'image');
      const imageUrl = imageAsset?.url ?? findReferenceUrls(request, 'image')[0];
      if (!imageUrl) {
        throw new Error('Image-to-video requests require a reference image.');
      }
      input.image_url = imageUrl;
      break;
    }
    case 'reference-to-video': {
      const imageAsset = findFirstAsset(assets, 'image');
      const videoAsset = findFirstAsset(assets, 'video');
      const imageUrl = imageAsset?.url ?? findReferenceUrls(request, 'image')[0];
      const videoUrl = videoAsset?.url ?? findReferenceUrls(request, 'video')[0];

      if (!imageUrl && !videoUrl) {
        throw new Error('Reference-to-video requests require an image or video reference.');
      }

      if (imageUrl) {
        input.image_url = imageUrl;
      }

      if (videoUrl) {
        input.video_url = videoUrl;
      }

      break;
    }
    case 'cinematic-image': {
      const imageUrls = Array.from(new Set([
        ...findAllAssets(assets, 'image').map((asset) => asset.url),
        ...findReferenceUrls(request, 'image'),
      ]));
      if (imageUrls.length > 0) {
        input.image_urls = imageUrls;
      }
      break;
    }
    case 'talking-head': {
      const audioAsset = findFirstAsset(assets, 'audio');
      const imageAsset = findFirstAsset(assets, 'image');

      if (!audioAsset) {
        throw new Error('Talking-head requests require an audio file.');
      }

      if (model.requiresAssets.includes('image') && !imageAsset) {
        throw new Error('The selected talking-head model requires a portrait image.');
      }

      if (imageAsset) {
        input.image_url = imageAsset.url;
      }
      input.audio_url = audioAsset.url;
      break;
    }
    case 'lip-sync': {
      const videoAsset = findFirstAsset(assets, 'video');
      const audioAsset = findFirstAsset(assets, 'audio');
      if (!videoAsset || !audioAsset) {
        throw new Error('Lip-sync requests require a video and audio file.');
      }
      input.video_url = videoAsset.url;
      input.audio_url = audioAsset.url;
      break;
    }
    default:
      break;
  }

  if (model.id === 'fal-ai/wan/v2.2-14b/speech-to-video' && input.num_frames === undefined) {
    input.num_frames = 81;
  }

  return input;
}

export function normalizeKanvasResult(result: unknown, mediaType: KanvasMediaType): KanvasNormalizedResult {
  const gmiMedia = extractGmiMedia(result, mediaType);
  const outputs: KanvasOutputFile[] = gmiMedia.outputs.map((entry) => ({ url: entry.url }));

  if (outputs.length === 0 && hasProperty(result, 'images') && Array.isArray(result.images)) {
    for (const image of result.images) {
      if (!hasProperty(image, 'url')) continue;
      const url = extractString(image.url);
      if (!url) continue;
      outputs.push({
        url,
        contentType: extractString(hasProperty(image, 'content_type') ? image.content_type : undefined) ?? undefined,
        fileName: extractString(hasProperty(image, 'file_name') ? image.file_name : undefined) ?? undefined,
        width: extractNumber(hasProperty(image, 'width') ? image.width : undefined),
        height: extractNumber(hasProperty(image, 'height') ? image.height : undefined),
      });
    }
  }

  if (outputs.length === 0 && hasProperty(result, 'video') && hasProperty(result.video, 'url')) {
    const url = extractString(result.video.url);
    if (url) {
      outputs.push({
        url,
        contentType: extractString(hasProperty(result.video, 'content_type') ? result.video.content_type : undefined) ?? undefined,
        fileName: extractString(hasProperty(result.video, 'file_name') ? result.video.file_name : undefined) ?? undefined,
        width: extractNumber(hasProperty(result.video, 'width') ? result.video.width : undefined),
        height: extractNumber(hasProperty(result.video, 'height') ? result.video.height : undefined),
        duration: extractNumber(hasProperty(result.video, 'duration') ? result.video.duration : undefined),
      });
    }
  }

  if (outputs.length === 0 && hasProperty(result, 'image') && hasProperty(result.image, 'url')) {
    const url = extractString(result.image.url);
    if (url) {
      outputs.push({
        url,
        contentType: extractString(hasProperty(result.image, 'content_type') ? result.image.content_type : undefined) ?? undefined,
        fileName: extractString(hasProperty(result.image, 'file_name') ? result.image.file_name : undefined) ?? undefined,
      });
    }
  }

  if (outputs.length === 0 && hasProperty(result, 'url')) {
    const url = extractString(result.url);
    if (url) {
      outputs.push({ url });
    }
  }

  const primary = outputs[0];
  const elementId = extractGmiElementId(result);

  if (!primary && !elementId) {
    throw new Error('Generation result did not contain a usable output URL.');
  }

  return {
    mediaType,
    primaryUrl: primary?.url ?? '',
    previewUrl: gmiMedia.previewUrl ?? primary?.url ?? '',
    outputs,
    thumbnailUrl: gmiMedia.thumbnailUrl,
    elementId,
    raw: result,
  };
}

function assertAuthenticatedUser(userId: string): void {
  if (!userId) {
    throw new Error('Authenticated user is required.');
  }
}

async function promoteKanvasResultToRegistry(
  job: KanvasJobRecord,
  result: KanvasNormalizedResult,
  userId: string,
  repository: KanvasJobRepository,
): Promise<void> {
  if (!repository.saveGeneratedAsset || !result.primaryUrl) {
    return;
  }

  const request = job.config.request;
  const generationRole = request.generationRole ?? 'primary';
  const assetId = await repository.saveGeneratedAsset({
    userId,
    projectId: job.projectId,
    jobId: job.id,
    modelId: job.modelId,
    mediaType: job.jobType,
    url: result.primaryUrl,
    thumbnailUrl: result.thumbnailUrl ?? result.previewUrl,
    generationRole,
  });

  if (!assetId || !repository.linkBlueprintImage) {
    return;
  }

  for (const blueprintId of request.referenceBlueprintIds ?? []) {
    await repository.linkBlueprintImage({
      blueprintId,
      assetId,
      imageUrl: result.primaryUrl,
      generationRole,
      generationMetadata: {
        source: 'kanvas',
        jobId: job.id,
        modelId: job.modelId,
        mediaType: job.jobType,
      },
    });
  }
}

export async function submitKanvasJob(
  request: KanvasGenerationRequest,
  userId: string,
  repository: KanvasJobRepository,
  deps: KanvasServiceDeps
): Promise<KanvasJobRecord> {
  assertAuthenticatedUser(userId);

  const model = await getKanvasModelById(request.modelId, {
    studio: request.studio,
    mode: request.mode,
  });
  if (!model || model.studio !== request.studio || model.mode !== request.mode) {
    throw new Error(`Unmapped model: ${request.modelId}`);
  }

  const assets = await resolveAssetsForRequest(request, userId, repository);
  const input = buildFalInput(request, model, assets);
  const now = deps.now();
  const jobId = deps.randomId();
  const cost = deps.getCost(model.id, model.mediaType);
  const reservation = await deps.credits.reserve({
    userId,
    modelId: model.id,
    resourceType: model.mediaType,
    referenceId: jobId,
    amount: cost,
  });

  const submission = await deps.fal.submit(model.id, input);
  if (!submission.success) {
    await deps.credits.release({
      userId,
      holdId: reservation.holdId,
      skipped: reservation.skipped,
      amount: cost,
      reason: 'submission_failed',
      requestId: null,
      modelId: model.id,
    });
    throw new Error(submission.error || 'Fal submission failed.');
  }

  // Fail fast: a successful submission with no requestId AND no inline data
  // would create an unpollable job. Release the hold and surface a clear error.
  if (!submission.requestId && !submission.data) {
    await deps.credits.release({
      userId,
      holdId: reservation.holdId,
      skipped: reservation.skipped,
      amount: cost,
      reason: 'submission_missing_request_id',
      requestId: null,
      modelId: model.id,
    });
    throw new Error('Provider accepted the request but returned no request ID. Please retry.');
  }

  const config: KanvasJobConfig = {
    request,
    queue: {
      statusUrl: submission.statusUrl ?? null,
      responseUrl: submission.responseUrl ?? null,
    },
    billing: {
      holdId: reservation.holdId,
      skipped: reservation.skipped,
      amount: cost,
    },
  };

  if (!submission.requestId && submission.data) {
    const result = normalizeKanvasResult(submission.data, model.mediaType);
    const completed = await repository.insertJob({
      id: jobId,
      userId,
      projectId: request.projectId ?? null,
      studio: request.studio,
      modelId: model.id,
      externalRequestId: null,
      jobType: model.mediaType,
      status: 'completed',
      progress: 100,
      resultUrl: result.primaryUrl,
      errorMessage: null,
      config,
      inputAssets: assets.map((asset) => asset.id),
      resultPayload: result,
      createdAt: now,
      startedAt: now,
      completedAt: now,
      updatedAt: now,
    });
    await deps.credits.commit({
      userId,
      holdId: reservation.holdId,
      skipped: reservation.skipped,
      amount: cost,
      requestId: null,
      modelId: model.id,
    });
    await promoteKanvasResultToRegistry(completed, result, userId, repository);
    return completed;
  }

  return await repository.insertJob({
    id: jobId,
    userId,
    projectId: request.projectId ?? null,
    studio: request.studio,
    modelId: model.id,
    externalRequestId: submission.requestId ?? null,
    jobType: model.mediaType,
    status: 'queued',
    progress: 5,
    resultUrl: null,
    errorMessage: null,
    config,
    inputAssets: assets.map((asset) => asset.id),
    resultPayload: null,
    createdAt: now,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
  });
}

export async function refreshKanvasJob(
  jobId: string,
  userId: string,
  repository: KanvasJobRepository,
  deps: KanvasServiceDeps
): Promise<KanvasJobRecord> {
  assertAuthenticatedUser(userId);

  const job = await repository.getJob(jobId, userId);
  if (!job) {
    throw new Error('Kanvas job not found.');
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return job;
  }

  if (!job.externalRequestId) {
    // Self-heal orphaned jobs (provider never returned a request ID) so the
    // client stops polling instead of hammering the function with 500s.
    const now = deps.now();
    const failed = await repository.updateJob(job.id, {
      status: 'failed',
      progress: 100,
      errorMessage: 'Generation never received a provider request ID. Please retry.',
      updatedAt: now,
      completedAt: now,
    });
    try {
      await deps.credits.release({
        userId,
        holdId: job.config.billing.holdId,
        skipped: job.config.billing.skipped,
        amount: job.config.billing.amount,
        reason: 'orphaned_job',
        requestId: null,
        modelId: job.modelId,
      });
    } catch (releaseError) {
      console.warn('[kanvas] Failed to release credits for orphaned job:', releaseError);
    }
    return failed;
  }

  const polled = await deps.fal.poll(job.externalRequestId, job.config.queue.statusUrl);
  if (!polled.success) {
    const now = deps.now();
    const failed = await repository.updateJob(job.id, {
      status: 'failed',
      progress: 100,
      errorMessage: polled.error || 'Failed to refresh Kanvas job.',
      updatedAt: now,
      completedAt: now,
    });
    await deps.credits.release({
      userId,
      holdId: job.config.billing.holdId,
      skipped: job.config.billing.skipped,
      amount: job.config.billing.amount,
      reason: 'poll_failed',
      requestId: job.externalRequestId,
      modelId: job.modelId,
    });
    return failed;
  }

  const now = deps.now();
  const status = polled.status ?? 'IN_PROGRESS';
  if (status === 'COMPLETED') {
    const rawResult =
      job.config.queue.responseUrl
        ? await deps.fal.fetchResult(job.config.queue.responseUrl)
        : polled.result;
    const result = normalizeKanvasResult(rawResult, job.jobType);
    const updated = await repository.updateJob(job.id, {
      status: 'completed',
      progress: 100,
      resultUrl: result.primaryUrl,
      errorMessage: null,
      resultPayload: result,
      completedAt: now,
      updatedAt: now,
    });
    await deps.credits.commit({
      userId,
      holdId: job.config.billing.holdId,
      skipped: job.config.billing.skipped,
      amount: job.config.billing.amount,
      requestId: job.externalRequestId,
      modelId: job.modelId,
    });
    await promoteKanvasResultToRegistry(updated, result, userId, repository);
    return updated;
  }

  if (status === 'FAILED') {
    const failed = await repository.updateJob(job.id, {
      status: 'failed',
      progress: 100,
      errorMessage: polled.error || 'Fal job failed.',
      updatedAt: now,
      completedAt: now,
    });
    await deps.credits.release({
      userId,
      holdId: job.config.billing.holdId,
      skipped: job.config.billing.skipped,
      amount: job.config.billing.amount,
      reason: 'job_failed',
      requestId: job.externalRequestId,
      modelId: job.modelId,
    });
    return failed;
  }

  const nextProgress = typeof polled.queuePosition === 'number'
    ? Math.max(10, 35 - polled.queuePosition)
    : 55;

  return await repository.updateJob(job.id, {
    status: 'processing',
    progress: nextProgress,
    errorMessage: null,
    updatedAt: now,
  });
}
