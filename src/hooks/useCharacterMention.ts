import { useCallback, useMemo, useState } from 'react';
import { useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { incrementBlueprintUsage, toggleBlueprintPinned } from '@/services/characterBlueprintService';
import { resolveReferenceMentionsFromBlueprints, type ReferenceRankingOptions, type ReferenceResolverWarning, type RegistryReferenceAsset } from '@/lib/referenceRegistry';
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
    referenceAssets: RegistryReferenceAsset[];
    usedCharacters: ResolvedCharacterRef[];
    warnings: ReferenceResolverWarning[];
  };
  /** Close suggestions */
  closeSuggestions: () => void;
  /** Persistently pin/unpin a mention in reference dropdowns. */
  toggleMentionPinned: (mention: CharacterMention) => Promise<void>;
}

export function useCharacterMention(options: ReferenceRankingOptions = {}): UseCharacterMentionReturn {
  const blueprints = useCharacterCreationStore((s) => s.blueprints);
  const getMentionList = useCharacterCreationStore((s) => s.getMentionList);
  const findBySlug = useCharacterCreationStore((s) => s.findBySlug);
  const incrementUsage = useCharacterCreationStore((s) => s.incrementUsage);
  const updateBlueprint = useCharacterCreationStore((s) => s.updateBlueprint);

  const [activeQuery, setActiveQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const mentionOptions = useMemo(
    () => ({ projectId: options.projectId, includePinned: options.includePinned }),
    [options.projectId, options.includePinned],
  );

  // All available mentions
  const allMentions = useMemo(() => getMentionList(mentionOptions), [getMentionList, blueprints, mentionOptions]);

  // Filtered by active query
  const suggestions = useMemo(() => {
    if (!activeQuery) return allMentions.slice(0, 12);
    const q = activeQuery.toLowerCase();
    return allMentions
      .filter((m) => m.slug.startsWith(q) || m.name.toLowerCase().startsWith(q))
      .slice(0, 12);
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
      const resolved = resolveReferenceMentionsFromBlueprints(prompt, blueprints, mentionOptions);
      const usedCharacters: ResolvedCharacterRef[] = [];

      const matches = Array.from(prompt.matchAll(mentionRegex));
      for (const match of matches) {
        const slug = match[1];
        const bp = findBySlug(slug, mentionOptions);
        if (bp) {
          usedCharacters.push({
            slug: bp.slug,
            name: bp.name,
            imageUrl: bp.imageUrl,
            promptFragment: bp.promptFragment,
            kind: bp.kind,
            tags: bp.tags,
            referenceAssetIds: bp.referenceAssetIds,
            referenceImageUrls: bp.referenceImageUrls,
            referenceAssets: bp.referenceAssets,
            gmiElementId: bp.gmiElementId,
          });

          // Increment usage (fire-and-forget)
          incrementUsage(bp.id);
          incrementBlueprintUsage(bp.id).catch(() => {});
        }
      }

      return {
        expandedPrompt: resolved.expandedPrompt,
        elementPrompt: resolved.elementPrompt,
        elementIds: resolved.elementIds,
        referenceAssetIds: resolved.referenceAssetIds,
        referenceImageUrls: resolved.referenceImageUrls,
        referenceAssets: resolved.referenceAssets,
        usedCharacters,
        warnings: resolved.warnings,
      };
    },
    [blueprints, findBySlug, incrementUsage, mentionOptions],
  );

  const closeSuggestions = useCallback(() => {
    setShowSuggestions(false);
    setActiveQuery('');
  }, []);

  const toggleMentionPinned = useCallback(
    async (mention: CharacterMention) => {
      const nextPinned = !mention.isPinned;
      updateBlueprint(mention.id, { isFavorite: nextPinned });
      try {
        const updated = await toggleBlueprintPinned(mention.id, nextPinned);
        updateBlueprint(updated.id, updated);
      } catch (error) {
        updateBlueprint(mention.id, { isFavorite: mention.isPinned });
        throw error;
      }
    },
    [updateBlueprint],
  );

  return {
    suggestions,
    showSuggestions,
    onPromptChange,
    onSelectSuggestion,
    resolvePrompt,
    closeSuggestions,
    toggleMentionPinned,
  };
}
