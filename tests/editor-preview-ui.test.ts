import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor media preview UI", () => {
  it("renders active video, image, and audio asset layers in the preview canvas", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("selectPreviewLayersAtTime");
    expect(source).toContain("previewLayers.visual.map");
    expect(source).toContain("<video");
    expect(source).toContain("<img");
    expect(source).toContain("previewLayers.audio.map");
    expect(source).toContain("<audio");
    expect(source).toContain("aria-label=\"Preview audio layer\"");
  });
});

