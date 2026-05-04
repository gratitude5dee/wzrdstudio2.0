import { describe, expect, it } from "vitest";

import {
  getKanvasModelProvider,
  isFalKanvasModel,
  sortKanvasModelsFalFirst,
} from "@/features/kanvas/modelProvider";
import type { KanvasModel } from "@/features/kanvas/types";

const baseModel = (overrides: Partial<KanvasModel> & Pick<KanvasModel, "id" | "name">): KanvasModel => ({
  id: overrides.id,
  name: overrides.name,
  description: "",
  studio: "image",
  mode: "text-to-image",
  mediaType: "image",
  workflowType: "text-to-image",
  uiGroup: "generation",
  credits: 1,
  requiresAssets: [],
  supportsPrompt: true,
  controls: [],
  defaults: {},
  aliases: [],
  ...overrides,
});

describe("Kanvas model provider helpers", () => {
  it("normalizes Fal provider aliases and partner endpoint ids", () => {
    expect(getKanvasModelProvider(baseModel({ id: "partner/model", name: "Partner", provider: "fal.ai" }))).toBe("fal-ai");
    expect(getKanvasModelProvider(baseModel({ id: "veed/fabric-1.0", name: "Veed", endpointId: "fal-ai/veed/fabric" }))).toBe("fal-ai");
    expect(isFalKanvasModel(baseModel({ id: "fal-ai/nano-banana-pro", name: "Fal" }))).toBe(true);
  });

  it("sorts Fal models before secondary GMI options", () => {
    const sorted = sortKanvasModelsFalFirst([
      baseModel({ id: "gmi/seedream", name: "GMI" }),
      baseModel({ id: "fal-ai/nano-banana-pro", name: "Fal B", provider: "fal-ai", defaultRank: 20 }),
      baseModel({ id: "fal-ai/fast", name: "Fal A", provider: "fal-ai", defaultRank: 10 }),
    ]);

    expect(sorted.map((model) => model.id)).toEqual([
      "fal-ai/fast",
      "fal-ai/nano-banana-pro",
      "gmi/seedream",
    ]);
  });
});
