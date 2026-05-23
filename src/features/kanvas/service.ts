import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { extractInsufficientCreditsError, type InsufficientCreditsPayload } from "@/lib/billing-errors";

const supabase = typedSupabase;
import { assetService } from "@/services/assetService";
import { normalizeKanvasJobRow } from "@/features/kanvas/helpers";
import type {
  KanvasAsset,
  KanvasAssetType,
  KanvasControlDefinition,
  KanvasGenerationRequest,
  KanvasJob,
  KanvasModel,
  KanvasStudio,
} from "@/features/kanvas/types";

type GenerationJobRow = Database["public"]["Tables"]["generation_jobs"]["Row"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const record = asRecord(error);
  const message =
    asString(record.message) ??
    asString(record.error) ??
    asString(record.details) ??
    asString(record.description);

  return message ?? fallback;
}

function normalizeControl(item: unknown): KanvasControlDefinition | null {
  const record = asRecord(item);
  const key = asString(record.key);
  const label = asString(record.label);
  const type = asString(record.type);

  if (!key || !label || (type !== "select" && type !== "number" && type !== "boolean")) {
    return null;
  }

  const options = Array.isArray(record.options)
    ? record.options
        .map((option) => {
          const optionRecord = asRecord(option);
          const optionLabel = asString(optionRecord.label);
          const value = optionRecord.value;
          const isValidValue =
            typeof value === "string" || typeof value === "number" || typeof value === "boolean";
          if (!optionLabel || !isValidValue) {
            return null;
          }
          return {
            label: optionLabel,
            value,
          };
        })
        .filter((option): option is NonNullable<typeof option> => option !== null)
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
    min: asNumber(record.min) ?? undefined,
    max: asNumber(record.max) ?? undefined,
    step: asNumber(record.step) ?? undefined,
  };
}

function normalizeModel(item: unknown): KanvasModel | null {
  const record = asRecord(item);
  const id = asString(record.id);
  const name = asString(record.name);
  const description = asString(record.description);
  const provider = asString(record.provider) ?? undefined;
  const providerLabel = asString(record.providerLabel) ?? undefined;
  const endpointId = asString(record.endpointId) ?? undefined;
  const isDefault = asBoolean(record.isDefault) ?? undefined;
  const defaultRank = asNumber(record.defaultRank) ?? undefined;
  const studio = asString(record.studio);
  const mode = asString(record.mode);
  const mediaType = asString(record.mediaType);
  const workflowType = asString(record.workflowType);
  const uiGroup = asString(record.uiGroup);
  const credits = asNumber(record.credits);
  const supportsPrompt = asBoolean(record.supportsPrompt);

  if (
    !id ||
    !name ||
    !description ||
    (studio !== "image" && studio !== "video" && studio !== "edit" && studio !== "cinema" && studio !== "lipsync") ||
    !mode ||
    (mediaType !== "image" && mediaType !== "video") ||
    !workflowType ||
    (uiGroup !== "generation" && uiGroup !== "advanced") ||
    credits === null ||
    supportsPrompt === null
  ) {
    return null;
  }

  const requiresAssets = Array.isArray(record.requiresAssets)
    ? record.requiresAssets.filter(
        (assetType): assetType is KanvasAssetType =>
          assetType === "image" || assetType === "video" || assetType === "audio"
      )
    : [];

  const aliases = Array.isArray(record.aliases)
    ? record.aliases.filter((alias): alias is string => typeof alias === "string")
    : [];

  const controls = Array.isArray(record.controls)
    ? record.controls
        .map(normalizeControl)
        .filter((control): control is KanvasControlDefinition => control !== null)
    : [];

  return {
    id,
    name,
    description,
    provider,
    providerLabel,
    endpointId,
    isDefault,
    defaultRank,
    studio,
    mode: mode as KanvasModel["mode"],
    mediaType,
    workflowType,
    uiGroup,
    credits,
    requiresAssets,
    supportsPrompt,
    controls,
    defaults: asRecord(record.defaults),
    aliases,
  };
}

function normalizeFunctionResponse<T>(data: unknown, field: string): T {
  const record = asRecord(data);
  if (!(field in record)) {
    throw new Error(`Malformed function response: missing ${field}`);
  }
  return record[field] as T;
}

export async function fetchKanvasModels(studio: KanvasStudio): Promise<KanvasModel[]> {
  const { data, error } = await supabase.functions.invoke("model-catalog", {
    body: {
      studio: "kanvas",
      kanvas_studio: studio,
    },
  });

  if (error) {
    throw new Error(extractErrorMessage(error, "Failed to load Kanvas models"));
  }

  const rawModels = normalizeFunctionResponse<unknown[]>(data, "models");
  return rawModels
    .map(normalizeModel)
    .filter((model): model is KanvasModel => model !== null);
}

export async function listKanvasAssets(input?: {
  projectId?: string;
  assetTypes?: KanvasAssetType[];
}): Promise<KanvasAsset[]> {
  return assetService.list({
    projectId: input?.projectId,
    assetType: input?.assetTypes,
    includeArchived: false,
    sortBy: "created_at",
    sortOrder: "desc",
    limit: 40,
  });
}

export async function uploadKanvasAsset(
  file: File,
  input: {
    projectId?: string;
    assetType: KanvasAssetType;
    visibility?: "private" | "project" | "public";
  }
): Promise<KanvasAsset> {
  const base64 = await assetService.fileToBase64(file);
  const response = await assetService.upload({
    projectId: input.projectId,
    assetType: input.assetType,
    assetCategory: "upload",
    visibility: input.visibility ?? (input.projectId ? "project" : "private"),
    file: {
      name: file.name,
      type: file.type,
      size: file.size,
      base64,
    },
  });

  if (!response.success) {
    const validationError = response.errors?.[0]?.message;
    throw new Error(response.error ?? validationError ?? "Asset upload failed");
  }

  if (response.asset) {
    return response.asset;
  }

  if (!response.assetId) {
    throw new Error("Asset upload succeeded without returning an asset id");
  }

  const asset = await assetService.getById(response.assetId);
  if (!asset) {
    throw new Error("Uploaded asset could not be reloaded");
  }

  return asset;
}

export async function listKanvasJobs(input?: {
  projectId?: string;
  studio?: KanvasStudio;
}): Promise<KanvasJob[]> {
  let query = supabase.from("generation_jobs").select("*");

  if (input?.projectId) {
    query = query.eq("project_id", input.projectId);
  }
  if (input?.studio) {
    query = query.eq("studio", input.studio);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(40);

  if (error) {
    throw new Error(extractErrorMessage(error, "Failed to load Kanvas jobs"));
  }

  return (data ?? []).map((row) => normalizeKanvasJobRow(row as GenerationJobRow));
}

export class InsufficientCreditsError extends Error {
  public payload: InsufficientCreditsPayload;
  constructor(payload: InsufficientCreditsPayload) {
    super(payload.error ?? 'Insufficient credits');
    this.name = 'InsufficientCreditsError';
    this.payload = payload;
  }
}

export async function submitKanvasJob(request: KanvasGenerationRequest): Promise<KanvasJob> {
  const { data, error } = await supabase.functions.invoke("kanvas-generate", {
    body: request,
  });

  if (error) {
    const creditsPayload = await extractInsufficientCreditsError(error);
    if (creditsPayload) {
      throw new InsufficientCreditsError(creditsPayload);
    }
    throw new Error(extractErrorMessage(error, "Failed to submit Kanvas job"));
  }

  const record = asRecord(data);
  const job = record.job;
  if (!job) {
    throw new Error("Malformed kanvas-generate response: missing job");
  }

  return normalizeKanvasJobRow(job as GenerationJobRow);
}

export async function refreshKanvasJobStatus(jobId: string): Promise<KanvasJob> {
  const { data, error } = await supabase.functions.invoke("kanvas-job-status", {
    body: { jobId },
  });

  if (error) {
    throw new Error(extractErrorMessage(error, "Failed to refresh Kanvas job"));
  }

  const record = asRecord(data);
  const job = record.job;
  if (!job) {
    throw new Error("Malformed kanvas-job-status response: missing job");
  }

  return normalizeKanvasJobRow(job as GenerationJobRow);
}
