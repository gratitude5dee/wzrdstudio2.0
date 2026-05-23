import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio media bin UI", () => {
  it("wires editor asset listing and imports into the editor page", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("listEditorAssets");
    expect(source).toContain("importEditorMediaAsset");
    expect(source).toContain("Media bin");
    expect(source).toContain("Import media asset");
    expect(source).toContain("editorAssets");
    expect(source).toContain("mediaAssetId");
  });

  it("wires library item and source candidate imports into the Media bin", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("importEditorLibraryItem");
    expect(source).toContain("importEditorSourceCandidate");
    expect(source).toContain("libraryItemId");
    expect(source).toContain("sourceCandidateId");
    expect(source).toContain("Import library item");
    expect(source).toContain("Import source candidate");
    expect(source).toContain("Paste a libraryItemId before importing.");
    expect(source).toContain("Paste a sourceCandidateId before importing.");
    expect(source).toContain("Library item imported into Media bin.");
    expect(source).toContain("Source candidate imported into Media bin.");
  });

  it("exposes safe removal for unused Media bin assets", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("deleteEditorAsset");
    expect(source).toContain("removeEditorAsset");
    expect(source).toContain("assetIsUsedOnTimeline");
    expect(source).toContain("Remove unused asset");
    expect(source).toContain("Asset is used on timeline");
    expect(source).toContain("filter((item) => item.id !== asset.id)");
  });
});

