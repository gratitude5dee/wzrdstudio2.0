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
