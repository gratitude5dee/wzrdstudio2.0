import React from 'react';
import { User2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CharacterMention } from '@/types/character-creation';

// ---------------------------------------------------------------------------
// MentionDropdown — Floating autocomplete for @character references
// ---------------------------------------------------------------------------

interface MentionDropdownProps {
  suggestions: CharacterMention[];
  onSelect: (mention: CharacterMention) => void;
  visible: boolean;
}

export function MentionDropdown({ suggestions, onSelect, visible }: MentionDropdownProps) {
  if (!visible || suggestions.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-md">
      <div className="p-1.5">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Characters
        </p>
        {suggestions.map((mention) => (
          <button
            key={mention.id}
            type="button"
            onClick={() => onSelect(mention)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors',
              'hover:bg-white/[0.06]',
            )}
          >
            {/* Avatar */}
            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800">
              {mention.imageUrl ? (
                <img
                  src={mention.imageUrl}
                  alt={mention.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <User2 className="h-4 w-4 text-zinc-600" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{mention.name}</p>
              <p className="truncate text-xs text-zinc-500">@{mention.slug}</p>
            </div>

            {/* Kind badge */}
            <span className="flex-shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-zinc-500">
              {mention.kind}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
