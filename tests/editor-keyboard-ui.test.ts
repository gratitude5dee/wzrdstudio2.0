import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor keyboard shortcut UI", () => {
  it("registers keyboard shortcuts for transport and timeline edit actions", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("editorShortcutForKeyEvent");
    expect(source).toContain("window.addEventListener(\"keydown\"");
    expect(source).toContain("togglePlayback");
    expect(source).toContain("isPlaying");
    expect(source).toContain("deleteSelectedClip");
    expect(source).toContain("splitSelectedClip");
    expect(source).toContain("moveSelectedClip(-100");
    expect(source).toContain("moveSelectedClip(100");
    expect(source).toContain("setPlayheadMs");
    expect(source).toContain("Keyboard shortcuts");
  });
});

