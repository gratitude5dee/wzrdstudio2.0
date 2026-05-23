import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorldStudio editor persistence migration", () => {
  it("creates the editor project, revision, asset, render job, and event tables with RLS", () => {
    const source = readFileSync("supabase/migrations/20260522230000_worldstudio_editor_parity.sql", "utf8");

    for (const table of [
      "video_editor_projects",
      "video_editor_revisions",
      "video_editor_assets",
      "video_editor_render_jobs",
      "video_editor_project_events",
    ]) {
      expect(source).toContain(`create table if not exists public.${table}`);
      expect(source).toContain(`alter table public.${table} enable row level security`);
    }

    expect(source).toContain("source_type in ('blank','lyric_template','generation_item','library_item','editor_project')");
    expect(source).toContain("status in ('queued','rendering','succeeded','failed','cancelled')");
    expect(source).toContain("provider in ('fal_ffmpeg','remotion','mock')");
    expect(source).toContain("video_editor_projects_current_revision_fk");
    expect(source).toContain("alter publication supabase_realtime add table public.video_editor_projects");
    expect(source).toContain("alter publication supabase_realtime add table public.video_editor_render_jobs");
  });
});

