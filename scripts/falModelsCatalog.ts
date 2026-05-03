import type {
  CatalogControlDefinition,
  CatalogMediaType,
  CatalogModel,
  CatalogSurface,
} from "../shared/ai-model-catalog.ts";

export interface ParsedFalModel {
  index: number;
  endpointId: string;
  modelName: string;
  category: string;
  cost: string;
  pricingNote: string;
  license: string;
  publishedAt: string;
  updatedAt: string;
  tags: string[];
  modelUrl: string;
  description: string;
  payloadKeys: string[];
  inputExample: string;
  rawTypeScriptExample: string;
  rawJavaScriptExample: string;
  rawSourceBlock: string;
}

const MODEL_HEADING_RE = /^###\s+([0-9]+)\.\s+`([^`]+)`\s*$/gm;
const JSON_KEY_RE = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g;

const RECOMMENDED_FAL_ENDPOINTS = new Map<
  string,
  { surfaces: CatalogSurface[]; defaultRank: number }
>([
  ["fal-ai/nano-banana-2", { surfaces: ["studio:image"], defaultRank: 10 }],
  ["fal-ai/nano-banana-2/edit", { surfaces: ["studio:image"], defaultRank: 20 }],
  ["fal-ai/kling-video/o3/standard/text-to-video", { surfaces: ["studio:video"], defaultRank: 30 }],
  ["fal-ai/kling-video/o3/standard/image-to-video", { surfaces: ["studio:video"], defaultRank: 40 }],
  ["fal-ai/elevenlabs/tts/turbo-v2.5", { surfaces: ["studio:audio"], defaultRank: 50 }],
  ["fal-ai/trellis/multi", { surfaces: ["studio:3d"], defaultRank: 60 }],
  ["openai/gpt-image-2", { surfaces: ["studio:image"], defaultRank: 70 }],
  ["openai/gpt-image-2/edit", { surfaces: ["studio:image"], defaultRank: 80 }],
]);

const ASPECT_RATIO_OPTIONS = ["1:1", "3:4", "4:3", "16:9", "9:16"];
const RESOLUTION_OPTIONS = ["512", "720p", "1080p", "1440p", "2K", "4K"];
const OUTPUT_FORMAT_OPTIONS = ["png", "jpeg", "jpg", "webp", "mp4", "mp3", "wav", "glb", "obj"];

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function extractLine(block: string, label: string): string {
  return block.match(new RegExp(`^- ${label}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
}

function extractCodeBlock(block: string, language: "ts" | "js"): string {
  return block.match(new RegExp("```" + language + "\\n([\\s\\S]*?)\\n```", "m"))?.[1]?.trim() ?? "";
}

function extractBalancedObject(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return "";
  const braceStart = source.indexOf("{", markerIndex);
  if (braceStart === -1) return "";

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart, index + 1);
      }
    }
  }
  return "";
}

function extractPayloadKeys(inputExample: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of inputExample.matchAll(JSON_KEY_RE)) {
    const key = match[1];
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function parseTags(raw: string): string[] {
  if (!raw || raw.toLowerCase() === "none") return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function inferMediaType(category: string): CatalogMediaType {
  const normalized = category.toLowerCase();
  const output = normalized.includes("-to-") ? normalized.split("-to-").at(-1) ?? normalized : normalized;
  if (output.includes("3d")) return "3d";
  if (output.includes("image")) return "image";
  if (output.includes("video")) return "video";
  if (output.includes("audio") || output.includes("speech")) return "audio";
  if (output.includes("json") || normalized === "vision" || normalized === "workflow" || normalized === "training") return "json";
  return "text";
}

function inferWorkflowType(category: string): string {
  const normalized = category.toLowerCase();
  if (normalized === "llm") return "text-to-text";
  if (normalized === "vision") return "vision";
  if (normalized === "workflow") return "workflow";
  if (normalized === "unknown") return "unknown";
  return normalized;
}

function inferUiGroup(category: string): "generation" | "advanced" {
  return [
    "text-to-image",
    "text-to-video",
    "image-to-video",
    "text-to-audio",
    "text-to-speech",
    "text-to-3d",
    "image-to-3d",
  ].includes(category.toLowerCase())
    ? "generation"
    : "advanced";
}

function inferRequiresAssets(payloadKeys: string[], workflowType: string): string[] {
  const keySet = new Set(payloadKeys);
  const requires: string[] = [];
  if (workflowType.includes("image-to") || keySet.has("image") || keySet.has("image_url") || keySet.has("image_urls")) {
    requires.push("image");
  }
  if (workflowType.includes("video-to") || keySet.has("video") || keySet.has("video_url")) {
    requires.push("video");
  }
  if (
    workflowType.includes("audio-to") ||
    workflowType.includes("speech-to") ||
    keySet.has("audio") ||
    keySet.has("audio_url") ||
    keySet.has("voice_sample") ||
    keySet.has("voice_id")
  ) {
    requires.push("audio");
  }
  return unique(requires);
}

function inferSupports(mediaType: CatalogMediaType, workflowType: string, payloadKeys: string[]): string[] {
  const supports = [...payloadKeys];
  if (payloadKeys.includes("prompt") || workflowType.startsWith("text-to")) supports.push("prompt");
  if (mediaType === "image") supports.push("image");
  if (mediaType === "video") supports.push("video");
  if (mediaType === "audio") supports.push("audio");
  if (mediaType === "3d") supports.push("3d");
  return unique(supports);
}

function inferControls(payloadKeys: string[]): CatalogControlDefinition[] {
  const keySet = new Set(payloadKeys);
  const controls: CatalogControlDefinition[] = [];

  if (keySet.has("aspect_ratio") || keySet.has("aspectRatio")) {
    const key = keySet.has("aspect_ratio") ? "aspect_ratio" : "aspectRatio";
    controls.push({
      key,
      label: "Aspect Ratio",
      type: "select",
      defaultValue: "16:9",
      options: ASPECT_RATIO_OPTIONS.map((value) => ({ label: value, value })),
    });
  }
  if (keySet.has("resolution")) {
    controls.push({
      key: "resolution",
      label: "Resolution",
      type: "select",
      defaultValue: "1080p",
      options: RESOLUTION_OPTIONS.map((value) => ({ label: value.toUpperCase(), value })),
    });
  }
  for (const key of ["duration", "duration_seconds", "num_frames", "fps", "seed", "num_images"]) {
    if (!keySet.has(key)) continue;
    controls.push({
      key,
      label: key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      type: "number",
      defaultValue: key === "num_images" ? 1 : undefined,
      min: key === "seed" ? 0 : 1,
      max: key === "fps" ? 60 : undefined,
      step: 1,
    });
  }
  if (keySet.has("output_format")) {
    controls.push({
      key: "output_format",
      label: "Format",
      type: "select",
      defaultValue: "png",
      options: OUTPUT_FORMAT_OPTIONS.map((value) => ({ label: value.toUpperCase(), value })),
    });
  }
  for (const key of ["generate_audio", "watermark", "enable_safety_checker"]) {
    if (!keySet.has(key)) continue;
    controls.push({
      key,
      label: key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      type: "boolean",
      defaultValue: key === "enable_safety_checker",
    });
  }
  return controls;
}

function inferDefaults(payloadKeys: string[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  if (payloadKeys.includes("num_images")) defaults.num_images = 1;
  if (payloadKeys.includes("aspect_ratio")) defaults.aspect_ratio = "16:9";
  if (payloadKeys.includes("output_format")) defaults.output_format = "png";
  if (payloadKeys.includes("duration")) defaults.duration = 5;
  return defaults;
}

function titleCase(value: string): string {
  return value
    .split(/[-_/.\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function inferVendor(endpointId: string, modelName: string): string {
  const haystack = `${endpointId} ${modelName}`.toLowerCase();
  if (haystack.includes("openai") || haystack.includes("gpt-image") || haystack.includes("gpt-")) return "OpenAI";
  if (haystack.includes("gemini") || haystack.includes("imagen") || haystack.includes("nano-banana") || haystack.includes("veo")) return "Google";
  if (haystack.includes("kling")) return "Kling";
  if (haystack.includes("bytedance") || haystack.includes("seedance") || haystack.includes("seedream")) return "ByteDance";
  if (haystack.includes("elevenlabs")) return "ElevenLabs";
  if (haystack.includes("luma")) return "Luma";
  if (haystack.includes("pixverse")) return "PixVerse";
  if (haystack.includes("ideogram")) return "Ideogram";
  if (haystack.includes("flux")) return "Black Forest Labs";
  if (haystack.includes("wan")) return "Wan";
  if (haystack.includes("hunyuan")) return "Tencent";
  if (haystack.includes("qwen")) return "Alibaba";
  const firstSegment = endpointId.split("/")[0];
  return firstSegment === "fal-ai" ? "Fal" : titleCase(firstSegment);
}

function inferFamily(endpointId: string, modelName: string): string {
  const haystack = `${endpointId} ${modelName}`.toLowerCase();
  if (haystack.includes("nano-banana")) return "Nano Banana";
  if (haystack.includes("gpt-image")) return "GPT Image";
  if (haystack.includes("kling-video")) return "Kling Video";
  if (haystack.includes("elevenlabs")) return "ElevenLabs";
  if (haystack.includes("trellis")) return "Trellis";
  if (haystack.includes("seedance")) return "Seedance";
  if (haystack.includes("seedream")) return "Seedream";
  if (haystack.includes("veo")) return "Veo";
  if (haystack.includes("flux")) return "Flux";
  return modelName.split(/\s+/).slice(0, 2).join(" ") || titleCase(endpointId.split("/").at(-1) ?? endpointId);
}

function inferTier(endpointId: string, cost: string): string {
  const haystack = `${endpointId} ${cost}`.toLowerCase();
  if (haystack.includes("fast") || haystack.includes("turbo") || haystack.includes("lite") || haystack.includes("distill")) return "fast";
  if (haystack.includes("pro") || haystack.includes("ultra") || haystack.includes("master") || haystack.includes("4k")) return "premium";
  if (haystack.includes("$0 /")) return "utility";
  return "standard";
}

function parsePricing(cost: string, pricingNote: string): Record<string, unknown> {
  const pricing: Record<string, unknown> = { raw: cost, note: pricingNote };
  const usd = cost.match(/\$([0-9]+(?:\.[0-9]+)?)/)?.[1];
  const unit = cost.match(/\/\s*([^()]+?)\s+USD/i)?.[1]?.trim();
  const source = cost.match(/\(([^)]+)\)\s*$/)?.[1];
  if (usd) {
    pricing.usd = Number(usd);
    pricing.currency = "USD";
  }
  if (unit) pricing.unit = unit;
  if (source) pricing.source = source;
  return pricing;
}

function estimateCredits(cost: string): number {
  const usd = Number(cost.match(/\$([0-9]+(?:\.[0-9]+)?)/)?.[1] ?? 0);
  if (!Number.isFinite(usd) || usd <= 0) return 1;
  return Math.max(1, Math.ceil(usd * 100));
}

function inferTimeLabel(mediaType: CatalogMediaType, workflowType: string): string {
  if (mediaType === "video") return "~60s";
  if (mediaType === "audio") return "~10s";
  if (mediaType === "3d") return "~90s";
  if (workflowType === "vision" || mediaType === "json") return "~8s";
  return "~10s";
}

function studioSurfaceForMediaType(mediaType: CatalogMediaType): CatalogSurface {
  return `studio:${mediaType}` as CatalogSurface;
}

export function parseFalModelsMarkdown(markdown: string): ParsedFalModel[] {
  const headings = Array.from(markdown.matchAll(MODEL_HEADING_RE));
  return headings.map((heading, index) => {
    const blockStart = heading.index ?? 0;
    const blockEnd = headings[index + 1]?.index ?? markdown.length;
    const rawSourceBlock = markdown.slice(blockStart, blockEnd).trim();
    const rawTypeScriptExample = extractCodeBlock(rawSourceBlock, "ts");
    const rawJavaScriptExample = extractCodeBlock(rawSourceBlock, "js");
    const inputExample =
      extractBalancedObject(rawTypeScriptExample, "input:") ||
      extractBalancedObject(rawJavaScriptExample, "input:");
    return {
      index: Number(heading[1]),
      endpointId: heading[2].trim(),
      modelName: extractLine(rawSourceBlock, "Model"),
      category: extractLine(rawSourceBlock, "Category"),
      cost: extractLine(rawSourceBlock, "Cost"),
      pricingNote: extractLine(rawSourceBlock, "Pricing note"),
      license: extractLine(rawSourceBlock, "License"),
      publishedAt: extractLine(rawSourceBlock, "Date"),
      updatedAt: extractLine(rawSourceBlock, "Updated"),
      tags: parseTags(extractLine(rawSourceBlock, "Tags")),
      modelUrl: extractLine(rawSourceBlock, "Model URL"),
      description: extractLine(rawSourceBlock, "Description"),
      payloadKeys: extractPayloadKeys(inputExample),
      inputExample,
      rawTypeScriptExample,
      rawJavaScriptExample,
      rawSourceBlock,
    };
  });
}

export function buildFalCatalogRows(models: ParsedFalModel[]): CatalogModel[] {
  return models.map((model) => {
    const mediaType = inferMediaType(model.category);
    const workflowType = inferWorkflowType(model.category);
    const recommended = RECOMMENDED_FAL_ENDPOINTS.get(model.endpointId);
    const family = inferFamily(model.endpointId, model.modelName);
    const studioSurfaces = unique([
      studioSurfaceForMediaType(mediaType),
      ...(recommended?.surfaces ?? []),
    ]);
    return {
      id: model.endpointId,
      endpointId: model.endpointId,
      provider: "fal-ai",
      providerLabel: "fal.ai",
      name: model.modelName || titleCase(model.endpointId.split("/").at(-1) ?? model.endpointId),
      description: model.description || model.modelName,
      category: model.category,
      pricingText: model.cost || "Pricing not returned",
      pricing: parsePricing(model.cost, model.pricingNote),
      modelUrl: model.modelUrl,
      license: model.license,
      tags: model.tags,
      publishedAt: model.publishedAt,
      modelUpdatedAt: model.updatedAt,
      vendor: inferVendor(model.endpointId, model.modelName),
      family,
      tier: inferTier(model.endpointId, model.cost),
      transportType: model.endpointId.includes("/v1/") ? "direct_http" : "fal_queue",
      mediaType,
      workflowType,
      uiGroup: inferUiGroup(model.category),
      supports: inferSupports(mediaType, workflowType, model.payloadKeys),
      payloadKeys: model.payloadKeys,
      requiresAssets: inferRequiresAssets(model.payloadKeys, workflowType),
      defaults: inferDefaults(model.payloadKeys),
      controls: inferControls(model.payloadKeys),
      aliases: unique([model.endpointId, model.modelName, family].filter(Boolean)),
      enabled: true,
      credits: estimateCredits(model.cost),
      timeLabel: inferTimeLabel(mediaType, workflowType),
      sortRank: recommended ? recommended.defaultRank : 50_000 + model.index,
      studioSurfaces,
      kanvasModes: [],
      rawApiExample: model.rawTypeScriptExample,
      rawPayload: {
        inputExample: model.inputExample,
        payloadKeys: model.payloadKeys,
        source: "models.md",
      },
      rawSourceBlock: model.rawSourceBlock,
      isDefault: Boolean(recommended),
      defaultRank: recommended?.defaultRank ?? 1000,
    };
  });
}
