import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCatalogProviderKey } from '../../shared/ai-model-catalog';

export type CatalogMediaType = 'text' | 'image' | 'video' | 'audio' | 'json' | '3d';
export type CatalogUiGroup = 'generation' | 'advanced';
export type CatalogStudioSurface =
  | 'studio:text'
  | 'studio:image'
  | 'studio:video'
  | 'studio:audio'
  | 'studio:json'
  | 'studio:3d';

export interface CatalogModelSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  media_type: CatalogMediaType;
  workflow_type: string;
  ui_group: CatalogUiGroup;
  supports: string[];
  defaults: Record<string, unknown>;
  controls: Array<{
    key: string;
    label: string;
    type: 'select' | 'number' | 'boolean';
    defaultValue?: string | number | boolean;
    options?: Array<{ label: string; value: string | number | boolean }>;
    min?: number;
    max?: number;
    step?: number;
  }>;
  aliases: string[];
  icon?: string;
  credits?: number;
  time?: string;
  provider?: string;
  provider_label?: string;
  endpoint_id?: string;
  pricing_text?: string;
  model_url?: string;
  license?: string;
  tags?: string[];
  published_at?: string;
  model_updated_at?: string;
  vendor?: string;
  family?: string;
  tier?: string;
  is_default?: boolean;
  default_rank?: number;
}

export interface CatalogProviderDiagnostics {
  provider: string;
  providerLabel: string;
  total: number;
  enabled: number;
  visibleForRequest: number;
  missingStudioSurface: number;
  byMediaType: Record<string, number>;
  byUiGroup: Record<string, number>;
}

export interface CatalogDiagnostics {
  request: {
    provider?: string;
    mediaType?: string;
    uiGroup?: string;
    studioSurface?: string;
  };
  scanned: number;
  providers: CatalogProviderDiagnostics[];
  fal?: CatalogProviderDiagnostics;
}

export interface UseCatalogModelsOptions {
  category?: string;
  mediaType?: CatalogMediaType;
  uiGroup?: CatalogUiGroup;
  provider?: string;
  workflowType?: string;
  workflowTypes?: string[];
  studioSurface?: CatalogStudioSurface;
  includeAdvanced?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  autoFetch?: boolean;
}

interface CatalogModelsPayload {
  models: CatalogModelSummary[];
  total: number;
  scanned?: number;
  diagnostics?: CatalogDiagnostics;
}

const modelCache = new Map<string, CatalogModelsPayload>();
const pendingModelFetches = new Map<string, Promise<CatalogModelsPayload>>();

function buildCacheKey(options: Partial<UseCatalogModelsOptions>) {
  return JSON.stringify({
    category: options.category ?? null,
    mediaType: options.mediaType ?? null,
    uiGroup: options.uiGroup ?? null,
    provider: options.provider ?? null,
    workflowType: options.workflowType ?? null,
    workflowTypes: options.workflowTypes ?? null,
    studioSurface: options.studioSurface ?? null,
    includeAdvanced: options.includeAdvanced ?? false,
    search: options.search ?? null,
    limit: options.limit ?? null,
    offset: options.offset ?? null,
  });
}

export function normalizeCatalogModelSummary(rawModel: unknown): CatalogModelSummary {
  const model = rawModel && typeof rawModel === 'object' ? rawModel as Record<string, unknown> : {};
  return {
    id: String(model.id ?? ''),
    name: String(model.name ?? ''),
    description: String(model.description ?? ''),
    category: typeof model.category === 'string' ? model.category : 'uncategorized',
    media_type: model.media_type as CatalogMediaType,
    workflow_type: String(model.workflow_type ?? ''),
    ui_group: model.ui_group as CatalogUiGroup,
    supports: Array.isArray(model.supports) ? model.supports.filter((value): value is string => typeof value === 'string') : [],
    defaults: model.defaults && typeof model.defaults === 'object' ? model.defaults as Record<string, unknown> : {},
    controls: Array.isArray(model.controls) ? model.controls as CatalogModelSummary['controls'] : [],
    aliases: Array.isArray(model.aliases) ? model.aliases.filter((value): value is string => typeof value === 'string') : [],
    icon: typeof model.icon === 'string' ? model.icon : 'image',
    credits: typeof model.credits === 'number' ? model.credits : 1,
    time: typeof model.time === 'string' ? model.time : '~30s',
    provider: typeof model.provider === 'string' ? model.provider : undefined,
    provider_label: typeof model.provider_label === 'string' ? model.provider_label : undefined,
    endpoint_id: typeof model.endpoint_id === 'string' ? model.endpoint_id : undefined,
    pricing_text: typeof model.pricing_text === 'string' ? model.pricing_text : undefined,
    model_url: typeof model.model_url === 'string' ? model.model_url : undefined,
    license: typeof model.license === 'string' ? model.license : undefined,
    tags: Array.isArray(model.tags) ? model.tags.filter((value): value is string => typeof value === 'string') : [],
    published_at: typeof model.published_at === 'string' ? model.published_at : undefined,
    model_updated_at: typeof model.model_updated_at === 'string' ? model.model_updated_at : undefined,
    vendor: typeof model.vendor === 'string' ? model.vendor : undefined,
    family: typeof model.family === 'string' ? model.family : undefined,
    tier: typeof model.tier === 'string' ? model.tier : undefined,
    is_default: model.is_default === true,
    default_rank: typeof model.default_rank === 'number' ? model.default_rank : undefined,
  };
}

export const useCatalogModels = (options: UseCatalogModelsOptions = {}) => {
  const {
    category,
    mediaType,
    uiGroup,
    provider,
    workflowType,
    workflowTypes,
    studioSurface,
    includeAdvanced = false,
    search,
    limit,
    offset,
    autoFetch = true,
  } = options;
  const [models, setModels] = useState<CatalogModelSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [scanned, setScanned] = useState(0);
  const [diagnostics, setDiagnostics] = useState<CatalogDiagnostics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const workflowTypesKey = useMemo(() => (workflowTypes ?? []).join('|'), [workflowTypes]);

  const fetchModels = async (overrides: Partial<UseCatalogModelsOptions> = {}) => {
    setIsLoading(true);
    setError(null);

    const effectiveCategory = overrides.category || category;
    const effectiveMediaType = overrides.mediaType || mediaType;
    const effectiveUiGroup = overrides.uiGroup || uiGroup;
    const effectiveProvider = normalizeCatalogProviderKey(overrides.provider ?? provider);
    const effectiveWorkflowType = overrides.workflowType || workflowType;
    const effectiveWorkflowTypes = overrides.workflowTypes || workflowTypes;
    const effectiveStudioSurface = overrides.studioSurface || studioSurface;
    const effectiveIncludeAdvanced = overrides.includeAdvanced ?? includeAdvanced;
    const effectiveSearch = overrides.search ?? search;
    const effectiveLimit = overrides.limit ?? limit;
    const effectiveOffset = overrides.offset ?? offset;
    const cacheKey = buildCacheKey({
      category: effectiveCategory,
      mediaType: effectiveMediaType,
      uiGroup: effectiveUiGroup,
      provider: effectiveProvider,
      workflowType: effectiveWorkflowType,
      workflowTypes: effectiveWorkflowTypes,
      studioSurface: effectiveStudioSurface,
      includeAdvanced: effectiveIncludeAdvanced,
      search: effectiveSearch,
      limit: effectiveLimit,
      offset: effectiveOffset,
    });

    try {
      const cachedPayload = modelCache.get(cacheKey);
      if (cachedPayload) {
        setModels(cachedPayload.models);
        setTotal(cachedPayload.total);
        setScanned(cachedPayload.scanned ?? cachedPayload.models.length);
        setDiagnostics(cachedPayload.diagnostics ?? null);
        return;
      }

      let fetchPromise = pendingModelFetches.get(cacheKey);
      if (!fetchPromise) {
        fetchPromise = (async () => {
          const { data, error: supabaseError } = await supabase.functions.invoke('model-catalog', {
            body: {
              category: effectiveCategory,
              media_type: effectiveMediaType,
              ui_group: effectiveUiGroup,
              provider: effectiveProvider,
              workflow_type: effectiveWorkflowType,
              workflow_types: effectiveWorkflowTypes,
              studio_surface: effectiveStudioSurface,
              includeAdvanced: effectiveIncludeAdvanced,
              search: effectiveSearch,
              limit: effectiveLimit,
              offset: effectiveOffset,
              diagnostics: effectiveProvider === 'fal-ai',
            },
          });

          if (supabaseError) {
            throw new Error(supabaseError.message);
          }

          if (!data?.models || !Array.isArray(data.models)) {
            throw new Error('Malformed model payload');
          }

          const transformedModels: CatalogModelSummary[] = data.models.map(normalizeCatalogModelSummary);

          const payload = {
            models: transformedModels,
            total: typeof data.total === 'number' ? data.total : transformedModels.length,
            scanned: typeof data.scanned === 'number' ? data.scanned : transformedModels.length,
            diagnostics: data.diagnostics && typeof data.diagnostics === 'object'
              ? data.diagnostics as CatalogDiagnostics
              : undefined,
          };
          modelCache.set(cacheKey, payload);
          return payload;
        })();
        pendingModelFetches.set(cacheKey, fetchPromise);
      }
      const payload = await fetchPromise;
      setModels(payload.models);
      setTotal(payload.total);
      setScanned(payload.scanned ?? payload.models.length);
      setDiagnostics(payload.diagnostics ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch models';
      setError(errorMessage);
      setModels([]);
      setTotal(0);
      setScanned(0);
      setDiagnostics(null);

      toast({
        title: 'Model catalog unavailable',
        description: 'The shared model catalog could not be loaded.',
        variant: 'destructive',
      });
    } finally {
      pendingModelFetches.delete(cacheKey);
      setIsLoading(false);
    }
  };

  const grouped = useMemo(() => {
    return {
      generation: models.filter((model) => model.ui_group === 'generation'),
      advanced: models.filter((model) => model.ui_group === 'advanced'),
    };
  }, [models]);

  const getModelById = (modelId: string) => models.find((model) => model.id === modelId);

  useEffect(() => {
    if (autoFetch) {
      void fetchModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, mediaType, uiGroup, provider, workflowType, workflowTypesKey, studioSurface, includeAdvanced, search, limit, offset, autoFetch]);

  return {
    models,
    grouped,
    total,
    scanned,
    diagnostics,
    isLoading,
    error,
    fetchModels,
    getModelById,
    refetch: () => fetchModels(),
  };
};
