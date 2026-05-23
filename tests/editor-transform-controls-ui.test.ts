import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor transform controls UI", () => {
  it("wires selected visual clip transform controls through updateClipTransformCommand", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("Transform controls");
    expect(source).toContain("transformDraft");
    expect(source).toContain("applyTransformChanges");
    expect(source).toContain("resetSelectedTransform");
    expect(source).toContain("updateClipTransformCommand");
    expect(source).toContain("Position X");
    expect(source).toContain("Position Y");
    expect(source).toContain("Scale");
    expect(source).toContain("Rotation");
    expect(source).toContain("Opacity");
    expect(source).toContain("Reset transform");
  });
});

