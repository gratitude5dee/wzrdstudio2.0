import type { CharacterBlueprint, CharacterKind, CharacterMention } from '@/types/character-creation';

export type ReferenceBlueprintGroup = 'character' | 'object' | 'location';

export const REFERENCE_GROUPS: readonly ReferenceBlueprintGroup[] = ['character', 'object', 'location'];

const GROUP_LABELS: Record<ReferenceBlueprintGroup, string> = {
  character: 'Characters',
  object: 'Objects',
  location: 'Locations',
};

export function getReferenceGroup(kind: CharacterKind): ReferenceBlueprintGroup {
  if (kind === 'location' || kind === 'environment') return 'location';
  if (kind === 'object' || kind === 'vehicle') return 'object';
  return 'character';
}

export function getReferenceGroupLabel(group: ReferenceBlueprintGroup): string {
  return GROUP_LABELS[group];
}

export function sortBlueprintsForReference<T extends {
  kind: CharacterKind;
  isFavorite?: boolean;
  usageCount?: number;
  updatedAt?: string;
  name: string;
}>(blueprints: T[]): T[] {
  return [...blueprints].sort((left, right) => {
    const groupDelta = REFERENCE_GROUPS.indexOf(getReferenceGroup(left.kind)) - REFERENCE_GROUPS.indexOf(getReferenceGroup(right.kind));
    if (groupDelta !== 0) return groupDelta;

    const pinnedDelta = Number(Boolean(right.isFavorite)) - Number(Boolean(left.isFavorite));
    if (pinnedDelta !== 0) return pinnedDelta;

    const usageDelta = (right.usageCount ?? 0) - (left.usageCount ?? 0);
    if (usageDelta !== 0) return usageDelta;

    const updatedDelta = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
    if (updatedDelta !== 0) return updatedDelta;

    return left.name.localeCompare(right.name);
  });
}

export function groupMentionsByKind(mentions: CharacterMention[]): Record<ReferenceBlueprintGroup, CharacterMention[]> {
  const grouped: Record<ReferenceBlueprintGroup, CharacterMention[]> = {
    character: [],
    object: [],
    location: [],
  };

  for (const mention of mentions) {
    grouped[getReferenceGroup(mention.kind)].push(mention);
  }

  for (const group of REFERENCE_GROUPS) {
    grouped[group] = [...grouped[group]].sort((left, right) => {
      const pinnedDelta = Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned));
      if (pinnedDelta !== 0) return pinnedDelta;

      const usageDelta = (right.usageCount ?? 0) - (left.usageCount ?? 0);
      if (usageDelta !== 0) return usageDelta;

      const updatedDelta = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
      if (updatedDelta !== 0) return updatedDelta;

      return left.name.localeCompare(right.name);
    });
  }

  return grouped;
}
