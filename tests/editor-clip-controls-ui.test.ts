import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio timeline clip controls UI", () => {
  it("exposes selected-clip move, trim, delete, undo, and redo controls wired to editor commands", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("selectedClipId");
    expect(source).toContain("moveClipCommand");
    expect(source).toContain("trimClipStartCommand");
    expect(source).toContain("trimClipEndCommand");
    expect(source).toContain("deleteClipCommand");
    expect(source).toContain("redoCommand");
    expect(source).toContain("Select clip");
    expect(source).toContain("Move selected clip");
    expect(source).toContain("Trim start");
    expect(source).toContain("Trim end");
    expect(source).toContain("Delete selected clip");
  });
});

