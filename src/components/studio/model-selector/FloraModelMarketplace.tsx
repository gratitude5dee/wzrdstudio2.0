import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Info, Pin, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  normalizeCatalogModelSummary,
  useCatalogModels,
  type CatalogMediaType,
  type CatalogModelSummary,
  type CatalogStudioSurface,
  type CatalogUiGroup,
} from '@/hooks/useCatalogModels';
import { supabase } from '@/integrations/supabase/client';
import { getModelThumbnail } from '@/lib/studio/modelVisuals';
import { cn } from '@/lib/utils';

interface MarketplaceModel extends CatalogModelSummary {
  capabilities: string[];
  isNew?: boolean;
  isPinned?: boolean;
  multiModelEligible: boolean;
  providerKey: string;
  providerLabel: string;
  thumbnailUrl: string;
}

interface MarketplaceProviderGroup {
  key: string;
  label: string;
  models: MarketplaceModel[];
}

const selectedModelLookupCache = new Map<string, Promise<CatalogModelSummary | null>>();

function fetchSelectedCatalogModel(modelId: string, studioSurface: CatalogStudioSurface) {
  const cacheKey = `${studioSurface}:${modelId}`;
  const cached = selectedModelLookupCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const lookup = (async () => {
    const { data, error } = await supabase.functions.invoke('model-catalog', {
      body: {
        id: modelId,
        studio_surface: studioSurface,
      },
    });

    if (error || !data?.model) {
      return null;
    }

    return normalizeCatalogModelSummary(data.model);
  })().catch(() => null);

  selectedModelLookupCache.set(cacheKey, lookup);
  void lookup.then((model) => {
    if (!model) {
      selectedModelLookupCache.delete(cacheKey);
    }
  });
  return lookup;
}

export interface FloraModelMarketplaceValue {
  auto: boolean;
  selectedModelIds: string[];
  useMultipleModels: boolean;
}

interface FloraModelMarketplaceProps {
  mediaType: CatalogMediaType;
  value: FloraModelMarketplaceValue;
  onChange: (value: FloraModelMarketplaceValue) => void;
  uiGroup?: CatalogUiGroup;
  workflowType?: string;
  workflowTypes?: string[];
  provider?: string;
  studioSurface?: CatalogStudioSurface;
  allowAdvancedSearch?: boolean;
  className?: string;
  compact?: boolean;
  align?: 'start' | 'center' | 'end';
  triggerVariant?: 'toolbar' | 'dock';
  collisionBoundary?: HTMLElement | null;
  portalContainer?: HTMLElement | null;
  maxContentHeight?: number | string;
}

const PINNED_MODELS: Partial<Record<CatalogMediaType, string[]>> = {
  image: [
    'fal-ai/nano-banana-2',
    'fal-ai/nano-banana-2/edit',
    'openai/gpt-image-2',
    'gmi/seedream-5.0-lite',
  ],
  video: [
    'fal-ai/kling-video/o3/standard/text-to-video',
    'fal-ai/kling-video/o3/standard/image-to-video',
    'gmi/veo3',
    'gmi/kling-v3-omni',
  ],
  text: [
    'gmi/deepseek-r1',
    'google/gemini-2.5-flash',
    'openai/gpt-5',
  ],
  audio: [
    'fal-ai/elevenlabs/tts/turbo-v2.5',
    'gmi/minime-talks-workflow',
  ],
  '3d': [
    'fal-ai/trellis/multi',
  ],
};

const NEW_MODELS = new Set<string>([
  'fal-ai/nano-banana-2',
  'fal-ai/nano-banana-2/edit',
  'openai/gpt-image-2',
  'fal-ai/kling-video/o3/standard/text-to-video',
  'fal-ai/kling-video/o3/standard/image-to-video',
  'fal-ai/elevenlabs/tts/turbo-v2.5',
  'fal-ai/trellis/multi',
  'gmi/seedream-5.0-lite',
  'gmi/gemini-3.1-flash-image-preview',
  'gmi/kling-v3-omni',
  'gmi/deepseek-r1',
  'gmi/openai-o4-mini',
  'gmi/wan2.6-t2v',
  'gmi/minimax-hailuo-2.3',
  'gmi/pixverse-v5-t2v',
  'gmi/veo3',
  'gmi/veo3-fast',
  'gmi/luma-ray2',
]);

function getProviderLabel(provider?: string, modelId?: string, providerLabel?: string): string {
  const normalizedProvider = provider?.trim().toLowerCase();
  const normalizedLabel = providerLabel?.trim().toLowerCase();
  if (
    normalizedProvider === 'fal-ai' ||
    normalizedProvider === 'fal.ai' ||
    normalizedProvider === 'fal' ||
    normalizedProvider === 'fal_ai' ||
    normalizedLabel === 'fal.ai' ||
    normalizedLabel === 'fal' ||
    modelId?.startsWith('fal-ai/')
  ) {
    return 'Fal';
  }
  if (providerLabel) {
    return providerLabel;
  }
  if (provider === 'gmi-cloud' || modelId?.startsWith('gmi/')) {
    return 'GMI Cloud';
  }
  if (provider === 'lovable-ai') {
    return 'Lovable AI';
  }
  if (!provider) {
    return 'Other';
  }

  return provider
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function inferCapabilities(model: CatalogModelSummary): string[] {
  const capabilities = new Set<string>();

  if (model.media_type === 'text') capabilities.add('T');
  if (model.media_type === 'image') capabilities.add('I');
  if (model.media_type === 'video') capabilities.add('V');
  if (model.media_type === 'audio') capabilities.add('A');
  if (model.media_type === '3d') capabilities.add('3D');
  if (model.media_type === 'json') capabilities.add('JSON');
  if (model.supports.includes('image_url') || model.supports.includes('image_urls')) capabilities.add('R');
  if (model.supports.includes('num_images') || model.supports.includes('batch')) capabilities.add('B');
  if (model.supports.includes('style') || model.workflow_type.includes('edit')) capabilities.add('S');
  if (model.supports.includes('prompt')) capabilities.add('P');

  return Array.from(capabilities);
}

function toMarketplaceModel(mediaType: CatalogMediaType, model: CatalogModelSummary): MarketplaceModel {
  const providerLabel = getProviderLabel(model.provider, model.id, model.provider_label);
  const providerKey = providerLabel.toLowerCase();

  return {
    ...model,
    capabilities: inferCapabilities(model),
    isPinned: (PINNED_MODELS[mediaType] ?? []).includes(model.id),
    isNew: NEW_MODELS.has(model.id),
    multiModelEligible: model.ui_group === 'generation',
    providerKey,
    providerLabel,
    thumbnailUrl: getModelThumbnail(model),
  };
}

function groupProviders(models: MarketplaceModel[], mediaType: CatalogMediaType): MarketplaceProviderGroup[] {
  const grouped = new Map<string, MarketplaceProviderGroup>();

  for (const model of models) {
    const existing = grouped.get(model.providerKey);
    if (existing) {
      existing.models.push(model);
      continue;
    }

    grouped.set(model.providerKey, {
      key: model.providerKey,
      label: model.providerLabel,
      models: [model],
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const preferred = mediaType === 'text' ? ['gmi cloud', 'lovable ai', 'fal'] : ['fal', 'gmi cloud', 'lovable ai'];
    const leftIndex = preferred.indexOf(left.key);
    const rightIndex = preferred.indexOf(right.key);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    }
    return left.label.localeCompare(right.label);
  });
}

function getSummaryLabel(value: FloraModelMarketplaceValue, models: MarketplaceModel[]): string {
  const primary = value.selectedModelIds[0];
  const primaryModel = primary ? models.find((model) => model.id === primary) : undefined;
  const primaryLabel = primaryModel?.name ?? primary ?? 'Select model';

  if (value.useMultipleModels && value.selectedModelIds.length > 1) {
    return `${primaryLabel} +${value.selectedModelIds.length - 1}`;
  }

  return primaryLabel;
}

function getSummaryModel(value: FloraModelMarketplaceValue, models: MarketplaceModel[]) {
  const primary = value.selectedModelIds[0];
  return primary ? models.find((model) => model.id === primary) : undefined;
}

function filterModel(model: MarketplaceModel, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [
    model.name,
    model.description,
    model.providerLabel,
    model.vendor ?? '',
    model.family ?? '',
    model.tier ?? '',
    model.pricing_text ?? '',
    model.endpoint_id ?? '',
    model.category,
    model.workflow_type,
    model.id,
    ...(model.tags ?? []),
    ...model.aliases,
  ].join(' ').toLowerCase();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return haystack.includes(normalized) || tokens.every((token) => haystack.includes(token));
}

export function FloraModelMarketplace({
  mediaType,
  value,
  onChange,
  uiGroup = 'generation',
  workflowType,
  workflowTypes,
  provider,
  studioSurface,
  allowAdvancedSearch = true,
  className,
  compact = false,
  align = 'start',
  triggerVariant = 'dock',
  collisionBoundary,
  portalContainer,
  maxContentHeight,
}: FloraModelMarketplaceProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeProviderKey, setActiveProviderKey] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [includeAdvanced, setIncludeAdvanced] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [knownModels, setKnownModels] = useState<Record<string, CatalogModelSummary>>({});
  const normalizedSearch = search.trim();
  const selectedModelIdsKey = value.selectedModelIds.join('|');
  const fullCatalogMode = allowAdvancedSearch && (includeAdvanced || debouncedSearch.trim().length > 0);
  const effectiveWorkflowTypes = useMemo(
    () => workflowTypes?.length ? workflowTypes : workflowType ? [workflowType] : undefined,
    [workflowType, workflowTypes]
  );
  const effectiveStudioSurface = studioSurface ?? (`studio:${mediaType}` as CatalogStudioSurface);
  const { models: catalogModels, total: catalogTotal = 0, isLoading, diagnostics } = useCatalogModels({
    mediaType,
    uiGroup: fullCatalogMode ? undefined : uiGroup,
    provider,
    workflowTypes: effectiveWorkflowTypes,
    studioSurface: effectiveStudioSurface,
    includeAdvanced: fullCatalogMode,
    search: fullCatalogMode ? debouncedSearch.trim() : undefined,
    limit: fullCatalogMode ? 250 : undefined,
    offset: 0,
    autoFetch: true,
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(normalizedSearch);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [normalizedSearch]);

  useEffect(() => {
    if (catalogModels.length === 0) {
      return;
    }

    setKnownModels((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const model of catalogModels) {
        if (next[model.id] !== model) {
          next[model.id] = model;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [catalogModels]);

  useEffect(() => {
    const currentModelIds = new Set(catalogModels.map((model) => model.id));
    const missingModelIds = Array.from(new Set(value.selectedModelIds))
      .filter((modelId) => modelId && !knownModels[modelId] && !currentModelIds.has(modelId));

    if (missingModelIds.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(missingModelIds.map((modelId) => fetchSelectedCatalogModel(modelId, effectiveStudioSurface)))
      .then((resolvedModels) => {
        if (cancelled) {
          return;
        }

        const compatibleModels = resolvedModels.filter(
          (model): model is CatalogModelSummary => Boolean(model && model.media_type === mediaType)
        );
        if (compatibleModels.length === 0) {
          return;
        }

        setKnownModels((previous) => {
          let changed = false;
          const next = { ...previous };
          for (const model of compatibleModels) {
            if (next[model.id] !== model) {
              next[model.id] = model;
              changed = true;
            }
          }
          return changed ? next : previous;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [catalogModels, effectiveStudioSurface, knownModels, mediaType, selectedModelIdsKey, value.selectedModelIds]);

  const togglePin = useCallback((modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  }, []);

  const allModels = useMemo(() => {
    const merged = new Map(catalogModels.map((model) => [model.id, model]));
    for (const modelId of value.selectedModelIds) {
      const knownModel = knownModels[modelId];
      if (knownModel && knownModel.media_type === mediaType) {
        merged.set(modelId, knownModel);
      }
    }
    return Array.from(merged.values()).map((model) => toMarketplaceModel(mediaType, model));
  }, [catalogModels, knownModels, mediaType, value.selectedModelIds]);
  const pinnedModels = useMemo(
    () => allModels.filter((model) => model.isPinned && filterModel(model, search)),
    [allModels, search]
  );
  const providers = useMemo(() => {
    const raw = groupProviders(allModels, mediaType)
      .map((provider) => ({
        ...provider,
        models: provider.models.filter((model) => filterModel(model, search)),
      }))
      .filter((provider) => provider.models.length > 0);
    return raw;
  }, [allModels, mediaType, search]);
  const featuredModels = useMemo(() => {
    const allModels = providers.flatMap((provider) => provider.models);
    const pinned = pinnedModels.slice(0, 3);
    if (pinned.length > 0) {
      return pinned;
    }
    return allModels.slice(0, 4);
  }, [pinnedModels, providers]);

  useEffect(() => {
    if (providers.length === 0) {
      setActiveProviderKey(null);
      return;
    }

    const selectedProviderKey = value.selectedModelIds
      .map((modelId) => allModels.find((model) => model.id === modelId)?.providerKey)
      .find(Boolean);

    const nextProviderKey =
      activeProviderKey && providers.some((provider) => provider.key === activeProviderKey)
        ? activeProviderKey
        : selectedProviderKey && providers.some((provider) => provider.key === selectedProviderKey)
          ? selectedProviderKey
          : providers[0]?.key ?? null;

    if (nextProviderKey !== activeProviderKey) {
      setActiveProviderKey(nextProviderKey);
    }
  }, [activeProviderKey, allModels, providers, value.selectedModelIds]);

  const updateSelection = (next: Partial<FloraModelMarketplaceValue>) => {
    const merged: FloraModelMarketplaceValue = {
      auto: value.auto,
      selectedModelIds: value.selectedModelIds,
      useMultipleModels: value.useMultipleModels,
      ...next,
    };

    const uniqueIds = Array.from(new Set(merged.selectedModelIds.filter(Boolean)));
    const normalizedIds =
      merged.useMultipleModels || uniqueIds.length <= 1 ? uniqueIds : uniqueIds.slice(0, 1);
    onChange({
      ...merged,
      selectedModelIds: normalizedIds,
      useMultipleModels: merged.useMultipleModels,
    });
  };

  const toggleModel = (modelId: string) => {
    if (!value.useMultipleModels) {
      updateSelection({
        selectedModelIds: [modelId],
      });
      setOpen(false);
      return;
    }

    const nextIds = value.selectedModelIds.includes(modelId)
      ? value.selectedModelIds.filter((id) => id !== modelId)
      : [...value.selectedModelIds, modelId];

    updateSelection({
      selectedModelIds: nextIds.length > 0 ? nextIds : [modelId],
      useMultipleModels: nextIds.length > 1,
    });
  };

  const summaryModel = getSummaryModel(value, allModels);
  const isToolbarVariant = triggerVariant === 'toolbar';
  const resolvedMaxHeight = maxContentHeight ?? (isToolbarVariant ? 'min(432px, calc(100vh - 168px))' : 'min(560px, calc(100vh - 144px))');
  const providerListMaxHeight = isToolbarVariant ? 'min(248px, calc(100vh - 336px))' : 'min(360px, calc(100vh - 300px))';
  const rightPaneMaxHeight = isToolbarVariant ? 'min(352px, calc(100vh - 240px))' : 'min(452px, calc(100vh - 220px))';
  const resolvedWidth = isToolbarVariant ? 'min(760px, calc(100vw - 48px))' : 'min(860px, calc(100vw - 64px))';
  const activeProvider = providers.find((provider) => provider.key === activeProviderKey) ?? providers[0] ?? null;
  const visibleModelCount = providers.reduce((count, currentProvider) => count + currentProvider.models.length, 0);
  const totalModelCount = catalogTotal || catalogModels.length;
  const emptyStateMessage = useMemo(() => {
    const falDiagnostics = diagnostics?.fal;
    if (!falDiagnostics) {
      return 'No models match this search.';
    }

    if (falDiagnostics.total === 0) {
      return 'Fal catalog rows were not found. Apply the latest Supabase model catalog migrations and redeploy the model-catalog function.';
    }

    if (falDiagnostics.visibleForRequest === 0 && falDiagnostics.missingStudioSurface > 0) {
      return `${falDiagnostics.total} Fal rows exist, but ${falDiagnostics.missingStudioSurface} are missing Studio surface mappings. Run the Fal catalog repair migration.`;
    }

    if (falDiagnostics.visibleForRequest === 0) {
      return `${falDiagnostics.total} Fal rows exist, but none match this media type, surface, or Recommended/All filter. Try All or search the full catalog.`;
    }

    return 'No models match this search.';
  }, [diagnostics]);

  const renderModelRow = (model: MarketplaceModel, compactRow = false) => {
    const isSelected = value.selectedModelIds.includes(model.id);
    const isPinned = pinnedIds.has(model.id) || model.isPinned;
    const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleModel(model.id);
      }
    };
    const handlePinKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        setPinnedIds((prev) => {
          const next = new Set(prev);
          if (next.has(model.id)) {
            next.delete(model.id);
          } else {
            next.add(model.id);
          }
          return next;
        });
      }
    };

    return (
      <div
        key={model.id}
        role="button"
        tabIndex={0}
        onClick={() => toggleModel(model.id)}
        onKeyDown={handleRowKeyDown}
        className={cn(
          'group relative flex w-full items-start gap-3 text-left transition-all duration-150',
          compactRow
            ? 'rounded-[14px] px-3 py-2'
            : isToolbarVariant
              ? 'rounded-[16px] px-3 py-2.5'
              : 'rounded-[18px] px-3.5 py-3',
          isSelected
            ? 'border-l-[3px] border-l-[#f97316] border-y border-r border-y-[rgba(249,115,22,0.12)] border-r-[rgba(249,115,22,0.12)] bg-[#1a1510]'
            : 'border border-[rgba(249,115,22,0.06)] bg-[#121212] hover:border-[rgba(249,115,22,0.15)] hover:bg-[#161616]'
        )}
      >
        <div className={cn(
          'mt-0.5 flex flex-none overflow-hidden rounded-lg border border-[rgba(249,115,22,0.1)] bg-[#1D1D1D]',
          compactRow ? 'h-9 w-9' : 'h-11 w-11'
        )}>
          <img
            src={model.thumbnailUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('truncate font-medium text-white', compactRow ? 'text-[13px]' : 'text-sm')}>{model.name}</span>
            {model.credits === 0 ? (
              <span className="inline-flex h-[18px] items-center rounded-full border border-emerald-500/25 bg-emerald-950 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                Free
              </span>
            ) : null}
            {model.isNew ? (
              <span className="inline-flex h-[18px] items-center rounded-full border border-[#fb923c]/25 bg-[#251c0e] px-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#fdba74]">
                New
              </span>
            ) : null}
          </div>
          <div className={cn('text-xs leading-relaxed text-zinc-500', compactRow ? 'mt-0.5 line-clamp-1' : 'mt-0.5 line-clamp-2')}>
            {model.description}
          </div>
          <div className={cn('flex flex-wrap items-center gap-1 text-[10px] text-zinc-500', compactRow ? 'mt-1' : 'mt-1.5')}>
            <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-zinc-300">{model.providerLabel}</span>
            {model.family ? (
              <span className="max-w-[88px] truncate rounded-md bg-black/30 px-1.5 py-0.5 text-zinc-400">{model.family}</span>
            ) : null}
            {model.tier ? (
              <span className="rounded-md bg-black/30 px-1.5 py-0.5 capitalize text-zinc-500">{model.tier}</span>
            ) : null}
            <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-zinc-400">⊕{model.credits}</span>
            <span>{model.time}</span>
            {model.pricing_text ? (
              <span className="max-w-[112px] truncate text-zinc-600">{model.pricing_text}</span>
            ) : null}
            {model.capabilities.map((capability) => (
              <span key={`${model.id}-${capability}`} className="rounded-md bg-black/20 px-1.5 py-0.5">
                {capability}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 pt-0.5">
          <span
            role="button"
            tabIndex={0}
            aria-label={isPinned ? `Unpin ${model.name}` : `Pin ${model.name}`}
            onClick={(e) => togglePin(model.id, e)}
            onKeyDown={handlePinKeyDown}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-md transition-all',
              isPinned
                ? 'text-[#f97316]'
                : 'text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-400'
            )}
          >
            <Pin className={cn('h-3 w-3', isPinned && 'fill-current')} />
          </span>
          {isSelected ? (
            <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#f97316]">
              <Check className="h-3 w-3 text-black" />
            </div>
          ) : (
            <div className="h-4.5 w-4.5 rounded-full border border-[rgba(249,115,22,0.12)] bg-[#101010]" />
          )}
        </div>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            'justify-between gap-2 border border-[rgba(249,115,22,0.15)] text-left text-xs font-medium text-zinc-200 hover:bg-[#1D1D1D]',
            isToolbarVariant
              ? 'h-9 min-w-[164px] rounded-[13px] bg-[#121212] px-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.2)]'
              : 'h-12 min-w-[220px] rounded-[18px] bg-[#181818] px-3 shadow-[0_10px_24px_rgba(0,0,0,0.25)]',
            compact ? 'min-w-[156px]' : null,
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'flex flex-none overflow-hidden border border-[rgba(249,115,22,0.12)] bg-[#232323]',
                isToolbarVariant ? 'h-5 w-5 rounded-full' : 'h-6 w-6 rounded-full'
              )}
            >
              {summaryModel ? (
                <img
                  src={summaryModel.thumbnailUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : null}
            </span>
            <span className="truncate">{getSummaryLabel(value, allModels)}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 flex-none text-zinc-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        alignOffset={isToolbarVariant ? 0 : 2}
        collisionBoundary={collisionBoundary ?? undefined}
        container={portalContainer ?? undefined}
        collisionPadding={{ top: 12, left: 16, right: 16, bottom: 16 }}
        sideOffset={isToolbarVariant ? 8 : 10}
        className={cn(
          'border border-[rgba(249,115,22,0.12)] bg-[#0f0f0f]/98 p-0 text-white shadow-[0_0_12px_rgba(249,115,22,0.06),0_28px_90px_rgba(0,0,0,0.58)] backdrop-blur-2xl',
          isToolbarVariant ? 'rounded-[22px]' : 'rounded-[28px]'
        )}
        style={{ maxHeight: resolvedMaxHeight, width: resolvedWidth }}
      >
        <div className={cn('flex max-h-full flex-col gap-3 overflow-hidden', isToolbarVariant ? 'p-3' : 'p-3.5')}>
          {/* Search bar with keyboard hint */}
          <div className="flex items-center gap-2 rounded-[16px] border border-[rgba(249,115,22,0.1)] bg-[#171717] px-3">
            <Search className="h-4.5 w-4.5 flex-none text-zinc-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search models…"
              className={cn(
                'border-0 bg-transparent px-0 text-sm text-white placeholder:text-zinc-600 focus-visible:ring-0',
                isToolbarVariant ? 'h-10' : 'h-11'
              )}
            />
            <kbd className="hidden flex-none rounded-md border border-[rgba(249,115,22,0.08)] bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] text-zinc-600 sm:inline-flex">
              ⌘K
            </kbd>
          </div>
          {allowAdvancedSearch ? (
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex rounded-[14px] border border-[rgba(249,115,22,0.1)] bg-[#151515] p-1">
                <button
                  type="button"
                  onClick={() => setIncludeAdvanced(false)}
                  className={cn(
                    'h-7 rounded-[10px] px-3 text-[11px] font-medium transition-colors',
                    !includeAdvanced && normalizedSearch.length === 0
                      ? 'bg-[#f97316] text-black'
                      : 'text-zinc-500 hover:bg-[#1e1e1e] hover:text-zinc-300'
                  )}
                >
                  Recommended
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeAdvanced(true)}
                  className={cn(
                    'h-7 rounded-[10px] px-3 text-[11px] font-medium transition-colors',
                    fullCatalogMode
                      ? 'bg-[#f97316] text-black'
                      : 'text-zinc-500 hover:bg-[#1e1e1e] hover:text-zinc-300'
                  )}
                >
                  All
                </button>
              </div>
              <div className="min-w-0 truncate text-[11px] text-zinc-600">
                {isLoading
                  ? 'Loading models...'
                  : fullCatalogMode
                    ? `${visibleModelCount} of ${totalModelCount} models`
                    : `${visibleModelCount} recommended`}
              </div>
            </div>
          ) : null}

          <div
            className="grid min-h-0 gap-3"
            style={{
              gridTemplateColumns: isToolbarVariant ? '300px minmax(0, 1fr)' : '320px minmax(0, 1fr)',
            }}
          >
            {/* Left pane */}
            <ScrollArea className="min-h-0" style={{ maxHeight: rightPaneMaxHeight }}>
              <div className="space-y-2.5 pr-2">
              {/* Settings panel */}
              <div className={cn('grid gap-2.5 rounded-[20px] border border-[rgba(249,115,22,0.08)] bg-[#141414]', isToolbarVariant ? 'p-3' : 'p-3.5')}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-[13px] text-zinc-200">
                      <span>Auto select</span>
                      <Info className="h-3 w-3 text-zinc-600" />
                    </div>
                    <div className="mt-0.5 text-[10px] leading-tight text-zinc-600">Let WZRD pick the best model</div>
                  </div>
                  <Switch
                    checked={value.auto}
                    onCheckedChange={(checked) => updateSelection({ auto: checked })}
                  />
                </div>
                <div className="h-px bg-[rgba(249,115,22,0.06)]" />
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-[13px] text-zinc-200">
                      <span>Multi-model</span>
                      <Info className="h-3 w-3 text-zinc-600" />
                    </div>
                    <div className="mt-0.5 text-[10px] leading-tight text-zinc-600">Generate with multiple models at once</div>
                  </div>
                  <Switch
                    checked={value.useMultipleModels}
                    onCheckedChange={(checked) =>
                      updateSelection({
                        useMultipleModels: checked,
                        selectedModelIds: checked ? value.selectedModelIds : value.selectedModelIds.slice(0, 1),
                    })
                  }
                  />
                </div>
              </div>

              {/* Pinned models */}
              <section className="space-y-1.5">
                <div className="px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600">
                  Pinned
                </div>
                {pinnedModels.length > 0 ? (
                  <div className="space-y-1.5">{pinnedModels.map((model) => renderModelRow(model, true))}</div>
                ) : (
                  <div className="rounded-[14px] border border-dashed border-[rgba(249,115,22,0.08)] bg-[#131313] px-3 py-2.5 text-[11px] leading-relaxed text-zinc-600">
                    Pin models for quick access
                  </div>
                )}
              </section>

              {/* Featured models */}
              {featuredModels.length > 0 ? (
                <section className="space-y-1.5">
                  <div className="px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600">
                    Featured
                  </div>
                  <div className="space-y-1.5">{featuredModels.map((model) => renderModelRow(model, true))}</div>
                </section>
              ) : null}

              {/* Providers */}
              <section className="space-y-1.5">
                <div className="px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600">
                  Providers
                </div>
                <div className="space-y-1.5">
                  {providers.map((provider) => {
                      const isActive = provider.key === activeProvider?.key;
                      return (
                        <button
                          key={provider.key}
                          type="button"
                          onClick={() => setActiveProviderKey(provider.key)}
                          className={cn(
                            'relative flex w-full items-center justify-between rounded-[14px] border px-3 py-2.5 text-left transition-all duration-150 overflow-hidden',
                            isActive
                              ? 'border-[rgba(249,115,22,0.15)] bg-[#1B1B1B]'
                              : 'border-[rgba(249,115,22,0.06)] bg-[#131313] hover:border-[rgba(249,115,22,0.12)] hover:bg-[#171717]'
                          )}
                        >
                          {isActive && (
                            <div className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-[#f97316]" />
                          )}
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 overflow-hidden rounded-lg border border-[rgba(249,115,22,0.1)] bg-[#1D1D1D]">
                              <img
                                src={provider.models[0]?.thumbnailUrl}
                                alt=""
                                aria-hidden="true"
                                className="h-full w-full object-cover"
                                draggable={false}
                              />
                            </div>
                            <div>
                              <div className="text-[13px] font-medium text-white">{provider.label}</div>
                              <div className="text-[10px] text-zinc-600">
                                {provider.models.length} model{provider.models.length === 1 ? '' : 's'}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className={cn(
                            'h-3.5 w-3.5 text-zinc-600 transition-transform duration-150',
                            isActive && 'rotate-90 text-zinc-400'
                          )} />
                        </button>
                      );
                    })}
                </div>
              </section>
              </div>
            </ScrollArea>

            {/* Right pane */}
            <div className="min-h-0 flex flex-col overflow-hidden rounded-[20px] border border-[rgba(249,115,22,0.08)] bg-[#131313]" style={{ maxHeight: rightPaneMaxHeight }}>
              {activeProvider ? (
                <>
                  <div className="flex-shrink-0 flex items-center justify-between px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="text-[13px] font-medium text-white">{activeProvider.label}</div>
                      <span className="inline-flex h-[18px] items-center rounded-full border border-[rgba(249,115,22,0.1)] bg-[#1a1a1a] px-1.5 text-[10px] tabular-nums text-zinc-500">
                        {activeProvider.models.length}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 mx-3.5 h-px bg-[rgba(249,115,22,0.06)]" />
                  <ScrollArea className="min-h-0 flex-1 pr-2.5">
                    <div className="space-y-1.5 p-2.5">
                      {activeProvider.models.map((model) => renderModelRow(model))}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex h-full min-h-[260px] items-center justify-center px-6 text-sm text-zinc-600">
                  {emptyStateMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
