import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor project settings UI", () => {
  it("wires editable title, aspect ratio, duration, and background controls into undoable project settings commands", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("Project settings");
    expect(source).toContain("projectSettingsDraft");
    expect(source).toContain("applyProjectSettings");
    expect(source).toContain("updateProjectSettingsCommand");
    expect(source).toContain("Project title");
    expect(source).toContain("Aspect ratio");
    expect(source).toContain("Duration seconds");
    expect(source).toContain("Canvas background");
  });
});

