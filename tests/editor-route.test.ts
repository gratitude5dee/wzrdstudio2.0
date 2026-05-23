import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor route shell", () => {
  it("registers /editor/new and /editor/:projectId routes", () => {
    const main = readFileSync("src/main.tsx", "utf8");
    const routes = readFileSync("src/lib/routes.ts", "utf8");

    expect(main).toContain("EditorCreateRedirectPage");
    expect(main).toContain("WorldStudioEditorPage");
    expect(main).toContain('path="/editor/new"');
    expect(main).toContain('path="/editor/:projectId"');
    expect(routes).toContain("editorNew");
    expect(routes).toContain("editorProject");
    expect(routes).toContain("editorFromTemplate");
    expect(routes).toContain("editorFromLibraryItem");
  });

  it("registers the optional render-status deep link route", () => {
    const main = readFileSync("src/main.tsx", "utf8");
    const routes = readFileSync("src/lib/routes.ts", "utf8");

    expect(main).toContain('path="/editor/:projectId/render/:renderJobId"');
    expect(routes).toContain("editorRenderJob");
    expect(routes).toContain("/render/${renderJobId}");
  });

  it("adds open-in-editor entrypoints from lyrics remix and library tiles", () => {
    const remix = readFileSync("src/pages/lyrics/RemixEditor.tsx", "utf8");
    const tile = readFileSync("src/components/library/LibraryTile.tsx", "utf8");

    expect(remix).toContain("createEditorProjectFromLyricTemplate");
    expect(remix).toContain("Open in Editor");
    expect(tile).toContain("createEditorProjectFromLibraryItem");
    expect(tile).toContain("Open in Editor");
  });
});
