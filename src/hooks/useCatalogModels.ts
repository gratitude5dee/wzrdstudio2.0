import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

export type CatalogMediaType = 'text' | 'image' | 'video' | 'audio' | 'json' | '3d';
export type CatalogUiGroup = 'generation' | 'advanced';

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

interface UseCatalogModelsOptions {
  category?: string;
  mediaType?: CatalogMediaType;
  uiGroup?: CatalogUiGroup;
  autoFetch?: boolean;
}

const modelCache = new Map<string, CatalogModelSummary[]>();
const pendingModelFetches = new Map<string, Promise<CatalogModelSummary[]>>();

function buildCacheKey(options: Partial<UseCatalogModelsOptions>) {
  return JSON.stringify({
    category: options.category ?? null,
    mediaType: options.mediaType ?? null,
    uiGroup: options.uiGroup ?? null,
  });
}

export const useCatalogModels = (options: UseCatalogModelsOptions = {}) => {
  const { category, mediaType, uiGroup, autoFetch = true } = options;
  const [models, setModels] = useState<CatalogModelSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchModels = async (overrides: Partial<UseCatalogModelsOptions> = {}) => {
    setIsLoading(true);
    setError(null);

    const effectiveCategory = overrides.category || category;
    const effectiveMediaType = overrides.mediaType || mediaType;
    const effectiveUiGroup = overrides.uiGroup || uiGroup;
    const cacheKey = buildCacheKey({
      category: effectiveCategory,
      mediaType: effectiveMediaType,
      uiGroup: effectiveUiGroup,
    });

    try {
      const cachedModels = modelCache.get(cacheKey);
      if (cachedModels) {
        setModels(cachedModels);
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
            },
          });

          if (supabaseError) {
            throw new Error(supabaseError.message);
          }

          if (!data?.models || !Array.isArray(data.models)) {
            throw new Error('Malformed model payload');
          }

          const transformedModels: CatalogModelSummary[] = data.models.map((model: any) => ({
            id: model.id,
            name: model.name,
            description: model.description,
            category: model.category || 'uncategorized',
            media_type: model.media_type,
            workflow_type: model.workflow_type,
            ui_group: model.ui_group,
            supports: Array.isArray(model.supports) ? model.supports : [],
            defaults: model.defaults && typeof model.defaults === 'object' ? model.defaults : {},
            controls: Array.isArray(model.controls) ? model.controls : [],
            aliases: Array.isArray(model.aliases) ? model.aliases : [],
            icon: model.icon || 'image',
            credits: typeof model.credits === 'number' ? model.credits : 1,
            time: model.time || '~30s',
            provider: model.provider,
            provider_label: model.provider_label,
            endpoint_id: model.endpoint_id,
            pricing_text: model.pricing_text,
            model_url: model.model_url,
            license: model.license,
            tags: Array.isArray(model.tags) ? model.tags : [],
            published_at: model.published_at,
            model_updated_at: model.model_updated_at,
            vendor: model.vendor,
            family: model.family,
            tier: model.tier,
            is_default: model.is_default === true,
            default_rank: typeof model.default_rank === 'number' ? model.default_rank : undefined,
          }));

          modelCache.set(cacheKey, transformedModels);
          return transformedModels;
        })();
        pendingModelFetches.set(cacheKey, fetchPromise);
      }
      const transformedModels = await fetchPromise;
      setModels(transformedModels);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch models';
      setError(errorMessage);
      setModels([]);

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
  }, [category, mediaType, uiGroup, autoFetch]);

  return {
    models,
    grouped,
    isLoading,
    error,
    fetchModels,
    getModelById,
    refetch: () => fetchModels(),
  };
};
