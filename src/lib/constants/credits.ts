/**
 * Shared credit costs constants.
 *
 * Single source of truth for all credit values displayed in the UI.
 * Re-exports helpers from the studio-model-constants catalog so every
 * consumer references the same data.
 */

import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  AUDIO_MODELS,
  TEXT_MODELS,
  getModelById,
  type StudioModel,
} from '@/lib/studio-model-constants';

// ── Re-exports for convenience ──────────────────────────────────────────────
export { IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS, TEXT_MODELS, getModelById };

/**
 * Look up the credit cost for any model by its ID.
 * Returns `undefined` when the ID is not found in the catalog.
 */
export function getModelCredits(modelId: string): number | undefined {
  return getModelById(modelId)?.credits;
}

/**
 * Build a map of `modelId → credits` for a given model list.
 */
export function buildCreditsMap(models: StudioModel[]): Record<string, number> {
  return Object.fromEntries(models.map((m) => [m.id, m.credits]));
}

/** Pre-built lookup maps keyed by model ID */
export const IMAGE_CREDITS = buildCreditsMap(IMAGE_MODELS);
export const VIDEO_CREDITS = buildCreditsMap(VIDEO_MODELS);
export const AUDIO_CREDITS = buildCreditsMap(AUDIO_MODELS);
export const TEXT_CREDITS = buildCreditsMap(TEXT_MODELS);

/**
 * Format a model name with its credit cost for display in dropdowns.
 * e.g. `"FLUX Schnell (3 credits)"`
 */
export function formatModelLabel(model: StudioModel): string {
  return `${model.name} (${Math.max(1, model.credits)} credits)`;
}

/**
 * Format a model label by looking up its ID.
 * Falls back to just the name when the model is unknown.
 */
export function formatModelLabelById(modelId: string, fallbackName?: string): string {
  const model = getModelById(modelId);
  if (model) return formatModelLabel(model);
  return fallbackName ?? modelId;
}

// ── Storyline (Groq) model credits ──────────────────────────────────────────
// These models run through the Groq API and are not in the fal.ai studio
// catalog, so we define their credit costs here.
export interface StorylineModelOption {
  id: string;
  label: string;
  credits: number;
}

export const STORYLINE_MODEL_OPTIONS: StorylineModelOption[] = [
  { id: 'gmi/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', credits: 1 },
  { id: 'gmi/claude-opus-4.7', label: 'Claude Opus 4.7', credits: 5 },
  { id: 'gmi/glm-5.1', label: 'GLM 5.1', credits: 2 },
  { id: 'gmi/deepseek-r1', label: 'DeepSeek R1', credits: 4 },
  { id: 'gmi/openai-o4-mini', label: 'OpenAI o4 Mini', credits: 3 },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', credits: 1 },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', credits: 1 },
];

/**
 * Format a storyline model option with credits for dropdown display.
 */
export function formatStorylineModelLabel(option: StorylineModelOption): string {
  return `${option.label} (${Math.max(1, option.credits)} credits)`;
}

// ── Timeline / Storyboard generation credit helpers ─────────────────────────

/**
 * Estimate credit cost for generating an image for a shot,
 * based on the project's selected image model.
 */
export function getShotImageCredits(modelId?: string): number {
  const model = modelId ? getModelById(modelId) : null;
  return model?.credits ?? IMAGE_MODELS[0].credits;
}

/**
 * Estimate credit cost for generating a video for a shot,
 * based on the project's selected video model.
 */
export function getShotVideoCredits(modelId?: string): number {
  const model = modelId ? getModelById(modelId) : null;
  return model?.credits ?? VIDEO_MODELS[0].credits;
}

/**
 * Director's Cut estimated credits.
 * The Director's Cut composes all shot assets using FFmpeg Compose.
 * Derived from the studio-model-constants catalog to stay in sync.
 */
export const DIRECTORS_CUT_CREDITS: number =
  getModelCredits('fal-ai/ffmpeg-api/compose') ?? 12;
