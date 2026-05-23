import { describe, expect, it } from 'vitest';

import {
  normalizeReferenceTags,
  resolveReferenceMentionsFromBlueprints,
  sortReferenceBlueprints,
} from '@/lib/referenceRegistry';
import type { CharacterBlueprint } from '@/types/character-creation';

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
    promptFragment: 'CHARACTER ANCHOR: Nova Pilot, silver flight suit',
    imageUrl: null,
    thumbnailUrl: null,
    referenceAssetIds: [],
    referenceImageUrls: [],
    isFavorite: false,
    usageCount: 0,
    tags: [],
    referenceAssets: [],
    createdAt: '2026-05-04T08:00:00.000Z',
    updatedAt: '2026-05-04T08:00:00.000Z',
    ...overrides,
  };
}

describe('referenceRegistry', () => {
  it('normalizes tags for searchable registry metadata', () => {
    expect(normalizeReferenceTags([' @Hero ', '#Hero', 'Wide Shot', '', 'wide-shot', 'Mood Board'])).toEqual([
      'hero',
      'wide-shot',
      'mood-board',
    ]);
  });

  it('sorts current project references before pinned reusable references', () => {
    const sorted = sortReferenceBlueprints(
      [
        blueprint({
          id: 'global-pinned',
          name: 'Global Pinned',
          slug: 'global-pinned',
          projectId: null,
          isFavorite: true,
          usageCount: 100,
        }),
        blueprint({
          id: 'project-match',
          name: 'Project Match',
          slug: 'project-match',
          projectId: 'project-1',
          isFavorite: false,
          usageCount: 0,
        }),
      ],
      { projectId: 'project-1' },
    );

    expect(sorted.map((item) => item.id)).toEqual(['project-match', 'global-pinned']);
  });

  it('expands known mentions, keeps unknown mentions visible, and returns role-aware references', () => {
    const resolved = resolveReferenceMentionsFromBlueprints(
      'A poster of @nova-pilot near @missing-location',
      [
        blueprint({
          id: 'nova',
          slug: 'nova-pilot',
          name: 'Nova Pilot',
          projectId: 'project-1',
          kind: 'character',
          referenceAssetIds: ['asset-1'],
          referenceImageUrls: ['https://cdn.example.com/nova.png'],
          referenceAssets: [
            {
              assetId: 'asset-1',
              url: 'https://cdn.example.com/nova.png',
              type: 'image',
              role: 'primary',
            },
          ],
          gmiElementId: 'element-nova',
        }),
      ],
      { projectId: 'project-1' },
    );

    expect(resolved.expandedPrompt).toContain('[Nova Pilot: CHARACTER ANCHOR: Nova Pilot');
    expect(resolved.expandedPrompt).toContain('@missing-location');
    expect(resolved.elementPrompt).toContain('<<<element_1>>>');
    expect(resolved.elementIds).toEqual(['element-nova']);
    expect(resolved.referenceAssetIds).toEqual(['asset-1']);
    expect(resolved.referenceImageUrls).toEqual(['https://cdn.example.com/nova.png']);
    expect(resolved.references[0]).toMatchObject({
      blueprintId: 'nova',
      slug: 'nova-pilot',
      roles: ['primary'],
    });
    expect(resolved.referenceAssets).toEqual([
      {
        assetId: 'asset-1',
        url: 'https://cdn.example.com/nova.png',
        type: 'image',
        role: 'primary',
      },
    ]);
    expect(resolved.warnings).toEqual([
      expect.objectContaining({ slug: 'missing-location' }),
    ]);
  });
});
