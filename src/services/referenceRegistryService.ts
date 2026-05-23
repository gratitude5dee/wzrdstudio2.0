import { listBlueprints } from '@/services/characterBlueprintService';
import {
  resolveReferenceMentionsFromBlueprints,
  sortReferenceBlueprints,
  type ReferenceRankingOptions,
  type ReferenceResolutionResult,
} from '@/lib/referenceRegistry';

export async function resolveReferenceMentions(
  prompt: string,
  options: ReferenceRankingOptions = {},
): Promise<ReferenceResolutionResult> {
  const blueprints = await listBlueprints();
  const candidates = sortReferenceBlueprints(blueprints, options).filter((blueprint) => {
    if (options.projectId && blueprint.projectId === options.projectId) return true;
    if (options.includePinned !== false && blueprint.isFavorite) return true;
    return !blueprint.projectId;
  });

  return resolveReferenceMentionsFromBlueprints(prompt, candidates, options);
}
