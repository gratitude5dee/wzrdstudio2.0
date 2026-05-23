import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio text and lyrics inspector UI", () => {
  it("wires selected text/lyrics content and style controls to editor commands", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("updateClipTextCommand");
    expect(source).toContain("updateClipLyricsBlockCommand");
    expect(source).toContain("updateClipStyleCommand");
    expect(source).toContain("Text / lyrics inspector");
    expect(source).toContain("Selected text");
    expect(source).toContain("Selected lyric block");
    expect(source).toContain("Font size");
    expect(source).toContain("Text color");
    expect(source).toContain("Apply text changes");
  });
});

