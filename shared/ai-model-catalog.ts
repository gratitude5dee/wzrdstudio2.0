export type CatalogTransportType =
  | "chat_completion"
  | "request_queue"
  | "fal_queue"
  | "edge_function"
  | "direct_http";

export type CatalogMediaType = "text" | "image" | "video" | "audio" | "json" | "3d";
export type CatalogUiGroup = "generation" | "advanced";
export type CatalogKanvasMode =
  | "text-to-image"
  | "image-to-image"
  | "text-to-video"
  | "image-to-video"
  | "reference-to-video"
  | "cinematic-image"
  | "talking-head"
  | "lip-sync";
export type CatalogSurface =
  | "studio:text"
  | "studio:image"
  | "studio:video"
  | "studio:audio"
  | "studio:json"
  | "studio:3d"
  | "kanvas:image"
  | "kanvas:video"
  | "kanvas:edit"
  | "kanvas:cinema"
  | "kanvas:lipsync";

export interface CatalogPricing {
  inputUsdPer1M?: number;
  outputUsdPer1M?: number;
  usd?: number;
  credits?: number;
  currency?: string;
  raw?: string;
  [key: string]: unknown;
}

export interface CatalogControlOption {
  label: string;
  value: string | number | boolean;
}

export interface CatalogControlDefinition {
  key: string;
  label: string;
  type: "select" | "number" | "boolean";
  defaultValue?: string | number | boolean;
  options?: CatalogControlOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface CatalogModel {
  id: string;
  endpointId: string;
  provider: string;
  providerLabel: string;
  name: string;
  description: string;
  category: string;
  pricingText: string;
  pricing: CatalogPricing;
  modelUrl?: string;
  license?: string;
  tags?: string[];
  publishedAt?: string;
  modelUpdatedAt?: string;
  vendor?: string;
  family?: string;
  tier?: string;
  transportType: CatalogTransportType;
  mediaType: CatalogMediaType;
  workflowType: string;
  uiGroup: CatalogUiGroup;
  supports: string[];
  payloadKeys: string[];
  requiresAssets: string[];
  defaults: Record<string, unknown>;
  controls: CatalogControlDefinition[];
  aliases: string[];
  enabled: boolean;
  credits: number;
  timeLabel: string;
  sortRank: number;
  studioSurfaces: CatalogSurface[];
  kanvasModes: CatalogKanvasMode[];
  rawApiExample: string;
  rawPayload: Record<string, unknown>;
  rawSourceBlock: string;
  isDefault: boolean;
  defaultRank: number;
}

const CATALOG_PROVIDER_ALIASES: Record<string, string> = {
  fal: "fal-ai",
  "fal.ai": "fal-ai",
  fal_ai: "fal-ai",
  falai: "fal-ai",
  "fal-ai": "fal-ai",
  gmi: "gmi-cloud",
  "gmi cloud": "gmi-cloud",
  gmi_cloud: "gmi-cloud",
  "gmi-cloud": "gmi-cloud",
};

export function normalizeCatalogProviderKey(provider?: string | null): string | undefined {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return CATALOG_PROVIDER_ALIASES[normalized] ?? normalized;
}

export function catalogProviderAliasesForFilter(provider?: string | null): string[] {
  const normalized = normalizeCatalogProviderKey(provider);
  if (!normalized) {
    return [];
  }

  if (normalized === "fal-ai") {
    return ["fal-ai", "fal.ai", "fal", "fal_ai", "falai"];
  }

  if (normalized === "gmi-cloud") {
    return ["gmi-cloud", "gmi", "gmi cloud", "gmi_cloud"];
  }

  return [normalized];
}

export function formatCatalogProviderLabel(provider?: string | null, providerLabel?: string | null): string {
  const normalized = normalizeCatalogProviderKey(provider ?? providerLabel);
  if (normalized === "fal-ai") {
    return "Fal";
  }
  if (normalized === "gmi-cloud") {
    return "GMI Cloud";
  }

  const source = providerLabel?.trim() || provider?.trim();
  if (!source) {
    return "Other";
  }

  return source
    .split(/[-_/\s.]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function studioSurfaceForCatalogMediaType(mediaType?: string | null): CatalogSurface | null {
  if (
    mediaType === "text" ||
    mediaType === "image" ||
    mediaType === "video" ||
    mediaType === "audio" ||
    mediaType === "json" ||
    mediaType === "3d"
  ) {
    return `studio:${mediaType}` as CatalogSurface;
  }

  return null;
}

export function getEffectiveStudioSurfaces(model: Pick<CatalogModel, "mediaType" | "studioSurfaces">): CatalogSurface[] {
  const explicit = model.studioSurfaces.filter((surface) => surface.startsWith("studio:"));
  if (explicit.length > 0) {
    return explicit;
  }

  const inferred = studioSurfaceForCatalogMediaType(model.mediaType);
  return inferred ? [inferred] : [];
}

export function modelMatchesCatalogStudioSurface(
  model: Pick<CatalogModel, "mediaType" | "studioSurfaces">,
  studioSurface?: CatalogSurface | null,
): boolean {
  const effectiveSurfaces = getEffectiveStudioSurfaces(model);
  if (!studioSurface) {
    return effectiveSurfaces.length > 0;
  }

  return effectiveSurfaces.includes(studioSurface);
}
