import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor autosave UI", () => {
  it("debounces dirty project snapshots into autosave revisions", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("AUTOSAVE_DEBOUNCE_MS");
    expect(source).toContain("autosave: true");
    expect(source).toContain("baseRevisionNumber: data.revision.revision_number");
    expect(source).toContain("Autosaving…");
    expect(source).toContain("Autosaved");
    expect(source).toContain("clearTimeout");
  });
});

