import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("video-editor-project edge function foundation", () => {
  it("implements createBlank, get, saveRevision, and source import actions on the shared envelope", () => {
    const source = readFileSync("supabase/functions/video-editor-project/index.ts", "utf8");

    expect(source).toContain('import { errorEnvelope, okEnvelope }');
    expect(source).toContain('case "createBlank"');
    expect(source).toContain('case "get"');
    expect(source).toContain('case "saveRevision"');
    expect(source).toContain('case "createFromLyricTemplate"');
    expect(source).toContain('case "createFromLibraryItem"');
    expect(source).toContain("video_editor_projects");
    expect(source).toContain("video_editor_revisions");
    expect(source).toContain("video_editor_assets");
    expect(source).toContain("EDITOR_INVALID_ACTION");
    expect(source).toContain("EDITOR_INVALID_SNAPSHOT");
    expect(source).toContain("EDITOR_SNAPSHOT_TOO_LARGE");
  });

  it("enforces spec-level snapshot invariants before saving revisions", () => {
    const source = readFileSync("supabase/functions/video-editor-project/index.ts", "utf8");

    expect(source).toContain("assertUniqueIds");
    expect(source).toContain("Every clip must reference an existing track");
    expect(source).toContain("Every clip assetId must reference an existing asset");
    expect(source).toContain("Track locked/muted/hidden must be booleans");
    expect(source).toContain("Clip timing exceeds project duration");
    expect(source).toContain("Render settings dimensions must match project dimensions");
    expect(source).toContain("validateEditorSnapshot(body.snapshot)");
  });

  it("adds a frontend API wrapper for editor project actions", () => {
    const source = readFileSync("src/lib/editor/api.ts", "utf8");

    expect(source).toContain('invokeEdgeFunction');
    expect(source).toContain('"video-editor-project"');
    expect(source).toContain("createBlankEditorProject");
    expect(source).toContain("saveEditorRevision");
    expect(source).toContain("getEditorProject");
  });
});

