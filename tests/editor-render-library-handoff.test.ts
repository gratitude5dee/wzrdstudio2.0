import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio render output library handoff", () => {
  it("adds an Edge Function action that converts successful render jobs into video library items", () => {
    const source = readFileSync("supabase/functions/video-editor-render/index.ts", "utf8");

    expect(source).toContain('action?: "create" | "status" | "cancel" | "callback" | "addToLibrary"');
    expect(source).toContain("async function addRenderToLibrary");
    expect(source).toContain("EDITOR_RENDER_NOT_SUCCEEDED");
    expect(source).toContain("EDITOR_RENDER_OUTPUT_ASSET_REQUIRED");
    expect(source).toContain("video_library_items");
    expect(source).toContain("output_library_item_id");
    expect(source).toContain("worldstudio_render_job_id");
  });

  it("exposes a frontend API wrapper for render-to-library handoff", () => {
    const source = readFileSync("src/lib/editor/renderApi.ts", "utf8");

    expect(source).toContain("addEditorRenderToLibrary");
    expect(source).toContain('action: "addToLibrary"');
    expect(source).toContain("renderJobId");
    expect(source).toContain("audioClipId");
  });

  it("wires Add to Library and Schedule actions into the render panel", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("addEditorRenderToLibrary");
    expect(source).toContain("addRenderToLibrary");
    expect(source).toContain("Add to Library");
    expect(source).toContain("Schedule in Studio");
    expect(source).toContain('mode=studio&view=calendar');
  });
});

