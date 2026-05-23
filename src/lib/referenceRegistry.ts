import type { CharacterBlueprint, CharacterKind } from '@/types/character-creation';

export type RegistryReferenceAssetType = 'image' | 'video' | 'model';

export interface RegistryReferenceAsset {
  assetId?: string;
  url: string;
  type: RegistryReferenceAssetType;
  role: string;
}

export interface RegistryReference {
  blueprintId: string;
  slug: string;
  kind: CharacterKind;
  promptFragment: string;
  assetIds: string[];
  imageUrls: string[];
  roles: string[];
  gmiElementId?: string | null;
}

export interface ReferenceResolverWarning {
  slug: string;
  message: string;
}

export interface ReferenceResolutionResult {
  expandedPrompt: string;
  elementPrompt: string;
  elementIds: string[];
  referenceAssetIds: string[];
  referenceImageUrls: string[];
  references: RegistryReference[];
  referenceAssets: RegistryReferenceAsset[];
  warnings: ReferenceResolverWarning[];
}

export interface ReferenceRankingOptions {
  projectId?: string | null;
  includePinned?: boolean;
}

function normalizeTagValue(tag: string): string {
  return tag
    .trim()
    .replace(/^[@#]+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeReferenceTags(tags: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawTag of tags ?? []) {
    const tag = normalizeTagValue(rawTag);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }

  return normalized;
}

function blueprintProjectRank(blueprint: Pick<CharacterBlueprint, 'projectId' | 'isFavorite'>, options: ReferenceRankingOptions): number {
  if (options.projectId && blueprint.projectId === options.projectId) {
    return 0;
  }
  if (options.includePinned !== false && blueprint.isFavorite) {
    return 1;
  }
  if (!blueprint.projectId) {
    return 2;
  }
  return 3;
}

export function sortReferenceBlueprints<T extends {
  projectId?: string | null;
  isFavorite?: boolean;
  usageCount?: number;
  updatedAt?: string;
  name: string;
}>(blueprints: T[], options: ReferenceRankingOptions = {}): T[] {
  return [...blueprints].sort((left, right) => {
    const projectDelta =
      blueprintProjectRank(left as unknown as CharacterBlueprint, options) -
      blueprintProjectRank(right as unknown as CharacterBlueprint, options);
    if (projectDelta !== 0) return projectDelta;

    const pinnedDelta = Number(Boolean(right.isFavorite)) - Number(Boolean(left.isFavorite));
    if (pinnedDelta !== 0) return pinnedDelta;

    const usageDelta = (right.usageCount ?? 0) - (left.usageCount ?? 0);
    if (usageDelta !== 0) return usageDelta;

    const updatedDelta = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
    if (updatedDelta !== 0) return updatedDelta;

    return left.name.localeCompare(right.name);
  });
}

function inferReferenceAssetType(url: string): RegistryReferenceAssetType {
  const path = url.split('?')[0]?.toLowerCase() ?? '';
  if (/\.(glb|gltf|obj|fbx|usdz)$/.test(path)) return 'model';
  if (/\.(mp4|mov|webm|m4v)$/.test(path)) return 'video';
  return 'image';
}

function referenceAssetsForBlueprint(blueprint: CharacterBlueprint): RegistryReferenceAsset[] {
  if (blueprint.referenceAssets?.length) {
    return blueprint.referenceAssets;
  }

  return blueprint.referenceImageUrls.map((url, index) => ({
    assetId: blueprint.referenceAssetIds[index],
    url,
    type: inferReferenceAssetType(url),
    role: index === 0 ? 'primary' : 'reference',
  }));
}

function uniquePush<T>(list: T[], item: T): void {
  if (!list.includes(item)) {
    list.push(item);
  }
}

export function resolveReferenceMentionsFromBlueprints(
  prompt: string,
  blueprints: CharacterBlueprint[],
  options: ReferenceRankingOptions = {},
): ReferenceResolutionResult {
  const rankedBlueprints = sortReferenceBlueprints(blueprints, options);
  const blueprintsBySlug = new Map<string, CharacterBlueprint>();

  for (const blueprint of rankedBlueprints) {
    if (!blueprintsBySlug.has(blueprint.slug)) {
      blueprintsBySlug.set(blueprint.slug, blueprint);
    }
  }

  let expandedPrompt = prompt;
  let elementPrompt = prompt;
  const elementIds: string[] = [];
  const referenceAssetIds: string[] = [];
  const referenceImageUrls: string[] = [];
  const references: RegistryReference[] = [];
  const referenceAssets: RegistryReferenceAsset[] = [];
  const warnings: ReferenceResolverWarning[] = [];
  const elementIndexById = new Map<string, number>();
  const matchedBlueprintIds = new Set<string>();

  for (const match of prompt.matchAll(/@([\w-]+)/g)) {
    const slug = match[1].toLowerCase();
    const blueprint = blueprintsBySlug.get(slug);

    if (!blueprint) {
      warnings.push({
        slug,
        message: `Unknown reference @${slug}.`,
      });
      continue;
    }

    const promptFragment = blueprint.promptFragment || blueprint.name;
    const replacement = `[${blueprint.name}: ${promptFragment}]`;
    expandedPrompt = expandedPrompt.replace(`@${slug}`, replacement);

    if (blueprint.gmiElementId) {
      let tokenIndex = elementIndexById.get(blueprint.gmiElementId);
      if (!tokenIndex) {
        elementIds.push(blueprint.gmiElementId);
        tokenIndex = elementIds.length;
        elementIndexById.set(blueprint.gmiElementId, tokenIndex);
      }
      elementPrompt = elementPrompt.replace(`@${slug}`, `<<<element_${tokenIndex}>>>`);
    } else {
      elementPrompt = elementPrompt.replace(`@${slug}`, replacement);
    }

    for (const assetId of blueprint.referenceAssetIds) {
      uniquePush(referenceAssetIds, assetId);
    }
    for (const imageUrl of blueprint.referenceImageUrls) {
      uniquePush(referenceImageUrls, imageUrl);
    }

    const blueprintReferenceAssets = referenceAssetsForBlueprint(blueprint);
    for (const asset of blueprintReferenceAssets) {
      if (!referenceAssets.some((existing) => existing.url === asset.url && existing.assetId === asset.assetId)) {
        referenceAssets.push(asset);
      }
    }

    if (!matchedBlueprintIds.has(blueprint.id)) {
      references.push({
        blueprintId: blueprint.id,
        slug: blueprint.slug,
        kind: blueprint.kind,
        promptFragment,
        assetIds: blueprint.referenceAssetIds,
        imageUrls: blueprint.referenceImageUrls,
        roles: Array.from(new Set(blueprintReferenceAssets.map((asset) => asset.role))),
        gmiElementId: blueprint.gmiElementId ?? null,
      });
      matchedBlueprintIds.add(blueprint.id);
    }
  }

  return {
    expandedPrompt,
    elementPrompt,
    elementIds,
    referenceAssetIds,
    referenceImageUrls,
    references,
    referenceAssets,
    warnings,
  };
}
