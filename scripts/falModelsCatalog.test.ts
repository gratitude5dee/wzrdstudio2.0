import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFalCatalogRows,
  parseFalModelsMarkdown,
} from "./falModelsCatalog";

const currentDir = dirname(fileURLToPath(import.meta.url));
const modelsMarkdown = readFileSync(resolve(currentDir, "../../models.md"), "utf8");
const parsedModels = parseFalModelsMarkdown(modelsMarkdown);
const rows = buildFalCatalogRows(parsedModels);
const rowsById = new Map(rows.map((row) => [row.id, row]));

describe("fal models.md catalog parser", () => {
  it("parses the full exported catalog", () => {
    expect(parsedModels).toHaveLength(1330);
    expect(rows).toHaveLength(1330);
  });

  it.each([
    ["fal-ai/nano-banana-2", "image", "text-to-image", ["prompt", "num_images"]],
    ["fal-ai/nano-banana-2/edit", "image", "image-to-image", ["prompt", "image_urls"]],
    ["fal-ai/kling-video/o3/standard/text-to-video", "video", "text-to-video", ["prompt"]],
    ["fal-ai/kling-video/o3/standard/image-to-video", "video", "image-to-video", ["prompt", "image_url"]],
    ["fal-ai/elevenlabs/tts/turbo-v2.5", "audio", "text-to-speech", ["text"]],
    ["openai/gpt-image-2", "image", "text-to-image", ["prompt"]],
    ["fal-ai/trellis/multi", "3d", "image-to-3d", ["image_url"]],
  ])("maps %s into a usable catalog row", (endpointId, mediaType, workflowType, payloadKeys) => {
    const row = rowsById.get(endpointId);
    expect(row).toBeTruthy();
    expect(row?.endpointId).toBe(endpointId);
    expect(row?.provider).toBe("fal-ai");
    expect(row?.mediaType).toBe(mediaType);
    expect(row?.workflowType).toBe(workflowType);
    expect(row?.modelUrl).toContain(endpointId);
    for (const key of payloadKeys) {
      expect(row?.payloadKeys).toContain(key);
    }
  });

  it("keeps Fal runtime provider separate from vendor family", () => {
    const openAi = rowsById.get("openai/gpt-image-2");
    const google = rowsById.get("fal-ai/nano-banana-2");
    expect(openAi?.provider).toBe("fal-ai");
    expect(openAi?.vendor).toBe("OpenAI");
    expect(openAi?.family).toBe("GPT Image");
    expect(google?.provider).toBe("fal-ai");
    expect(google?.vendor).toBe("Google");
    expect(google?.family).toBe("Nano Banana");
  });
});
