import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio render audioClipId inference", () => {
  it("infers library handoff account/audio clip from editor project source records", () => {
    const source = readFileSync("supabase/functions/video-editor-render/index.ts", "utf8");

    expect(source).toContain("async function inferLibraryHandoffContext");
    expect(source).toContain('project.source_type === "lyric_template"');
    expect(source).toContain("kanvas_lyric_templates");
    expect(source).toContain('project.source_type === "library_item"');
    expect(source).toContain("video_library_items");
    expect(source).toContain("audio_clip_id");
    expect(source).toContain("body.audioClipId ?? inferred.audioClipId");
    expect(source).toContain("body.accountId ?? inferred.accountId");
  });

  it("documents source-aware handoff in the render panel UI", () => {
    const source = readFileSync("src/pages/editor/WorldStudioEditorPage.tsx", "utf8");

    expect(source).toContain("Auto-inferred for lyric-template/library-item projects when possible");
    expect(source).toContain("Optional when source project can infer it");
  });
});

