import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Model {
  id: string;
  name: string;
  icon?: React.ReactNode;
  credits?: number;
  time?: string;
  description?: string;
  provider?: string;
  category?: string;
  capabilities?: Array<'text' | 'image' | 'video' | 'audio' | '3d'>;
  type?: 'text' | 'image' | 'video';
  media_type?: 'text' | 'image' | 'video' | 'audio';
  workflow_type?: string;
  ui_group?: 'generation' | 'advanced';
}

interface ModelSelectorProps {
  models: Model[];
  selectedModelId: string;
  onModelSelect: (modelId: string) => void;
  modelType: 'text' | 'image' | 'video';
  isOpen: boolean;
  toggleOpen: () => void;
}

type GroupFilter = 'generation' | 'advanced';

const inferModelType = (model: Model, fallback: ModelSelectorProps['modelType']) => {
  if (model.media_type && (model.media_type === 'image' || model.media_type === 'video' || model.media_type === 'text')) {
    return model.media_type;
  }
  if (model.type) return model.type;
  if (model.category?.includes('image')) return 'image';
  if (model.category?.includes('video')) return 'video';
  if (model.category?.includes('text') || model.category?.includes('llm')) return 'text';
  return fallback;
};

const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedModelId,
  onModelSelect,
  modelType,
  isOpen,
  toggleOpen,
}) => {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('generation');

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId),
    [models, selectedModelId]
  );

  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return models.filter((model) => {
      const typeMatches = inferModelType(model, modelType) === modelType;
      const group = model.ui_group || 'generation';
      const groupMatches = group === groupFilter;
      const searchMatches =
        !query ||
        model.name.toLowerCase().includes(query) ||
        model.description?.toLowerCase().includes(query) ||
        model.workflow_type?.toLowerCase().includes(query);

      return typeMatches && groupMatches && searchMatches;
    });
  }, [groupFilter, modelType, models, search]);

  const generationCount = useMemo(
    () => models.filter((model) => inferModelType(model, modelType) === modelType && (model.ui_group || 'generation') === 'generation').length,
    [modelType, models]
  );
  const advancedCount = useMemo(
    () => models.filter((model) => inferModelType(model, modelType) === modelType && (model.ui_group || 'generation') === 'advanced').length,
    [modelType, models]
  );

  return (
    <div className="relative">
      <button
        className="flex w-full items-center justify-between gap-2 rounded-full border border-white/10 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-all duration-150 hover:bg-zinc-700"
        onClick={toggleOpen}
        type="button"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-[10px] text-white">
            {selectedModel?.icon ?? selectedModel?.name?.[0] ?? '?'}
          </span>
          <span className="truncate">{selectedModel?.name || 'Select Model'}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-zinc-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute left-1/2 top-full z-50 mt-3 w-[360px] -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/98 p-3 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="space-y-3">
            <div className="rounded-xl border border-white/5 bg-zinc-900/70 px-3 py-2">
              <div className="flex items-center gap-2 text-zinc-400">
                <Search className="h-4 w-4" />
                <input
                  className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                  placeholder="Search models..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setGroupFilter('generation')}
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5 text-left transition-all',
                    groupFilter === 'generation'
                      ? 'border-blue-500/40 bg-blue-500/20 text-blue-200'
                      : 'border-white/10 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  Generation ({generationCount})
                </button>
                <button
                  type="button"
                  onClick={() => setGroupFilter('advanced')}
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5 text-left transition-all',
                    groupFilter === 'advanced'
                      ? 'border-blue-500/40 bg-blue-500/20 text-blue-200'
                      : 'border-white/10 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  Advanced ({advancedCount})
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 max-h-[320px] space-y-1 overflow-y-auto pr-1">
            {filteredModels.map((model) => {
              const isSelected = selectedModelId === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  className={cn(
                    'relative flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left transition-all',
                    isSelected ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/40'
                  )}
                  onClick={() => {
                    onModelSelect(model.id);
                    toggleOpen();
                  }}
                >
                  {isSelected && <span className="absolute left-0 top-2 h-[calc(100%-16px)] w-1 rounded-full bg-blue-500" />}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm text-white">
                    {model.icon ?? model.name[0]}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-100">{model.name}</span>
                      {model.ui_group === 'advanced' && (
                        <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] text-zinc-300">Advanced</span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-zinc-500">{model.description}</div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      {model.time && <span>{model.time}</span>}
                      {model.credits ? <span>{model.credits} credits</span> : null}
                      {model.workflow_type ? <span>{model.workflow_type}</span> : null}
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-zinc-100" />}
                </button>
              );
            })}
            {filteredModels.length === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
                No models match this filter.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
