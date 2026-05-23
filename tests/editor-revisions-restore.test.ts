import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor revision history and restore", () => {
  it("exposes list and restore actions from the project edge function", () => {
    const source = readFileSync("supabase/functions/video-editor-project/index.ts", "utf8");

    expect(source).toContain('"listRevisions"');
    expect(source).toContain('"restoreRevision"');
    expect(source).toContain("async function listRevisions");
    expect(source).toContain("async function restoreRevision");
    expect(source).toContain("Restored from revision #");
    expect(source).toContain("current_revision_id: restoredRevision.data.id");
    expect(source).toContain(".eq(\"project_id\", body.projectId)");
    expect(source).toContain(".eq(\"id\", body.revisionId)");
  });

  it("adds frontend API wrappers for listing revisions and restoring a prior revision", () => {
    const source = readFileSync("src/lib/editor/api.ts", "utf8");

    expect(source).toContain("EditorRevisionListResponse");
    expect(source).toContain("listEditorRevisions");
    expect(source).toContain("restoreEditorRevision");
    expect(source).toContain('action: "listRevisions"');
    expect(source).toContain('action: "restoreRevision"');
  });

  it("renders a revision history panel with restore controls in the editor shell", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("Revision history");
    expect(source).toContain("loadRevisionHistory");
    expect(source).toContain("restoreRevision");
    expect(source).toContain("Restore revision");
    expect(source).toContain("Restored revision #");
    expect(source).toContain("revision.autosave ? \"Autosave\" : \"Manual save\"");
  });
});

