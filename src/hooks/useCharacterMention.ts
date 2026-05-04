import { useCallback, useMemo, useRef, useState } from 'react';
import { useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { incrementBlueprintUsage } from '@/services/characterBlueprintService';
import type { CharacterMention, ResolvedCharacterRef } from '@/types/character-creation';

// ---------------------------------------------------------------------------
// useCharacterMention — @mention autocomplete + prompt injection
// ---------------------------------------------------------------------------
//
// Usage:
//   const { suggestions, onPromptChange, resolvePrompt, ... } = useCharacterMention();
//
//   <textarea value={prompt} onChange={(e) => { setPrompt(e.target.value); onPromptChange(e.target.value); }} />
//
//   {showSuggestions && <MentionDropdown suggestions={suggestions} onSelect={onSelectSuggestion} />}
//
//   // When submitting:
//   const { expandedPrompt, usedCharacters } = resolvePrompt(prompt);
// ---------------------------------------------------------------------------

interface UseCharacterMentionReturn {
  /** Filtered suggestion list based on current @query */
  suggestions: CharacterMention[];
  /** Whether the suggestion dropdown should be shown */
  showSuggestions: boolean;
  /** Call when prompt text changes — extracts @mention queries */
  onPromptChange: (text: string, cursorPos?: number) => void;
  /** Select a suggestion — replaces the @query with the slug */
  onSelectSuggestion: (mention: CharacterMention, currentPrompt: string) => string;
  /** Resolve all @mentions in prompt to their prompt fragments */
  resolvePrompt: (prompt: string) => {
    expandedPrompt: string;
    elementPrompt: string;
    elementIds: string[];
    referenceAssetIds: string[];
    referenceImageUrls: string[];
    usedCharacters: ResolvedCharacterRef[];
  };
  /** Close suggestions */
  closeSuggestions: () => void;
}

export function useCharacterMention(): UseCharacterMentionReturn {
  const getMentionList = useCharacterCreationStore((s) => s.getMentionList);
  const findBySlug = useCharacterCreationStore((s) => s.findBySlug);
  const incrementUsage = useCharacterCreationStore((s) => s.incrementUsage);

  const [activeQuery, setActiveQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // All available mentions
  const allMentions = useMemo(() => getMentionList(), [getMentionList]);

  // Filtered by active query
  const suggestions = useMemo(() => {
    if (!activeQuery) return [];
    const q = activeQuery.toLowerCase();
    return allMentions
      .filter((m) => m.slug.startsWith(q) || m.name.toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [allMentions, activeQuery]);

  // Detect @mention typing
  const onPromptChange = useCallback((text: string, cursorPos?: number) => {
    const pos = cursorPos ?? text.length;
    // Walk backwards from cursor to find @
    const before = text.slice(0, pos);
    const atMatch = before.match(/@([\w-]*)$/);

    if (atMatch) {
      setActiveQuery(atMatch[1]);
      setShowSuggestions(true);
    } else {
      setActiveQuery('');
      setShowSuggestions(false);
    }
  }, []);

  // Replace @query with @slug
  const onSelectSuggestion = useCallback(
    (mention: CharacterMention, currentPrompt: string): string => {
      // Replace the trailing @query with @slug
      const replaced = currentPrompt.replace(
        new RegExp(`@${activeQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
        `@${mention.slug} `,
      );
      setShowSuggestions(false);
      setActiveQuery('');
      return replaced;
    },
    [activeQuery],
  );

  // Resolve @mentions → prompt fragments
  const resolvePrompt = useCallback(
    (prompt: string) => {
      const mentionRegex = /@([\w-]+)/g;
      const usedCharacters: ResolvedCharacterRef[] = [];
      let expandedPrompt = prompt;
      let elementPrompt = prompt;
      const elementIds: string[] = [];
      const referenceAssetIds: string[] = [];
      const referenceImageUrls: string[] = [];
      const elementIndexById = new Map<string, number>();

      const matches = Array.from(prompt.matchAll(mentionRegex));
      for (const match of matches) {
        const slug = match[1];
        const bp = findBySlug(slug);
        if (bp) {
          usedCharacters.push({
            slug: bp.slug,
            name: bp.name,
            imageUrl: bp.imageUrl,
            promptFragment: bp.promptFragment,
            referenceAssetIds: bp.referenceAssetIds,
            referenceImageUrls: bp.referenceImageUrls,
            gmiElementId: bp.gmiElementId,
          });

          for (const assetId of bp.referenceAssetIds) {
            if (!referenceAssetIds.includes(assetId)) {
              referenceAssetIds.push(assetId);
            }
          }

          for (const imageUrl of bp.referenceImageUrls) {
            if (!referenceImageUrls.includes(imageUrl)) {
              referenceImageUrls.push(imageUrl);
            }
          }

          // Replace @slug with the prompt fragment
          expandedPrompt = expandedPrompt.replace(
            `@${slug}`,
            `[${bp.name}: ${bp.promptFragment}]`,
          );

          if (bp.gmiElementId) {
            let tokenIndex = elementIndexById.get(bp.gmiElementId);
            if (!tokenIndex) {
              elementIds.push(bp.gmiElementId);
              tokenIndex = elementIds.length;
              elementIndexById.set(bp.gmiElementId, tokenIndex);
            }
            elementPrompt = elementPrompt.replace(`@${slug}`, `<<<element_${tokenIndex}>>>`);
          } else {
            elementPrompt = elementPrompt.replace(
              `@${slug}`,
              `[${bp.name}: ${bp.promptFragment}]`,
            );
          }

          // Increment usage (fire-and-forget)
          incrementUsage(bp.id);
          incrementBlueprintUsage(bp.id).catch(() => {});
        }
      }

      return {
        expandedPrompt,
        elementPrompt,
        elementIds,
        referenceAssetIds,
        referenceImageUrls,
        usedCharacters,
      };
    },
    [findBySlug, incrementUsage],
  );

  const closeSuggestions = useCallback(() => {
    setShowSuggestions(false);
    setActiveQuery('');
  }, []);

  return {
    suggestions,
    showSuggestions,
    onPromptChange,
    onSelectSuggestion,
    resolvePrompt,
    closeSuggestions,
  };
}
