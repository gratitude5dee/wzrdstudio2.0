import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("video-editor-asset edge function foundation", () => {
  it("implements media/library/source import, list, and delete actions", () => {
    const source = readFileSync("supabase/functions/video-editor-asset/index.ts", "utf8");

    expect(source).toContain('import { errorEnvelope, okEnvelope }');
    expect(source).toContain('case "listProjectAssets"');
    expect(source).toContain('case "importMediaAsset"');
    expect(source).toContain('case "importLibraryItem"');
    expect(source).toContain('case "importSourceCandidate"');
    expect(source).toContain('case "deleteAsset"');
    expect(source).toContain("video_editor_assets");
    expect(source).toContain("media_assets");
    expect(source).toContain("video_library_items");
    expect(source).toContain("source_candidates");
    expect(source).toContain("EDITOR_ASSET_NOT_FOUND");
    expect(source).toContain("EDITOR_ASSET_UNSUPPORTED");
  });

  it("prevents deleting editor assets still referenced by the latest project snapshot", () => {
    const source = readFileSync("supabase/functions/video-editor-asset/index.ts", "utf8");

    expect(source).toContain("EDITOR_ASSET_IN_USE");
    expect(source).toContain("loadLatestProjectSnapshot");
    expect(source).toContain("snapshotUsesAsset");
    expect(source).toContain("body.forceDelete");
    expect(source).toContain("deleteAsset(body)");
  });

  it("adds frontend asset API helpers", () => {
    const source = readFileSync("src/lib/editor/assetApi.ts", "utf8");

    expect(source).toContain('"video-editor-asset"');
    expect(source).toContain("listEditorAssets");
    expect(source).toContain("importEditorMediaAsset");
    expect(source).toContain("importEditorLibraryItem");
    expect(source).toContain("importEditorSourceCandidate");
    expect(source).toContain("deleteEditorAsset");
    expect(source).toContain("projectId: string");
    expect(source).toContain("forceDelete?: boolean");
  });
});

