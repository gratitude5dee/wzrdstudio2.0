import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor project duplication", () => {
  it("duplicates from an existing project snapshot instead of creating a blank shell", () => {
    const source = readFileSync("supabase/functions/video-editor-project/index.ts", "utf8");

    expect(source).toContain("async function duplicateProject");
    expect(source).toContain("getProject(body.projectId)");
    expect(source).toContain("sourceType: \"editor_project\"");
    expect(source).toContain("cloneEditorSnapshotForProject");
    expect(source).toContain("video_editor_assets");
    expect(source).toContain("Duplicated from editor project");
  });

  it("exposes a frontend API wrapper for duplicating editor projects", () => {
    const source = readFileSync("src/lib/editor/api.ts", "utf8");

    expect(source).toContain("duplicateEditorProject");
    expect(source).toContain('action: "duplicate"');
    expect(source).toContain("projectId");
    expect(source).toContain("title");
  });

  it("wires duplicate/remix action into the editor shell", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("duplicateEditorProject");
    expect(source).toContain("duplicateProject");
    expect(source).toContain("Duplicate / remix");
    expect(source).toContain("navigate(appRoutes.editorProject");
  });
});

