import {
  GENERATED_GMI_MODEL_CATALOG,
  type GeneratedGmiCatalogEntry,
  type GeneratedGmiControlDefinition,
  type GeneratedGmiMediaType,
} from "./generated/gmi-model-catalog.ts";

export type SharedStudioSurface = "studio" | "kanvas";
export type SharedKanvasStudio = "image" | "video" | "edit" | "cinema" | "lipsync";
export type SharedKanvasMode =
  | "text-to-image"
  | "image-to-image"
  | "text-to-video"
  | "image-to-video"
  | "cinematic-image"
  | "talking-head"
  | "lip-sync";

export interface SharedCatalogModel extends GeneratedGmiCatalogEntry {
  supports: string[];
  defaults: Record<string, unknown>;
  controls: GeneratedGmiControlDefinition[];
}

const SUPPORT_ALIASES: Record<string, string[]> = {
  aspectRatio: ["aspect_ratio"],
  aspect_ratio: ["aspectRatio"],
  durationSeconds: ["duration_seconds", "duration"],
  duration_seconds: ["durationSeconds", "duration"],
  duration: ["durationSeconds", "duration_seconds"],
  generateAudio: ["generate_audio"],
  generate_audio: ["generateAudio"],
  image: ["image_url", "image_urls"],
  image_url: ["image", "image_urls"],
  image_urls: ["image", "image_url"],
  audio: ["audio_url", "voice_sample"],
  audio_url: ["audio", "voice_sample"],
  voice_sample: ["audio_url"],
  video: ["video_url"],
  video_url: ["video"],
};

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function withExpandedSupports(entry: GeneratedGmiCatalogEntry): SharedCatalogModel {
  const expandedSupports = unique(
    entry.supports.flatMap((support) => [support, ...(SUPPORT_ALIASES[support] ?? [])])
  );
  const defaults = { ...entry.defaults };

  if ("aspectRatio" in defaults && !("aspect_ratio" in defaults)) {
    defaults.aspect_ratio = defaults.aspectRatio;
  }
  if ("durationSeconds" in defaults && !("duration_seconds" in defaults)) {
    defaults.duration_seconds = defaults.durationSeconds;
  }
  if ("generateAudio" in defaults && !("generate_audio" in defaults)) {
    defaults.generate_audio = defaults.generateAudio;
  }

  return {
    ...entry,
    supports: expandedSupports,
    defaults,
    controls: entry.controls.map((control) => ({ ...control })),
  };
}

export const SHARED_GMI_MODEL_CATALOG: SharedCatalogModel[] = GENERATED_GMI_MODEL_CATALOG.map(withExpandedSupports);

const SHARED_GMI_MODEL_BY_ID = new Map(SHARED_GMI_MODEL_CATALOG.map((entry) => [entry.id, entry]));
const SHARED_GMI_MODEL_BY_ALIAS = new Map<string, SharedCatalogModel>();

for (const entry of SHARED_GMI_MODEL_CATALOG) {
  for (const alias of [entry.id, entry.endpointId, ...entry.aliases]) {
    SHARED_GMI_MODEL_BY_ALIAS.set(alias, entry);
  }
}

function includesAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

export function normalizeSharedGmiModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  return SHARED_GMI_MODEL_BY_ALIAS.get(trimmed)?.id ?? trimmed;
}

export function getSharedGmiModel(modelId: string): SharedCatalogModel | undefined {
  const normalized = normalizeSharedGmiModelId(modelId);
  return SHARED_GMI_MODEL_BY_ID.get(normalized);
}

export function resolveSharedGmiEndpointId(modelId: string): string {
  return getSharedGmiModel(modelId)?.endpointId ?? modelId.replace(/^gmi\//, "");
}

export function isSharedGmiModel(modelId: string): boolean {
  return Boolean(getSharedGmiModel(modelId) || modelId.startsWith("gmi/"));
}

function isImageEditModel(entry: SharedCatalogModel): boolean {
  const haystack = `${entry.endpointId} ${entry.description}`.toLowerCase();
  return (
    entry.mediaType === "image" &&
    (entry.workflowType === "image-to-image" ||
      includesAny(haystack, ["upscale", "remove bg", "background", "product", "edit", "inpaint", "outpaint", "relight", "styl"]))
  );
}

function isCinemaCapableModel(entry: SharedCatalogModel): boolean {
  return entry.mediaType === "image" && entry.workflowType === "text-to-image";
}

function isVideoGenerationModel(entry: SharedCatalogModel): boolean {
  return entry.mediaType === "video" && includesAny(entry.workflowType, ["text-to-video", "image-to-video", "element-generation"]);
}

function isLipsyncModel(entry: SharedCatalogModel): boolean {
  return entry.mediaType === "video" && includesAny(entry.workflowType, ["talking-head", "lip-sync"]);
}

export function listSharedGmiStudioModels(filters?: {
  mediaType?: GeneratedGmiMediaType;
  uiGroup?: "generation" | "advanced";
}): SharedCatalogModel[] {
  return SHARED_GMI_MODEL_CATALOG
    .filter((entry) => !filters?.mediaType || entry.mediaType === filters.mediaType)
    .filter((entry) => !filters?.uiGroup || entry.uiGroup === filters.uiGroup)
    .sort((left, right) => left.sortRank - right.sortRank || left.name.localeCompare(right.name));
}

export function listSharedGmiKanvasModels(input: {
  studio: SharedKanvasStudio;
  mode?: SharedKanvasMode;
}): SharedCatalogModel[] {
  const base = SHARED_GMI_MODEL_CATALOG.filter((entry) => {
    switch (input.studio) {
      case "image":
        return entry.mediaType === "image" && (entry.workflowType === "text-to-image" || entry.workflowType === "image-to-image");
      case "edit":
        return isImageEditModel(entry);
      case "cinema":
        return isCinemaCapableModel(entry);
      case "video":
        return isVideoGenerationModel(entry) && !isLipsyncModel(entry);
      case "lipsync":
        return isLipsyncModel(entry);
      default:
        return false;
    }
  });

  return base
    .filter((entry) => !input.mode || mapEntryToKanvasMode(entry, input.studio) === input.mode)
    .sort((left, right) => left.sortRank - right.sortRank || left.name.localeCompare(right.name));
}

export function mapEntryToKanvasMode(entry: SharedCatalogModel, studio: SharedKanvasStudio): SharedKanvasMode {
  if (studio === "cinema") return "cinematic-image";
  if (studio === "edit") return "image-to-image";
  if (studio === "image") {
    return entry.workflowType === "image-to-image" ? "image-to-image" : "text-to-image";
  }
  if (studio === "video") {
    return entry.workflowType === "image-to-video" ? "image-to-video" : "text-to-video";
  }
  return entry.workflowType === "lip-sync" ? "lip-sync" : "talking-head";
}

function findDefault(predicate: (entry: SharedCatalogModel) => boolean, fallbackMediaType: GeneratedGmiMediaType): string {
  return (
    SHARED_GMI_MODEL_CATALOG.find(predicate)?.id ??
    SHARED_GMI_MODEL_CATALOG.find((entry) => entry.mediaType === fallbackMediaType)?.id ??
    ""
  );
}

export const DEFAULT_SHARED_GMI_MODEL_IDS = {
  text: findDefault((entry) => entry.id === "gmi/gemini-3.1-flash-lite", "text"),
  image: findDefault((entry) => entry.id === "gmi/seedream-5.0-lite", "image"),
  videoText: findDefault((entry) => entry.id === "gmi/veo3-fast" || entry.workflowType === "text-to-video", "video"),
  videoImage: findDefault((entry) => entry.id === "gmi/kling-i2v-v2.1-master" || entry.workflowType === "image-to-video", "video"),
  audio: findDefault((entry) => entry.id === "gmi/minime-talks-workflow", "audio"),
};

export function getSharedGmiModelDisplayName(modelId: string): string {
  return getSharedGmiModel(modelId)?.name ?? modelId;
}
