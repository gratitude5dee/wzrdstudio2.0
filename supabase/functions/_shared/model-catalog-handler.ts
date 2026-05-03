import {
  getCatalogModelById,
  listCatalogModels,
  toKanvasCatalogModel,
  toStudioCatalogModel,
} from "./ai-model-catalog.ts";
import { authenticateRequest, AuthError } from "./auth.ts";
import { errorResponse, handleCors, successResponse } from "./response.ts";
import type {
  CatalogKanvasMode,
  CatalogModel,
  CatalogSurface,
} from "../../../shared/ai-model-catalog.ts";

type KanvasStudio = "image" | "video" | "edit" | "cinema" | "lipsync";

function parseParams(url: URL, body: Record<string, unknown> | null) {
  const params = body?.params ? new URLSearchParams(String(body.params)) : null;
  const get = (key: string) =>
    url.searchParams.get(key) ??
    params?.get(key) ??
    (typeof body?.[key] === "string" ? String(body[key]) : null);
  const getBoolean = (key: string): boolean | null => {
    const raw =
      url.searchParams.get(key) ??
      params?.get(key) ??
      (typeof body?.[key] === "boolean" ? String(body[key]) : null) ??
      (typeof body?.[key] === "string" ? String(body[key]) : null);
    if (raw === null) {
      return null;
    }
    return raw === "true" || raw === "1";
  };

  const capabilities =
    url.searchParams.getAll("capabilities").length > 0
      ? url.searchParams.getAll("capabilities")
      : params?.getAll("capabilities")?.length
        ? params.getAll("capabilities")
        : Array.isArray(body?.capabilities)
          ? body.capabilities.map((value) => String(value))
          : [];

  return {
    category: get("category"),
    mediaType: get("media_type"),
    uiGroup: get("ui_group"),
    provider: get("provider"),
    workflowType: get("workflow_type"),
    studioSurface: get("studio_surface") as CatalogSurface | null,
    search: get("search"),
    modelId: get("id"),
    studio: get("studio"),
    kanvasStudio: get("kanvas_studio") as KanvasStudio | null,
    kanvasMode: get("kanvas_mode") as CatalogKanvasMode | null,
    includeAdvanced: getBoolean("includeAdvanced") ?? getBoolean("include_advanced") ?? false,
    capabilities,
  };
}

function inferKanvasStudio(model: CatalogModel, preferred?: KanvasStudio | null): KanvasStudio | null {
  if (preferred) {
    return preferred;
  }

  const first = model.studioSurfaces.find((surface) => surface.startsWith("kanvas:"));
  if (!first) {
    return null;
  }

  return first.replace("kanvas:", "") as KanvasStudio;
}

function inferKanvasMode(model: CatalogModel, preferred?: CatalogKanvasMode | null): CatalogKanvasMode | null {
  return preferred ?? model.kanvasModes[0] ?? null;
}

function hasStudioSurface(model: CatalogModel): boolean {
  return model.studioSurfaces.some((surface) => surface.startsWith("studio:"));
}

function expandKanvasModels(
  rows: CatalogModel[],
  studio?: KanvasStudio | null,
  mode?: CatalogKanvasMode | null,
) {
  const expanded = rows.flatMap((row) => {
    const studios = studio
      ? [studio]
      : row.studioSurfaces
          .filter((surface) => surface.startsWith("kanvas:"))
          .map((surface) => surface.replace("kanvas:", "") as KanvasStudio);

    return studios.flatMap((currentStudio) => {
      const modes = mode
        ? [mode]
        : row.kanvasModes.length > 0
          ? row.kanvasModes
          : [];

      return modes.map((currentMode) => toKanvasCatalogModel(row, currentStudio, currentMode));
    });
  });

  const seen = new Set<string>();
  return expanded.filter((model) => {
    const key = `${model.id}:${model.studio}:${model.mode}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function handleModelCatalogRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return handleCors();
  }

  try {
    // Model catalog is read-only data — allow unauthenticated access
    // but still attempt auth for future audit/personalization
    try {
      await authenticateRequest(req.headers);
    } catch (authErr) {
      // Allow unauthenticated access to the catalog
      console.log('[model-catalog] Proceeding without auth:', authErr instanceof Error ? authErr.message : 'unknown');
    }

    const url = new URL(req.url);
    let body: Record<string, unknown> | null = null;
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = null;
      }
    }

    const {
      category,
      mediaType,
      uiGroup,
      search,
      modelId,
      studio,
      provider,
      workflowType,
      studioSurface,
      kanvasStudio,
      kanvasMode,
      includeAdvanced,
      capabilities,
    } = parseParams(url, body);

    if (studio === "kanvas") {
      const surface = kanvasStudio ? (`kanvas:${kanvasStudio}` as CatalogSurface) : undefined;

      if (modelId) {
        const model = await getCatalogModelById(modelId, {
          studioSurface: surface,
          kanvasMode: kanvasMode ?? undefined,
        });
        if (!model) {
          return errorResponse("Model not found", 404);
        }

        const resolvedStudio = inferKanvasStudio(model, kanvasStudio);
        const resolvedMode = inferKanvasMode(model, kanvasMode);
        if (!resolvedStudio || !resolvedMode) {
          return errorResponse("Model is not mapped to Kanvas", 404);
        }

        return successResponse({
          model: toKanvasCatalogModel(model, resolvedStudio, resolvedMode),
        });
      }

      const models = expandKanvasModels(
        await listCatalogModels({
          studioSurface: surface,
          kanvasMode: kanvasMode ?? undefined,
          search: search ?? undefined,
          capabilities,
        }),
        kanvasStudio,
        kanvasMode,
      );

      return successResponse({
        models,
        total: models.length,
        studios: Array.from(new Set(models.map((model) => model.studio))),
      });
    }

    if (modelId) {
      const model = await getCatalogModelById(modelId, {
        provider: provider ?? undefined,
        workflowType: workflowType ?? undefined,
        studioSurface: studioSurface ?? undefined,
      });
      if (!model || !hasStudioSurface(model)) {
        return errorResponse("Model not found", 404);
      }
      return successResponse({ model: toStudioCatalogModel(model) });
    }

    const effectiveUiGroup = uiGroup ?? (includeAdvanced ? undefined : "generation");
    const models = (await listCatalogModels({
      category: category ?? undefined,
      mediaType: mediaType ?? undefined,
      uiGroup: effectiveUiGroup,
      provider: provider ?? undefined,
      workflowType: workflowType ?? undefined,
      studioSurface: studioSurface ?? undefined,
      search: search ?? undefined,
      capabilities,
    }))
      .filter(hasStudioSurface)
      .map(toStudioCatalogModel);

    return successResponse({
      models,
      total: models.length,
      categories: Array.from(new Set(models.map((model) => model.category))),
    });
  } catch (error) {
    console.error("Model catalog error:", error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    return errorResponse(
      error instanceof Error ? error.message : "Failed to get models",
      500,
    );
  }
}
