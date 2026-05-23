import type { KanvasModel } from "@/features/kanvas/types";

type ProviderLike = Pick<KanvasModel, "id"> &
  Partial<Pick<KanvasModel, "name" | "provider" | "providerLabel" | "endpointId" | "defaultRank">>;

export function normalizeKanvasProviderKey(provider?: string | null): string {
  const normalized = (provider ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (["fal", "fal.ai", "fal-ai", "fal_ai"].includes(normalized)) return "fal-ai";
  if (["gmi", "gmi-cloud", "gmi_cloud"].includes(normalized)) return "gmi-cloud";
  return normalized;
}

export function getKanvasModelProvider(model: ProviderLike | null | undefined): string {
  if (!model) return "other";
  const provider = normalizeKanvasProviderKey(model.provider);
  if (provider) return provider;

  const providerLabel = normalizeKanvasProviderKey(model.providerLabel);
  if (providerLabel) return providerLabel;

  const endpointId = model.endpointId?.toLowerCase() ?? "";
  const id = model.id.toLowerCase();
  if (id.startsWith("fal-ai/") || endpointId.startsWith("fal-ai/")) return "fal-ai";
  if (id.startsWith("gmi/")) return "gmi-cloud";
  return "other";
}

export function isFalKanvasModel(model: ProviderLike | null | undefined): boolean {
  return getKanvasModelProvider(model) === "fal-ai";
}

export function isGmiKanvasModel(model: ProviderLike | null | undefined): boolean {
  return getKanvasModelProvider(model) === "gmi-cloud";
}

export function sortKanvasModelsFalFirst<T extends ProviderLike>(models: T[]): T[] {
  return [...models].sort((left, right) => {
    const leftFal = isFalKanvasModel(left) ? 0 : 1;
    const rightFal = isFalKanvasModel(right) ? 0 : 1;
    if (leftFal !== rightFal) return leftFal - rightFal;

    const leftRank = typeof left.defaultRank === "number" ? left.defaultRank : Number.MAX_SAFE_INTEGER;
    const rightRank = typeof right.defaultRank === "number" ? right.defaultRank : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;

    return (left.name ?? left.id).localeCompare(right.name ?? right.id);
  });
}
