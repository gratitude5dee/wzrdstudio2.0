import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  CatalogControlDefinition,
  CatalogKanvasMode,
  CatalogModel,
  CatalogSurface,
} from "../../../shared/ai-model-catalog.ts";
export type {
  CatalogControlDefinition,
  CatalogKanvasMode,
  CatalogModel,
  CatalogSurface,
} from "../../../shared/ai-model-catalog.ts";

type QueryableCatalogRow = Record<string, unknown>;

export interface CatalogQueryFilters {
  id?: string;
  ids?: string[];
  mediaType?: string;
  uiGroup?: string;
  category?: string;
  provider?: string;
  workflowType?: string;
  workflowTypes?: string[];
  studioSurface?: CatalogSurface;
  kanvasMode?: CatalogKanvasMode;
  search?: string;
  capabilities?: string[];
  limit?: number;
  offset?: number;
  scanLimit?: number;
  enabledOnly?: boolean;
  includeAdvanced?: boolean;
}

export interface CatalogListResult {
  models: CatalogModel[];
  total: number;
  scanned: number;
}

function createCatalogClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function asControls(value: unknown): CatalogControlDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): CatalogControlDefinition | null => {
      const record = asRecord(item);
      const key = asString(record.key);
      const label = asString(record.label);
      const type = asString(record.type) as CatalogControlDefinition["type"];
      if (!key || !label || !["select", "number", "boolean"].includes(type)) {
        return null;
      }

      const options = Array.isArray(record.options)
        ? record.options
            .map((option) => {
              const optionRecord = asRecord(option);
              const optionLabel = asString(optionRecord.label);
              const optionValue = optionRecord.value;
              const validValue =
                typeof optionValue === "string" ||
                typeof optionValue === "number" ||
                typeof optionValue === "boolean";
              return optionLabel && validValue
                ? { label: optionLabel, value: optionValue }
                : null;
            })
            .filter((option): option is { label: string; value: string | number | boolean } => option !== null)
        : undefined;

      return {
        key,
        label,
        type,
        defaultValue:
          typeof record.defaultValue === "string" ||
            typeof record.defaultValue === "number" ||
            typeof record.defaultValue === "boolean"
            ? record.defaultValue
            : undefined,
        options,
        min: typeof record.min === "number" ? record.min : undefined,
        max: typeof record.max === "number" ? record.max : undefined,
        step: typeof record.step === "number" ? record.step : undefined,
      };
    })
    .filter((control): control is CatalogControlDefinition => control !== null);
}

export function normalizeCatalogModel(row: QueryableCatalogRow): CatalogModel {
  return {
    id: asString(row.id),
    endpointId: asString(row.endpoint_id),
    provider: asString(row.provider),
    providerLabel: asString(row.provider_label),
    name: asString(row.name),
    description: asString(row.description),
    category: asString(row.category),
    pricingText: asString(row.pricing_text),
    pricing: asRecord(row.pricing),
    modelUrl: asString(row.model_url) || undefined,
    license: asString(row.license) || undefined,
    tags: asStringArray(row.tags),
    publishedAt: asString(row.published_at) || undefined,
    modelUpdatedAt: asString(row.model_updated_at) || undefined,
    vendor: asString(row.vendor) || undefined,
    family: asString(row.family) || undefined,
    tier: asString(row.tier) || undefined,
    transportType: asString(row.transport_type) as CatalogModel["transportType"],
    mediaType: asString(row.media_type) as CatalogModel["mediaType"],
    workflowType: asString(row.workflow_type),
    uiGroup: asString(row.ui_group) as CatalogModel["uiGroup"],
    supports: asStringArray(row.supports),
    payloadKeys: asStringArray(row.payload_keys),
    requiresAssets: asStringArray(row.requires_assets),
    defaults: asRecord(row.defaults),
    controls: asControls(row.controls),
    aliases: asStringArray(row.aliases),
    enabled: asBoolean(row.enabled, true),
    credits: asNumber(row.credits),
    timeLabel: asString(row.time_label, "~10s"),
    sortRank: asNumber(row.sort_rank, 1000),
    studioSurfaces: asStringArray(row.studio_surfaces) as CatalogSurface[],
    kanvasModes: asStringArray(row.kanvas_modes) as CatalogKanvasMode[],
    rawApiExample: asString(row.raw_api_example),
    rawPayload: asRecord(row.raw_payload),
    rawSourceBlock: asString(row.raw_source_block),
    isDefault: asBoolean(row.is_default, false),
    defaultRank: asNumber(row.default_rank, 1000),
  };
}

function matchesSearch(model: CatalogModel, search: string | undefined): boolean {
  if (!search) {
    return true;
  }

  const needle = search.toLowerCase().trim();
  if (!needle) {
    return true;
  }

  const haystack = [
    model.id,
    model.endpointId,
    model.name,
    model.description,
    model.category,
    model.provider,
    model.providerLabel,
    model.pricingText,
    model.vendor ?? "",
    model.family ?? "",
    model.tier ?? "",
    ...(model.tags ?? []),
    ...(model.aliases ?? []),
  ].join(" ").toLowerCase();
  const tokens = needle.split(/\s+/).filter(Boolean);
  return haystack.includes(needle) || tokens.every((token) => haystack.includes(token));
}

function matchesCapabilities(model: CatalogModel, capabilities: string[] | undefined): boolean {
  if (!capabilities?.length) {
    return true;
  }

  return capabilities.every((capability) => model.supports.includes(capability));
}

function clampPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.floor(value)));
}

export async function listCatalogModelsPage(filters: CatalogQueryFilters = {}): Promise<CatalogListResult> {
  const client = createCatalogClient();
  let query = client.from("ai_model_catalog").select("*");

  if (filters.enabledOnly !== false) {
    query = query.eq("enabled", true);
  }
  if (filters.id) {
    query = query.eq("id", filters.id);
  }
  if (filters.ids?.length) {
    query = query.in("id", filters.ids);
  }
  if (filters.mediaType) {
    query = query.eq("media_type", filters.mediaType);
  }
  if (filters.uiGroup) {
    query = query.eq("ui_group", filters.uiGroup);
  }
  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.provider) {
    query = query.eq("provider", filters.provider);
  }
  if (filters.workflowType) {
    query = query.eq("workflow_type", filters.workflowType);
  }
  if (filters.workflowTypes?.length) {
    query = query.in("workflow_type", filters.workflowTypes);
  }
  if (filters.studioSurface) {
    query = query.contains("studio_surfaces", [filters.studioSurface]);
  }
  if (filters.kanvasMode) {
    query = query.contains("kanvas_modes", [filters.kanvasMode]);
  }

  const scanLimit = clampPositiveInteger(filters.scanLimit, 2000, 2000);
  const { data, error } = await query
    .order("is_default", { ascending: false })
    .order("default_rank", { ascending: true })
    .order("sort_rank", { ascending: true })
    .order("name", { ascending: true })
    .range(0, scanLimit - 1);

  if (error) {
    throw new Error(`Failed to query ai_model_catalog: ${error.message}`);
  }

  const filtered = (data ?? [])
    .map((row) => normalizeCatalogModel(row as QueryableCatalogRow))
    .filter((model) => matchesSearch(model, filters.search))
    .filter((model) => matchesCapabilities(model, filters.capabilities));
  const offset = typeof filters.offset === "number" && Number.isFinite(filters.offset)
    ? Math.max(0, Math.floor(filters.offset))
    : 0;
  const limit = typeof filters.limit === "number" && Number.isFinite(filters.limit)
    ? Math.max(1, Math.floor(filters.limit))
    : undefined;

  return {
    models: limit ? filtered.slice(offset, offset + limit) : filtered.slice(offset),
    total: filtered.length,
    scanned: data?.length ?? 0,
  };
}

export async function listCatalogModels(filters: CatalogQueryFilters = {}): Promise<CatalogModel[]> {
  const result = await listCatalogModelsPage(filters);
  return result.models;
}

export async function getCatalogModelById(
  modelId: string,
  filters: Omit<CatalogQueryFilters, "id" | "ids" | "search" | "capabilities"> = {},
): Promise<CatalogModel | null> {
  const trimmedId = modelId.trim();
  if (!trimmedId) {
    return null;
  }

  const client = createCatalogClient();
  let directQuery = client
    .from("ai_model_catalog")
    .select("*")
    .eq("id", trimmedId)
    .limit(1);

  if (filters.enabledOnly !== false) {
    directQuery = directQuery.eq("enabled", true);
  }
  if (filters.mediaType) {
    directQuery = directQuery.eq("media_type", filters.mediaType);
  }
  if (filters.uiGroup) {
    directQuery = directQuery.eq("ui_group", filters.uiGroup);
  }
  if (filters.provider) {
    directQuery = directQuery.eq("provider", filters.provider);
  }
  if (filters.workflowType) {
    directQuery = directQuery.eq("workflow_type", filters.workflowType);
  }
  if (filters.studioSurface) {
    directQuery = directQuery.contains("studio_surfaces", [filters.studioSurface]);
  }
  if (filters.kanvasMode) {
    directQuery = directQuery.contains("kanvas_modes", [filters.kanvasMode]);
  }

  const direct = await directQuery.maybeSingle();
  if (direct.error) {
    throw new Error(`Failed to query ai_model_catalog by id: ${direct.error.message}`);
  }
  if (direct.data) {
    return normalizeCatalogModel(direct.data as QueryableCatalogRow);
  }

  let aliasQuery = client
    .from("ai_model_catalog")
    .select("*")
    .contains("aliases", [trimmedId])
    .limit(1);

  if (filters.enabledOnly !== false) {
    aliasQuery = aliasQuery.eq("enabled", true);
  }
  if (filters.mediaType) {
    aliasQuery = aliasQuery.eq("media_type", filters.mediaType);
  }
  if (filters.uiGroup) {
    aliasQuery = aliasQuery.eq("ui_group", filters.uiGroup);
  }
  if (filters.provider) {
    aliasQuery = aliasQuery.eq("provider", filters.provider);
  }
  if (filters.workflowType) {
    aliasQuery = aliasQuery.eq("workflow_type", filters.workflowType);
  }
  if (filters.studioSurface) {
    aliasQuery = aliasQuery.contains("studio_surfaces", [filters.studioSurface]);
  }
  if (filters.kanvasMode) {
    aliasQuery = aliasQuery.contains("kanvas_modes", [filters.kanvasMode]);
  }

  const alias = await aliasQuery.maybeSingle();
  if (alias.error) {
    throw new Error(`Failed to query ai_model_catalog by alias: ${alias.error.message}`);
  }
  return alias.data ? normalizeCatalogModel(alias.data as QueryableCatalogRow) : null;
}

export function toStudioCatalogModel(model: CatalogModel) {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    category: model.category,
    media_type: model.mediaType,
    workflow_type: model.workflowType,
    ui_group: model.uiGroup,
    supports: model.supports,
    defaults: model.defaults,
    controls: model.controls,
    aliases: model.aliases,
    icon: model.mediaType,
    credits: model.credits,
    time: model.timeLabel,
    provider: model.provider,
    provider_label: model.providerLabel,
    endpoint_id: model.endpointId,
    pricing_text: model.pricingText,
    model_url: model.modelUrl,
    license: model.license,
    tags: model.tags ?? [],
    published_at: model.publishedAt,
    model_updated_at: model.modelUpdatedAt,
    vendor: model.vendor,
    family: model.family,
    tier: model.tier,
    is_default: model.isDefault,
    default_rank: model.defaultRank,
  };
}

export function toKanvasCatalogModel(
  model: CatalogModel,
  studio: "image" | "video" | "edit" | "cinema" | "lipsync",
  mode: CatalogKanvasMode,
) {
  const mediaType = studio === "video" || studio === "lipsync" ? "video" as const : "image" as const;
  const requiresAssets = model.requiresAssets.filter((asset): asset is "image" | "video" | "audio" =>
    asset === "image" || asset === "video" || asset === "audio"
  );
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    studio,
    mode,
    mediaType,
    workflowType: model.workflowType,
    uiGroup: model.uiGroup,
    credits: model.credits,
    requiresAssets,
    supportsPrompt: model.supports.includes("prompt") || model.supports.includes("text"),
    controls: model.controls,
    defaults: model.defaults,
    aliases: model.aliases,
    endpointId: model.endpointId,
    provider: model.provider,
    isDefault: model.isDefault,
    defaultRank: model.defaultRank,
  };
}
