import {
  CANONICAL_FAL_MODELS,
  type CanonicalFalModel,
} from "../supabase/functions/_shared/falai-client.ts";
import {
  KANVAS_MODELS,
  type KanvasStudioModel,
} from "../supabase/functions/_shared/kanvas.ts";
import {
  DEFAULT_SHARED_GMI_MODEL_IDS,
  SHARED_GMI_MODEL_CATALOG,
  listSharedGmiKanvasModels,
  mapEntryToKanvasMode,
  type SharedCatalogModel,
} from "../shared/gmi-model-catalog.ts";
import type {
  CatalogControlDefinition,
  CatalogKanvasMode,
  CatalogMediaType,
  CatalogModel,
  CatalogSurface,
  CatalogTransportType,
} from "../shared/ai-model-catalog.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SOURCE_PATH = Deno.args[0] ?? "/Users/gratitud3/Downloads/llm.txt";
const OUTPUT_PATH = `${ROOT}/supabase/seeds/ai-model-catalog.seed.json`;

const PROVIDER_RE = /^##\s+(.+?)\s*$/gm;
const MODEL_RE =
  /- \*\*Endpoint\*\*: `([^`]+)`\s+\*\*Category\*\*: ([^\n]+?)\s+\*\*Description\*\*: ([^\n]+?)\s+\*\*Pricing\*\*: ([^\n]+?)\s+\*\*API Example\*\*:\s*```bash\n(.*?)```/gms;
const JSON_KEY_RE = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g;
const STRING_VALUE_RE = (key: string) => new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
const NUMBER_VALUE_RE = (key: string) => new RegExp(`"${key}"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`);
const BOOLEAN_VALUE_RE = (key: string) => new RegExp(`"${key}"\\s*:\\s*(true|false)`);

const CANONICAL_ID_OVERRIDES: Record<string, string> = {
  "google/gemini-3.1-flash-lite-preview": "gmi/gemini-3.1-flash-lite",
  "deepseek-ai/DeepSeek-R1-0528": "gmi/deepseek-r1",
  "openai/gpt-4o-mini": "gmi/openai-o4-mini",
  "gemini-3.1-flash-image-preview": "gmi/gemini-3.1-flash-image-preview",
  "seedream-5-0-lite": "gmi/seedream-5.0-lite",
  "Kling-Image2Video-V2.1-Master": "gmi/kling-i2v-v2.1-master",
  "wan2.6-t2v": "gmi/wan2.6-t2v",
  "minimax-hailuo-2.3-fast": "gmi/minimax-hailuo-2.3",
  "veo-3": "gmi/veo3",
  "veo-3-fast": "gmi/veo3-fast",
  "GMI-MiniMeTalks-Workflow": "gmi/minime-talks-workflow",
};

const LEGACY_ALIASES: Record<string, string[]> = {
  "google/gemini-3.1-flash-lite-preview": ["gmi/google-gemini-3.1-flash-lite-preview"],
  "deepseek-ai/DeepSeek-R1-0528": ["gmi/deepseek-ai-deepseek-r1-0528"],
  "openai/gpt-4o-mini": ["gmi/openai-gpt-4o-mini"],
  "seedream-5-0-lite": ["gmi/seedream-5-0-lite", "gmi/seedream-5.0"],
  "Kling-Image2Video-V2.1-Master": ["gmi/kling-image2video-v2.1-master"],
  "wan2.6-t2v": ["gmi/wan-2.6-t2v"],
  "minimax-hailuo-2.3-fast": ["gmi/minimax-hailuo-2.3-fast"],
  "veo-3": ["gmi/veo-3"],
  "veo-3-fast": ["gmi/veo-3-fast"],
  "GMI-MiniMeTalks-Workflow": ["gmi/gmi-minime-talks-workflow"],
};

const ASPECT_RATIO_OPTIONS = ["1:1", "3:4", "4:3", "16:9", "9:16"];
const RESOLUTION_OPTIONS = [
  "720p",
  "1080p",
  "1440p",
  "2160p",
  "2K",
  "3K",
  "4K",
  "1920x1080",
  "2560x1440",
  "3840x2160",
];
const LANGUAGE_OPTIONS = ["en", "es", "fr", "de", "ja", "ko", "zh"];
const OUTPUT_FORMAT_OPTIONS = ["png", "jpeg", "jpg", "webp", "mp4", "mp3", "wav"];

interface ParsedGmiModel {
  endpointId: string;
  providerLabel: string;
  category: string;
  description: string;
  pricingText: string;
  rawApiExample: string;
  rawSourceBlock: string;
}

const gmiKanvasMembership = new Map<
  string,
  { surfaces: Set<CatalogSurface>; modes: Set<CatalogKanvasMode> }
>();

for (const studio of ["image", "video", "edit", "cinema", "lipsync"] as const) {
  for (const model of listSharedGmiKanvasModels({ studio })) {
    const entry = gmiKanvasMembership.get(model.id) ?? {
      surfaces: new Set<CatalogSurface>(),
      modes: new Set<CatalogKanvasMode>(),
    };
    entry.surfaces.add(`kanvas:${studio}` as CatalogSurface);
    entry.modes.add(mapEntryToKanvasMode(model, studio));
    gmiKanvasMembership.set(model.id, entry);
  }
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll("/", "-")
    .replaceAll(".", "-")
    .replaceAll("_", "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseFromEndpoint(endpoint: string): string {
  const value = endpoint.includes("/") ? endpoint.split("/").at(-1)! : endpoint;
  return value
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => (part === part.toUpperCase() || /^\d+$/.test(part) ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join(" ");
}

function extractKeys(apiExample: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of apiExample.matchAll(JSON_KEY_RE)) {
    const key = match[1];
    if (["model", "payload", "messages", "role", "content", "system", "user"].includes(key)) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function extractString(apiExample: string, key: string): string | undefined {
  return apiExample.match(STRING_VALUE_RE(key))?.[1];
}

function extractNumber(apiExample: string, key: string): number | undefined {
  const raw = apiExample.match(NUMBER_VALUE_RE(key))?.[1];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function extractBoolean(apiExample: string, key: string): boolean | undefined {
  const raw = apiExample.match(BOOLEAN_VALUE_RE(key))?.[1];
  if (!raw) return undefined;
  return raw === "true";
}

function inferMediaType(category: string): CatalogMediaType {
  switch (category.trim().toLowerCase()) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    default:
      return "text";
  }
}

function inferWorkflowType(
  endpointId: string,
  description: string,
  mediaType: CatalogMediaType,
  payloadKeys: string[],
): string {
  const haystack = `${endpointId} ${description}`.toLowerCase();
  const keySet = new Set(payloadKeys);

  if (mediaType === "text") {
    return "text-to-text";
  }
  if (mediaType === "image") {
    if (
      ["upscale", "background", "remove", "edit", "inpaint", "product", "relight"].some((value) =>
        haystack.includes(value)
      ) || keySet.has("image_url") || keySet.has("image_urls")
    ) {
      return "image-to-image";
    }
    return "text-to-image";
  }
  if (mediaType === "video") {
    if ((keySet.has("audio") || keySet.has("audio_url")) && (keySet.has("video") || keySet.has("video_url"))) {
      return "lip-sync";
    }
    if ((keySet.has("audio") || keySet.has("audio_url")) && (keySet.has("image") || keySet.has("image_url"))) {
      return "talking-head";
    }
    if (
      haystack.includes("image2video") ||
      haystack.includes("i2v") ||
      keySet.has("image") ||
      keySet.has("image_url") ||
      keySet.has("lastFrame")
    ) {
      return "image-to-video";
    }
    if (haystack.includes("element")) {
      return "element-generation";
    }
    return "text-to-video";
  }

  if (haystack.includes("speech-to-text") || haystack.includes("transcription")) {
    return "speech-to-text";
  }
  if (haystack.includes("voice-design")) {
    return "voice-design";
  }
  if (keySet.has("voice_sample") || keySet.has("speaker_audio") || keySet.has("reference_audio")) {
    return "voice-clone";
  }
  if (haystack.includes("music") || haystack.includes("sound effect") || haystack.includes("sfx")) {
    return "text-to-audio";
  }
  return "text-to-speech";
}

function inferRequiresAssets(
  mediaType: CatalogMediaType,
  workflowType: string,
  payloadKeys: string[],
): string[] {
  const keySet = new Set(payloadKeys);
  const requires: string[] = [];
  if (
    workflowType === "image-to-image" ||
    workflowType === "image-to-video" ||
    workflowType === "talking-head" ||
    keySet.has("image") ||
    keySet.has("image_url") ||
    keySet.has("image_urls")
  ) {
    requires.push("image");
  }
  if (workflowType === "lip-sync" || keySet.has("video") || keySet.has("video_url")) {
    requires.push("video");
  }
  if (
    ["talking-head", "lip-sync", "voice-clone", "speech-to-text", "audio-to-video"].includes(workflowType) ||
    keySet.has("audio") ||
    keySet.has("audio_url") ||
    keySet.has("voice_sample")
  ) {
    requires.push("audio");
  }
  if (mediaType === "audio" && workflowType === "voice-clone" && !requires.includes("audio")) {
    requires.push("audio");
  }
  return unique(requires);
}

function inferUiGroup(workflowType: string, description: string): "generation" | "advanced" {
  const haystack = description.toLowerCase();
  if (
    ["image-to-image", "speech-to-text", "voice-design", "image-edit"].includes(workflowType) ||
    ["utility", "analysis", "retouch", "background", "upscale"].some((value) => haystack.includes(value))
  ) {
    return "advanced";
  }
  return "generation";
}

function inferDefaults(apiExample: string, payloadKeys: string[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const key of [
    "aspectRatio",
    "aspect_ratio",
    "durationSeconds",
    "duration_seconds",
    "duration",
    "resolution",
    "speed",
    "language",
    "output_format",
    "fps",
    "mode",
  ]) {
    if (!payloadKeys.includes(key)) continue;
    const stringValue = extractString(apiExample, key);
    if (stringValue !== undefined) {
      defaults[key] = stringValue;
      continue;
    }
    const numericValue = extractNumber(apiExample, key);
    if (numericValue !== undefined) {
      defaults[key] = numericValue;
    }
  }
  for (const key of ["generateAudio", "generate_audio", "watermark"]) {
    if (!payloadKeys.includes(key)) continue;
    const booleanValue = extractBoolean(apiExample, key);
    if (booleanValue !== undefined) {
      defaults[key] = booleanValue;
    }
  }
  return defaults;
}

function inferSupports(
  mediaType: CatalogMediaType,
  workflowType: string,
  payloadKeys: string[],
): string[] {
  const supports: string[] = [];
  if (["text", "image", "video", "audio"].includes(mediaType)) {
    supports.push("prompt");
  }
  if (workflowType === "text-to-text") {
    supports.push("messages", "max_tokens", "temperature");
  }
  if (["image-to-image", "image-to-video", "talking-head"].includes(workflowType)) {
    supports.push("image_url", "image_urls");
  }
  if (workflowType === "lip-sync") {
    supports.push("video_url");
  }
  if (mediaType === "audio") {
    supports.push("text", "audio_url");
  }
  for (const key of payloadKeys) {
    if (["prompt", "image", "image_url", "image_urls", "video", "video_url", "audio", "audio_url"].includes(key)) {
      continue;
    }
    supports.push(key);
  }
  return unique(supports);
}

function inferControls(
  payloadKeys: string[],
  defaults: Record<string, unknown>,
): CatalogControlDefinition[] {
  const keySet = new Set(payloadKeys);
  const controls: CatalogControlDefinition[] = [];

  if (keySet.has("aspectRatio") || keySet.has("aspect_ratio")) {
    const key = keySet.has("aspectRatio") ? "aspectRatio" : "aspect_ratio";
    controls.push({
      key,
      label: "Aspect Ratio",
      type: "select",
      defaultValue: (defaults[key] as string | undefined) ?? "16:9",
      options: ASPECT_RATIO_OPTIONS.map((value) => ({ label: value, value })),
    });
  }
  for (const key of ["durationSeconds", "duration_seconds", "duration"]) {
    if (!keySet.has(key)) continue;
    controls.push({
      key,
      label: "Duration",
      type: "number",
      defaultValue: (defaults[key] as number | undefined) ?? 5,
      min: 1,
      max: 30,
      step: 1,
    });
    break;
  }
  if (keySet.has("resolution")) {
    controls.push({
      key: "resolution",
      label: "Resolution",
      type: "select",
      defaultValue: (defaults.resolution as string | undefined) ?? "1080p",
      options: RESOLUTION_OPTIONS.map((value) => ({ label: value, value })),
    });
  }
  if (keySet.has("fps")) {
    controls.push({
      key: "fps",
      label: "FPS",
      type: "number",
      defaultValue: (defaults.fps as number | undefined) ?? 24,
      min: 1,
      max: 60,
      step: 1,
    });
  }
  if (keySet.has("language")) {
    controls.push({
      key: "language",
      label: "Language",
      type: "select",
      defaultValue: (defaults.language as string | undefined) ?? "en",
      options: LANGUAGE_OPTIONS.map((value) => ({ label: value.toUpperCase(), value })),
    });
  }
  if (keySet.has("output_format")) {
    controls.push({
      key: "output_format",
      label: "Format",
      type: "select",
      defaultValue: (defaults.output_format as string | undefined) ?? "png",
      options: OUTPUT_FORMAT_OPTIONS.map((value) => ({ label: value.toUpperCase(), value })),
    });
  }
  for (const key of ["generateAudio", "generate_audio", "watermark"]) {
    if (!keySet.has(key)) continue;
    controls.push({
      key,
      label: key === "watermark" ? "Watermark" : "Generate Audio",
      type: "boolean",
      defaultValue: (defaults[key] as boolean | undefined) ?? false,
    });
  }
  if (keySet.has("mode")) {
    controls.push({
      key: "mode",
      label: "Quality",
      type: "select",
      defaultValue: (defaults.mode as string | undefined) ?? "std",
      options: [
        { label: "Standard", value: "std" },
        { label: "Professional", value: "pro" },
      ],
    });
  }

  return controls;
}

function inferTransportType(apiExample: string, mediaType: CatalogMediaType): CatalogTransportType {
  if (apiExample.includes("api.gmi-serving.com/v1/chat/completions") || mediaType === "text") {
    return "chat_completion";
  }
  return "request_queue";
}

function parsePricing(pricingText: string, credits = 0): Record<string, unknown> {
  const pricing: Record<string, unknown> = { raw: pricingText };
  const usdMatches = [...pricingText.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)];
  if (usdMatches[0]) {
    pricing.usd = Number(usdMatches[0][1]);
    pricing.currency = "USD";
  }
  if (pricingText.includes("/1M input")) {
    const inputMatch = pricingText.match(/\$([0-9]+(?:\.[0-9]+)?)\/1M input/i);
    const outputMatch = pricingText.match(/\$([0-9]+(?:\.[0-9]+)?)\/1M output/i);
    if (inputMatch) pricing.inputUsdPer1M = Number(inputMatch[1]);
    if (outputMatch) pricing.outputUsdPer1M = Number(outputMatch[1]);
  }
  pricing.credits = credits;
  return pricing;
}

function sanitizeAliases(values: string[]): string[] {
  return unique(values.filter((value) => value && value.trim().length > 0));
}

function makeGmiId(endpointId: string): string {
  return CANONICAL_ID_OVERRIDES[endpointId] ?? `gmi/${slugify(endpointId)}`;
}

function parseGmiModels(source: string): ParsedGmiModel[] {
  const models: ParsedGmiModel[] = [];
  for (const match of source.matchAll(MODEL_RE)) {
    const full = match[0];
    const endpointId = match[1].trim();
    const category = match[2].trim();
    const description = match[3].trim();
    const pricingText = match[4].trim();
    const rawApiExample = match[5].trim();

    let providerLabel = "GMI";
    for (const providerMatch of source.matchAll(PROVIDER_RE)) {
      if (providerMatch.index === undefined || match.index === undefined) continue;
      if (providerMatch.index > match.index) break;
      providerLabel = providerMatch[1].trim();
    }

    models.push({
      endpointId,
      providerLabel,
      category,
      description,
      pricingText,
      rawApiExample,
      rawSourceBlock: full.trim(),
    });
  }
  return models;
}

function buildSurfaceSet(base: CatalogSurface[], mediaType: CatalogMediaType): Set<CatalogSurface> {
  const surfaces = new Set<CatalogSurface>(base);
  surfaces.add(`studio:${mediaType}` as CatalogSurface);
  return surfaces;
}

function mapSharedDefaults(modelId: string): { isDefault: boolean; defaultRank: number } {
  const ranking = [
    DEFAULT_SHARED_GMI_MODEL_IDS.text,
    DEFAULT_SHARED_GMI_MODEL_IDS.image,
    DEFAULT_SHARED_GMI_MODEL_IDS.videoText,
    DEFAULT_SHARED_GMI_MODEL_IDS.videoImage,
    DEFAULT_SHARED_GMI_MODEL_IDS.audio,
  ].filter(Boolean);
  const index = ranking.indexOf(modelId);
  return index === -1
    ? { isDefault: false, defaultRank: 1000 }
    : { isDefault: true, defaultRank: (index + 1) * 10 };
}

function gmiRowFromParsed(model: ParsedGmiModel, index: number): CatalogModel {
  const payloadKeys = extractKeys(model.rawApiExample);
  const inferredMediaType = inferMediaType(model.category);
  const inferredWorkflowType = inferWorkflowType(
    model.endpointId,
    model.description,
    inferredMediaType,
    payloadKeys,
  );
  const inferredDefaults = inferDefaults(model.rawApiExample, payloadKeys);
  const inferredControls = inferControls(payloadKeys, inferredDefaults);
  const inferredSupports = inferSupports(inferredMediaType, inferredWorkflowType, payloadKeys);
  const inferredRequiresAssets = inferRequiresAssets(inferredMediaType, inferredWorkflowType, payloadKeys);
  const inferredTransport = inferTransportType(model.rawApiExample, inferredMediaType);
  const inferredUiGroup = inferUiGroup(inferredWorkflowType, model.description);

  const sharedEntry = SHARED_GMI_MODEL_CATALOG.find((entry) => entry.endpointId === model.endpointId);
  const id = sharedEntry?.id ?? makeGmiId(model.endpointId);
  const kanvasMembership = gmiKanvasMembership.get(id);
  const defaultInfo = mapSharedDefaults(id);

  return {
    id,
    endpointId: model.endpointId,
    provider: "gmi-cloud",
    providerLabel: model.providerLabel,
    name: sharedEntry?.name ?? titleCaseFromEndpoint(model.endpointId),
    description: model.description,
    category: model.category.toLowerCase(),
    pricingText: model.pricingText,
    pricing: parsePricing(model.pricingText, sharedEntry?.credits ?? 0),
    transportType: (sharedEntry?.transport as CatalogTransportType | undefined) ?? inferredTransport,
    mediaType: (sharedEntry?.mediaType as CatalogMediaType | undefined) ?? inferredMediaType,
    workflowType: sharedEntry?.workflowType ?? inferredWorkflowType,
    uiGroup: (sharedEntry?.uiGroup as "generation" | "advanced" | undefined) ?? inferredUiGroup,
    supports: sanitizeAliases([...(sharedEntry?.supports ?? inferredSupports)]),
    payloadKeys: unique(sharedEntry?.payloadKeys ?? payloadKeys),
    requiresAssets: unique(sharedEntry?.requiresAssets ?? inferredRequiresAssets),
    defaults: { ...inferredDefaults, ...(sharedEntry?.defaults ?? {}) },
    controls: (sharedEntry?.controls as CatalogControlDefinition[] | undefined) ?? inferredControls,
    aliases: sanitizeAliases([
      model.endpointId,
      ...(sharedEntry?.aliases ?? []),
      ...(LEGACY_ALIASES[model.endpointId] ?? []),
    ]),
    enabled: true,
    credits: sharedEntry?.credits ?? 0,
    timeLabel: sharedEntry?.time ?? "~10s",
    sortRank: sharedEntry?.sortRank ?? index + 1,
    studioSurfaces: Array.from(
      buildSurfaceSet(
        Array.from(kanvasMembership?.surfaces ?? []),
        (sharedEntry?.mediaType as CatalogMediaType | undefined) ?? inferredMediaType,
      ),
    ),
    kanvasModes: Array.from(kanvasMembership?.modes ?? []),
    rawApiExample: model.rawApiExample,
    rawPayload: { payloadKeys },
    rawSourceBlock: model.rawSourceBlock,
    isDefault: defaultInfo.isDefault,
    defaultRank: defaultInfo.defaultRank,
  };
}

function legacyKanvasLookup(model: { id: string; aliases?: string[] }): KanvasStudioModel[] {
  return KANVAS_MODELS.filter((entry) => entry.id === model.id || entry.aliases.some((alias) => model.aliases?.includes(alias) || alias === model.id));
}

function legacyFalRow(model: CanonicalFalModel, index: number): CatalogModel {
  const kanvasMatches = legacyKanvasLookup({ id: model.id, aliases: [] });
  const studioSurfaces = new Set<CatalogSurface>([`studio:${model.media_type}` as CatalogSurface]);
  const kanvasModes = new Set<CatalogKanvasMode>();

  for (const match of kanvasMatches) {
    studioSurfaces.add(`kanvas:${match.studio}` as CatalogSurface);
    kanvasModes.add(match.mode);
  }

  const controls = kanvasMatches.flatMap((match) => match.controls) as CatalogControlDefinition[];
  const defaults = Object.assign({}, model.defaults, ...kanvasMatches.map((match) => match.defaults));
  const requiresAssets = unique(
    kanvasMatches.flatMap((match) => match.requiresAssets).concat(
      model.supports.includes("image_url") || model.supports.includes("image_urls") ? ["image"] : [],
      model.supports.includes("video_url") ? ["video"] : [],
      model.supports.includes("audio_url") ? ["audio"] : [],
    ),
  );

  return {
    id: model.id,
    endpointId: model.id,
    provider: "fal-ai",
    providerLabel: "fal-ai",
    name: model.name,
    description: model.description,
    category: model.category,
    pricingText: `${kanvasMatches[0]?.credits ?? 0} credits`,
    pricing: parsePricing(`${kanvasMatches[0]?.credits ?? 0} credits`, kanvasMatches[0]?.credits ?? 0),
    transportType: "fal_queue",
    mediaType: model.media_type as CatalogMediaType,
    workflowType: model.workflow_type,
    uiGroup: model.ui_group,
    supports: unique(model.supports),
    payloadKeys: unique(model.supports),
    requiresAssets,
    defaults,
    controls,
    aliases: sanitizeAliases(
      kanvasMatches.flatMap((match) => match.aliases).concat(model.id),
    ),
    enabled: true,
    credits: kanvasMatches[0]?.credits ?? 1,
    timeLabel: "~30s",
    sortRank: 10_000 + index,
    studioSurfaces: Array.from(studioSurfaces),
    kanvasModes: Array.from(kanvasModes),
    rawApiExample: "",
    rawPayload: { source: "CANONICAL_FAL_MODELS" },
    rawSourceBlock: "CANONICAL_FAL_MODELS",
    isDefault: false,
    defaultRank: 1000,
  };
}

function manualLegacyRows(): CatalogModel[] {
  return [
    {
      id: "google/gemini-2.5-flash",
      endpointId: "gemini-text-generation:google/gemini-2.5-flash",
      provider: "lovable-ai",
      providerLabel: "Google",
      name: "Gemini 2.5 Flash",
      description: "Fast general-purpose text model.",
      category: "text-generation",
      pricingText: "3 credits",
      pricing: { credits: 3, raw: "3 credits" },
      transportType: "edge_function",
      mediaType: "text",
      workflowType: "text-to-text",
      uiGroup: "generation",
      supports: ["prompt", "messages", "max_tokens", "temperature"],
      payloadKeys: ["prompt", "messages", "max_tokens", "temperature"],
      requiresAssets: [],
      defaults: {},
      controls: [],
      aliases: [],
      enabled: true,
      credits: 3,
      timeLabel: "~4s",
      sortRank: 20_001,
      studioSurfaces: ["studio:text"],
      kanvasModes: [],
      rawApiExample: "",
      rawPayload: { edge_function: "gemini-text-generation", model: "google/gemini-2.5-flash" },
      rawSourceBlock: "legacy-text-model",
      isDefault: false,
      defaultRank: 1000,
    },
    {
      id: "google/gemini-2.5-pro",
      endpointId: "gemini-text-generation:google/gemini-2.5-pro",
      provider: "lovable-ai",
      providerLabel: "Google",
      name: "Gemini 2.5 Pro",
      description: "High-context reasoning model.",
      category: "text-generation",
      pricingText: "5 credits",
      pricing: { credits: 5, raw: "5 credits" },
      transportType: "edge_function",
      mediaType: "text",
      workflowType: "text-to-text",
      uiGroup: "generation",
      supports: ["prompt", "messages", "max_tokens", "temperature"],
      payloadKeys: ["prompt", "messages", "max_tokens", "temperature"],
      requiresAssets: [],
      defaults: {},
      controls: [],
      aliases: [],
      enabled: true,
      credits: 5,
      timeLabel: "~8s",
      sortRank: 20_002,
      studioSurfaces: ["studio:text"],
      kanvasModes: [],
      rawApiExample: "",
      rawPayload: { edge_function: "gemini-text-generation", model: "google/gemini-2.5-pro" },
      rawSourceBlock: "legacy-text-model",
      isDefault: false,
      defaultRank: 1000,
    },
    {
      id: "openai/gpt-5-mini",
      endpointId: "gemini-text-generation:openai/gpt-5-mini",
      provider: "lovable-ai",
      providerLabel: "OpenAI",
      name: "GPT-5 Mini",
      description: "Efficient general-purpose model.",
      category: "text-generation",
      pricingText: "3 credits",
      pricing: { credits: 3, raw: "3 credits" },
      transportType: "edge_function",
      mediaType: "text",
      workflowType: "text-to-text",
      uiGroup: "generation",
      supports: ["prompt", "messages", "max_tokens", "temperature"],
      payloadKeys: ["prompt", "messages", "max_tokens", "temperature"],
      requiresAssets: [],
      defaults: {},
      controls: [],
      aliases: [],
      enabled: true,
      credits: 3,
      timeLabel: "~4s",
      sortRank: 20_003,
      studioSurfaces: ["studio:text"],
      kanvasModes: [],
      rawApiExample: "",
      rawPayload: { edge_function: "gemini-text-generation", model: "openai/gpt-5-mini" },
      rawSourceBlock: "legacy-text-model",
      isDefault: false,
      defaultRank: 1000,
    },
    {
      id: "openai/gpt-5",
      endpointId: "gemini-text-generation:openai/gpt-5",
      provider: "lovable-ai",
      providerLabel: "OpenAI",
      name: "GPT-5",
      description: "Highest capability text model.",
      category: "text-generation",
      pricingText: "8 credits",
      pricing: { credits: 8, raw: "8 credits" },
      transportType: "edge_function",
      mediaType: "text",
      workflowType: "text-to-text",
      uiGroup: "generation",
      supports: ["prompt", "messages", "max_tokens", "temperature"],
      payloadKeys: ["prompt", "messages", "max_tokens", "temperature"],
      requiresAssets: [],
      defaults: {},
      controls: [],
      aliases: [],
      enabled: true,
      credits: 8,
      timeLabel: "~10s",
      sortRank: 20_004,
      studioSurfaces: ["studio:text"],
      kanvasModes: [],
      rawApiExample: "",
      rawPayload: { edge_function: "gemini-text-generation", model: "openai/gpt-5" },
      rawSourceBlock: "legacy-text-model",
      isDefault: false,
      defaultRank: 1000,
    },
    {
      id: "elevenlabs-tts",
      endpointId: "elevenlabs-tts",
      provider: "elevenlabs",
      providerLabel: "ElevenLabs",
      name: "ElevenLabs TTS",
      description: "Text-to-speech voice generation.",
      category: "audio-generation",
      pricingText: "4 credits",
      pricing: { credits: 4, raw: "4 credits" },
      transportType: "edge_function",
      mediaType: "audio",
      workflowType: "text-to-speech",
      uiGroup: "generation",
      supports: ["prompt", "text", "voice_id"],
      payloadKeys: ["text", "voiceId"],
      requiresAssets: [],
      defaults: {},
      controls: [],
      aliases: [],
      enabled: true,
      credits: 4,
      timeLabel: "~5s",
      sortRank: 20_101,
      studioSurfaces: ["studio:audio"],
      kanvasModes: [],
      rawApiExample: "",
      rawPayload: { edge_function: "elevenlabs-tts" },
      rawSourceBlock: "legacy-audio-model",
      isDefault: false,
      defaultRank: 1000,
    },
    {
      id: "elevenlabs-sfx",
      endpointId: "elevenlabs-sfx",
      provider: "elevenlabs",
      providerLabel: "ElevenLabs",
      name: "ElevenLabs SFX",
      description: "Short sound effect generation.",
      category: "audio-generation",
      pricingText: "4 credits",
      pricing: { credits: 4, raw: "4 credits" },
      transportType: "edge_function",
      mediaType: "audio",
      workflowType: "text-to-audio",
      uiGroup: "generation",
      supports: ["prompt", "duration"],
      payloadKeys: ["prompt", "duration"],
      requiresAssets: [],
      defaults: { duration: 5 },
      controls: [],
      aliases: [],
      enabled: true,
      credits: 4,
      timeLabel: "~5s",
      sortRank: 20_102,
      studioSurfaces: ["studio:audio"],
      kanvasModes: [],
      rawApiExample: "",
      rawPayload: { edge_function: "elevenlabs-sfx" },
      rawSourceBlock: "legacy-audio-model",
      isDefault: false,
      defaultRank: 1000,
    },
    {
      id: "elevenlabs-music",
      endpointId: "elevenlabs-music",
      provider: "elevenlabs",
      providerLabel: "ElevenLabs",
      name: "ElevenLabs Music",
      description: "Music generation from a text prompt.",
      category: "audio-generation",
      pricingText: "4 credits",
      pricing: { credits: 4, raw: "4 credits" },
      transportType: "edge_function",
      mediaType: "audio",
      workflowType: "text-to-audio",
      uiGroup: "generation",
      supports: ["prompt", "duration"],
      payloadKeys: ["prompt", "duration"],
      requiresAssets: [],
      defaults: { duration: 30 },
      controls: [],
      aliases: [],
      enabled: true,
      credits: 4,
      timeLabel: "~8s",
      sortRank: 20_103,
      studioSurfaces: ["studio:audio"],
      kanvasModes: [],
      rawApiExample: "",
      rawPayload: { edge_function: "elevenlabs-music" },
      rawSourceBlock: "legacy-audio-model",
      isDefault: false,
      defaultRank: 1000,
    },
  ];
}

function ensureUniqueModelIds(rows: CatalogModel[]): CatalogModel[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const count = seen.get(row.id) ?? 0;
    seen.set(row.id, count + 1);
    if (count === 0) {
      return row;
    }

    const suffixedId = `${row.id}-${slugify(row.workflowType || row.category || String(count + 1)) || count + 1}`;
    return {
      ...row,
      id: suffixedId,
      aliases: sanitizeAliases([row.id, ...row.aliases]),
      isDefault: false,
      defaultRank: 1000 + count,
    };
  });
}

function dedupeRows(rows: CatalogModel[]): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }

    byId.set(row.id, {
      ...existing,
      ...row,
      aliases: sanitizeAliases([...existing.aliases, ...row.aliases]),
      supports: unique([...existing.supports, ...row.supports]),
      payloadKeys: unique([...existing.payloadKeys, ...row.payloadKeys]),
      requiresAssets: unique([...existing.requiresAssets, ...row.requiresAssets]),
      studioSurfaces: unique([...existing.studioSurfaces, ...row.studioSurfaces]) as CatalogSurface[],
      kanvasModes: unique([...existing.kanvasModes, ...row.kanvasModes]) as CatalogKanvasMode[],
      defaults: { ...existing.defaults, ...row.defaults },
      controls: row.controls.length > 0 ? row.controls : existing.controls,
      rawPayload: { ...existing.rawPayload, ...row.rawPayload },
    });
  }
  return Array.from(byId.values()).sort(
    (left, right) => left.sortRank - right.sortRank || left.name.localeCompare(right.name),
  );
}

const source = await Deno.readTextFile(SOURCE_PATH);
const gmiRows = ensureUniqueModelIds(parseGmiModels(source).map(gmiRowFromParsed));
const falRows = CANONICAL_FAL_MODELS.map(legacyFalRow);
const rows = dedupeRows([...gmiRows, ...falRows, ...manualLegacyRows()]);

await Deno.mkdir(`${ROOT}/supabase/seeds`, { recursive: true });
await Deno.writeTextFile(OUTPUT_PATH, `${JSON.stringify(rows, null, 2)}\n`);

console.log(`Wrote ${rows.length} catalog rows to ${OUTPUT_PATH}`);
