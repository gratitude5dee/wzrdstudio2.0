import React from 'react';
import { cn } from '@/lib/utils';
import type { TraitOption } from '@/types/character-creation';

// ---------------------------------------------------------------------------
// TraitGrid — Visual selector grid (card-based, like reference screenshots)
// ---------------------------------------------------------------------------

interface TraitGridProps<T extends string> {
  title: string;
  options: TraitOption<T>[];
  selected: T | undefined;
  onSelect: (value: T) => void;
  columns?: 2 | 3 | 4;
}

export function TraitGrid<T extends string>({
  title,
  options,
  selected,
  onSelect,
  columns = 3,
}: TraitGridProps<T>) {
  const gridCols =
    columns === 2
      ? 'grid-cols-2'
      : columns === 4
        ? 'grid-cols-2 sm:grid-cols-4'
        : 'grid-cols-2 sm:grid-cols-3';

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-400">
        <span className="inline-block h-2 w-2 rounded-full bg-lime-400" />
        {title}
      </h3>
      <div className={cn('grid gap-3', gridCols)}>
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={cn(
                'group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border px-3 py-5 text-sm font-medium transition-all',
                isSelected
                  ? 'border-lime-300/50 bg-lime-300/10 text-white shadow-[0_0_30px_rgba(190,242,100,0.1)]'
                  : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-white',
              )}
            >
              {option.imageUrl ? (
                <img
                  src={option.imageUrl}
                  alt={option.label}
                  className="mb-2 h-20 w-20 rounded-xl object-cover"
                />
              ) : option.icon ? (
                <span className="mb-2 text-2xl">{option.icon}</span>
              ) : null}
              <span className="text-center text-xs">{option.label}</span>
              {isSelected && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-lime-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
