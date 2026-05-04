import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCharacterMention } from '@/hooks/useCharacterMention';
import { useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import type { CharacterBlueprint } from '@/types/character-creation';

vi.mock('@/services/characterBlueprintService', () => ({
  incrementBlueprintUsage: vi.fn(() => Promise.resolve()),
}));

function createBlueprint(overrides: Partial<CharacterBlueprint> = {}): CharacterBlueprint {
  return {
    id: 'blueprint-1',
    userId: 'user-1',
    projectId: null,
    name: 'Nova Pilot',
    slug: 'nova-pilot',
    kind: 'character',
    traits: {},
    faceDetails: {},
    bodyDetails: {},
    styleDetails: {},
    promptFragment: 'CHARACTER ANCHOR: Nova Pilot, silver flight suit, amber visor',
    imageUrl: 'https://cdn.example.com/nova.png',
    thumbnailUrl: 'https://cdn.example.com/nova.png',
    referenceAssetIds: ['asset-image-1'],
    referenceImageUrls: ['https://cdn.example.com/nova-ref.png'],
    gmiElementId: 'element-nova',
    gmiElementRequestId: null,
    gmiElementStatus: 'success',
    gmiElementError: null,
    gmiElementUpdatedAt: null,
    isFavorite: false,
    usageCount: 0,
    createdAt: '2026-05-04T08:00:00.000Z',
    updatedAt: '2026-05-04T08:00:00.000Z',
    ...overrides,
  };
}

describe('useCharacterMention', () => {
  beforeEach(() => {
    useCharacterCreationStore.getState().reset();
    useCharacterCreationStore.getState().setBlueprints([createBlueprint()]);
  });

  it('suggests and resolves blueprint anchors, references, and element ids', () => {
    const { result } = renderHook(() => useCharacterMention());

    act(() => {
      result.current.onPromptChange('A tracking shot of @nova');
    });

    expect(result.current.showSuggestions).toBe(true);
    expect(result.current.suggestions[0]?.slug).toBe('nova-pilot');

    const resolved = result.current.resolvePrompt('A tracking shot of @nova-pilot');

    expect(resolved.expandedPrompt).toContain('CHARACTER ANCHOR: Nova Pilot');
    expect(resolved.elementPrompt).toContain('<<<element_1>>>');
    expect(resolved.elementIds).toEqual(['element-nova']);
    expect(resolved.referenceAssetIds).toEqual(['asset-image-1']);
    expect(resolved.referenceImageUrls).toEqual(['https://cdn.example.com/nova-ref.png']);
    expect(resolved.usedCharacters[0]?.gmiElementId).toBe('element-nova');
  });
});
