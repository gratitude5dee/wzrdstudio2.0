import { describe, expect, it } from 'vitest';

import { groupMentionsByKind, sortBlueprintsForReference } from '@/lib/characterBlueprintReference';
import type { CharacterBlueprint, CharacterMention } from '@/types/character-creation';

function blueprint(overrides: Partial<CharacterBlueprint>): CharacterBlueprint {
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
    promptFragment: 'anchor',
    imageUrl: null,
    thumbnailUrl: null,
    referenceAssetIds: [],
    referenceImageUrls: [],
    isFavorite: false,
    usageCount: 0,
    createdAt: '2026-05-04T08:00:00.000Z',
    updatedAt: '2026-05-04T08:00:00.000Z',
    ...overrides,
  };
}

function mention(overrides: Partial<CharacterMention>): CharacterMention {
  return {
    id: 'mention-1',
    name: 'Nova Pilot',
    slug: 'nova-pilot',
    imageUrl: null,
    promptFragment: 'anchor',
    kind: 'character',
    isPinned: false,
    usageCount: 0,
    updatedAt: '2026-05-04T08:00:00.000Z',
    referenceAssetIds: [],
    referenceImageUrls: [],
    ...overrides,
  };
}

describe('characterBlueprintReference', () => {
  it('sorts blueprints by category and pinned priority', () => {
    const sorted = sortBlueprintsForReference([
      blueprint({ id: 'location-1', name: 'Neon Bazaar', kind: 'location', isFavorite: true }),
      blueprint({ id: 'character-1', name: 'Nova Pilot', kind: 'character', isFavorite: false }),
      blueprint({ id: 'object-1', name: 'Crystal Key', kind: 'object', isFavorite: true }),
      blueprint({ id: 'character-2', name: 'Astra Guide', kind: 'character', isFavorite: true }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['character-2', 'character-1', 'object-1', 'location-1']);
  });

  it('groups mentions and sorts pinned entries within each category', () => {
    const grouped = groupMentionsByKind([
      mention({ id: 'object-1', name: 'Crystal Key', slug: 'crystal-key', kind: 'object' }),
      mention({ id: 'object-2', name: 'Orb Core', slug: 'orb-core', kind: 'object', isPinned: true }),
      mention({ id: 'location-1', name: 'Neon Bazaar', slug: 'neon-bazaar', kind: 'environment' }),
    ]);

    expect(grouped.object.map((item) => item.slug)).toEqual(['orb-core', 'crystal-key']);
    expect(grouped.location.map((item) => item.slug)).toEqual(['neon-bazaar']);
  });
});
