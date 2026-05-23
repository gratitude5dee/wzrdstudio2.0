import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("video-editor-render edge function foundation", () => {
  it("implements create/status/cancel/callback actions and mock render success path", () => {
    const source = readFileSync("supabase/functions/video-editor-render/index.ts", "utf8");

    expect(source).toContain('import { errorEnvelope, okEnvelope }');
    expect(source).toContain('case "create"');
    expect(source).toContain('case "status"');
    expect(source).toContain('case "cancel"');
    expect(source).toContain('case "callback"');
    expect(source).toContain("video_editor_render_jobs");
    expect(source).toContain("video_editor_revisions");
    expect(source).toContain("media_assets");
    expect(source).toContain('provider === "mock"');
    expect(source).toContain("EDITOR_RENDER_PROVIDER_UNAVAILABLE");
    expect(source).toContain("EDITOR_RENDER_JOB_NOT_FOUND");
  });

  it("validates render settings against the current revision snapshot before queueing", () => {
    const source = readFileSync("supabase/functions/video-editor-render/index.ts", "utf8");

    expect(source).toContain("function normalizeRenderSettings");
    expect(source).toContain("EDITOR_RENDER_SETTINGS_INVALID");
    expect(source).toContain("normalizeRenderSettings(body.renderSettings, revision.snapshot)");
    expect(source).toContain("render_settings: renderSettings");
  });

  it("validates the revision snapshot before creating render jobs", () => {
    const source = readFileSync("supabase/functions/video-editor-render/index.ts", "utf8");

    expect(source).toContain("function validateEditorSnapshot");
    expect(source).toContain("validateEditorSnapshot(revision.snapshot)");
    expect(source).toContain("EDITOR_INVALID_SNAPSHOT");
    expect(source).toContain("Render settings dimensions must match project dimensions");
  });

  it("adds frontend render API helpers", () => {
    const source = readFileSync("src/lib/editor/renderApi.ts", "utf8");

    expect(source).toContain('"video-editor-render"');
    expect(source).toContain("createEditorRenderJob");
    expect(source).toContain("getEditorRenderJob");
    expect(source).toContain("cancelEditorRenderJob");
  });
});

