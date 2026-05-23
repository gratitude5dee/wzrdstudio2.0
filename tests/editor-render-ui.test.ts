import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor render UI", () => {
  it("wires a render panel into the editor page", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("createEditorRenderJob");
    expect(source).toContain("renderJob");
    expect(source).toContain("Render draft");
    expect(source).toContain("Mock render");
    expect(source).toContain("output_url");
  });

  it("validates snapshots client-side before save and render actions", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("validateEditorSnapshot");
    expect(source).toContain("function validateSnapshotForAction");
    expect(source).toContain('validateSnapshotForAction("save")');
    expect(source).toContain('validateSnapshotForAction("render")');
    expect(source).toContain("Cannot save: ");
    expect(source).toContain("Cannot render: ");
  });

  it("exposes editable render settings and sends them with the render payload", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("Render settings");
    expect(source).toContain("Render quality");
    expect(source).toContain("Frames per second");
    expect(source).toContain("Include captions");
    expect(source).toContain("Apply render settings");
    expect(source).toContain("updateRenderSettingsCommand");
    expect(source).toContain("renderSettingsDraft");
    expect(source).toContain("renderSettings: state?.snapshot.renderSettings");
  });

  it("shows a continuous project health panel and disables save/render while invalid", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("projectHealth");
    expect(source).toContain("Project health");
    expect(source).toContain("Validation: ready");
    expect(source).toContain("Validation issue");
    expect(source).toContain("Render readiness");
    expect(source).toContain("Save readiness");
    expect(source).toContain("Disabled until snapshot validation passes");
    expect(source).toContain("disabled={saving || !projectHealth.isValid}");
    expect(source).toContain("disabled={rendering || !projectHealth.isValid}");
  });
});
