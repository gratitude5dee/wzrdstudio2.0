import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio media bin add-to-timeline UI", () => {
  it("wires Add to timeline controls from media bin assets into editor commands", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("addAssetToTimelineCommand");
    expect(source).toContain("addAssetToTimeline");
    expect(source).toContain("Add to timeline");
    expect(source).toContain("asset.id");
  });
});

