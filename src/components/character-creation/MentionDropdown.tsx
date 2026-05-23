import React from 'react';
import { Boxes, Image as ImageIcon, MapPin, Pin, Sparkles, User2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getReferenceGroupLabel,
  groupMentionsByKind,
  REFERENCE_GROUPS,
  type ReferenceBlueprintGroup,
} from '@/lib/characterBlueprintReference';
import type { CharacterMention } from '@/types/character-creation';

// ---------------------------------------------------------------------------
// MentionDropdown — Floating autocomplete for @character references
// ---------------------------------------------------------------------------

interface MentionDropdownProps {
  suggestions: CharacterMention[];
  onSelect: (mention: CharacterMention) => void;
  onTogglePin?: (mention: CharacterMention) => void;
  visible: boolean;
}

const GROUP_ICON: Record<ReferenceBlueprintGroup, typeof User2> = {
  character: User2,
  object: Boxes,
  location: MapPin,
};

export function MentionDropdown({ suggestions, onSelect, onTogglePin, visible }: MentionDropdownProps) {
  if (!visible) return null;

  const grouped = groupMentionsByKind(suggestions);
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-[22rem] overflow-hidden rounded-2xl border border-orange-400/15 bg-[#0d0d0f]/95 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-300/80">
          <Sparkles className="h-3 w-3" />
          Reference Blueprints
        </p>
      </div>
      {!hasSuggestions ? (
        <div className="p-4 text-sm text-zinc-500">No matching blueprints.</div>
      ) : (
        <div className="max-h-[360px] space-y-2 overflow-y-auto p-2">
          {REFERENCE_GROUPS.map((group) => {
            const items = grouped[group];
            if (items.length === 0) return null;
            const GroupIcon = GROUP_ICON[group];

            return (
              <div key={group} className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1">
                  <GroupIcon className="h-3.5 w-3.5 text-zinc-500" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    {getReferenceGroupLabel(group)}
                  </p>
                </div>
                {items.map((mention) => (
                  <div
                    key={mention.id}
                    role="button"
                    tabIndex={0}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelect(mention)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(mention);
                      }
                    }}
                    className={cn(
                      'cursor-pointer',
                      'group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors',
                      'hover:bg-white/[0.06]',
                    )}
                  >
                    <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-zinc-900">
                      {mention.imageUrl ? (
                        <img
                          src={mention.imageUrl}
                          alt={mention.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <GroupIcon className="h-4 w-4 text-zinc-600" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-white">{mention.name}</p>
                        {mention.isPinned && <Pin className="h-3 w-3 flex-shrink-0 fill-orange-300 text-orange-300" />}
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                        <p className="truncate font-mono text-xs text-orange-300/80">@{mention.slug}</p>
                        {mention.referenceAssetIds.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-zinc-500">
                            <ImageIcon className="h-2.5 w-2.5" />
                            {mention.referenceAssetIds.length}
                          </span>
                        )}
                        {mention.gmiElementId && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-lime-300/10 px-1.5 py-0.5 text-[9px] text-lime-300">
                            <Zap className="h-2.5 w-2.5" />
                            element
                          </span>
                        )}
                      </div>
                    </div>

                    {onTogglePin && (
                      <button
                        type="button"
                        aria-label={mention.isPinned ? `Unpin ${mention.name}` : `Pin ${mention.name}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onTogglePin(mention);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onTogglePin(mention);
                          }
                        }}
                        className={cn(
                          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-colors',
                          mention.isPinned
                            ? 'border-orange-300/30 bg-orange-300/10 text-orange-300'
                            : 'border-white/[0.06] text-zinc-600 group-hover:text-zinc-300',
                        )}
                      >
                        <Pin className={cn('h-3.5 w-3.5', mention.isPinned && 'fill-current')} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
