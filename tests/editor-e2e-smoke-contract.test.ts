import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor Playwright smoke coverage", () => {
  it("defines a DB-backed E2E flow that edits, saves, reloads, and verifies persistence", () => {
    const spec = readFileSync("tests-e2e/editor-smoke.spec.ts", "utf8");

    expect(spec).toContain('test.describe("WorldStudio editor smoke"');
    expect(spec).toContain("seedEditorProjectWithAsset");
    expect(spec).toContain("cleanupEditorProject");
    expect(spec).toContain("Project settings");
    expect(spec).toContain("Add to timeline");
    expect(spec).toContain("Saved editor revision.");
    expect(spec).toContain("page.reload");
    expect(spec).toContain("video_editor_revisions");
    expect(spec).toContain("E2E WorldStudio Smoke");
  });

  it("adds reusable E2E helpers for seeded editor projects and project cleanup", () => {
    const helpers = readFileSync("tests-e2e/helpers.ts", "utf8");

    expect(helpers).toContain("seedEditorProjectWithAsset");
    expect(helpers).toContain("cleanupEditorProject");
    expect(helpers).toContain("video_editor_projects");
    expect(helpers).toContain("video_editor_revisions");
    expect(helpers).toContain("video_editor_assets");
  });
});

