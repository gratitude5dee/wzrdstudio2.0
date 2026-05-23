import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library/types";
import type { LyricTemplate } from "@/lib/lyrics/types";
import { buildBlankEditorSnapshot, editorSnapshotFromLibraryItem, editorSnapshotFromLyricTemplate, validateEditorSnapshot } from "@/lib/editor/importers";

describe("editor importers", () => {
  it("builds a blank valid 9:16 editor snapshot", () => {
    const snapshot = buildBlankEditorSnapshot({ projectId: "project-1", title: "Blank", durationMs: 15000 });

    expect(snapshot.project).toMatchObject({ id: "project-1", title: "Blank", aspectRatio: "9:16", width: 1080, height: 1920, durationMs: 15000 });
    expect(snapshot.tracks.map((track) => track.kind)).toEqual(["audio", "video", "lyrics", "markers"]);
    expect(validateEditorSnapshot(snapshot).valid).toBe(true);
  });

  it("imports a lyric template as audio, lyrics, and cut markers", () => {
    const template = {
      id: "template-1",
      title: "Hook",
      selection_duration_ms: 15000,
      render_defaults: { lyricStyleId: "neon", scale: 0.7, aspectRatio: "9:16" },
      trimmed_audio_asset_id: "project-asset-1",
      source_audio_asset_id: "source-asset-1",
      cut_markers: [3000, 9000],
      lyric_blocks: [
        {
          id: "block-1",
          label: "Line 1",
          startTime: 1,
          endTime: 2,
          words: [{ id: "word-1", text: "shine", startTime: 1, endTime: 2 }],
        },
      ],
    } as LyricTemplate;

    const snapshot = editorSnapshotFromLyricTemplate(template, { projectId: "project-1" });

    expect(snapshot.project.durationMs).toBe(15000);
    expect(snapshot.assets).toEqual(expect.arrayContaining([expect.objectContaining({ id: "project-asset-1", kind: "audio" })]));
    expect(snapshot.clips).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "audio" }), expect.objectContaining({ kind: "lyrics" })]));
    expect(snapshot.markers).toEqual([
      { id: "cut-3000", timeMs: 3000, kind: "cut", label: "Cut 1" },
      { id: "cut-9000", timeMs: 9000, kind: "cut", label: "Cut 2" },
    ]);
    expect(snapshot.clips.find((clip) => clip.kind === "lyrics")?.lyrics?.blocks[0].words[0]).toMatchObject({ text: "shine", startMs: 1000, endMs: 2000 });
    expect(validateEditorSnapshot(snapshot).valid).toBe(true);
  });

  it("imports a finalized library item as a video clip with provenance markers", () => {
    const item = {
      id: "library-1",
      account_id: "account-1",
      audio_clip_id: "audio-1",
      final_asset_id: "asset-final",
      library_index: 0,
      status: "ready",
      duration_sec: 15,
      thumbnail_url: "https://example.test/thumb.jpg",
      default_caption: "sound on",
      default_hashtags: ["#fyp"],
      segments: [
        { provider: "pexels", durationSec: 5, url: "https://example.test/a.mp4" },
        { provider: "seedance", durationSec: 10, url: "https://example.test/b.mp4" },
      ],
      provenance: [{ provider: "pexels" }],
      media: { id: "asset-final", public_url: "https://example.test/final.mp4", duration_sec: 15, width: 1080, height: 1920 },
      batch_id: null,
      generation_item_id: null,
      perceptual_hash: null,
      reused_flags: {},
      metadata: {},
      created_at: "now",
      updated_at: "now",
    } as LibraryItem;

    const snapshot = editorSnapshotFromLibraryItem(item, { projectId: "project-1" });

    expect(snapshot.assets[0]).toMatchObject({ id: "asset-final", kind: "video", publicUrl: "https://example.test/final.mp4" });
    expect(snapshot.clips[0]).toMatchObject({ kind: "video", assetId: "asset-final", durationMs: 15000 });
    expect(snapshot.markers.map((marker) => marker.timeMs)).toEqual([5000, 15000]);
    expect(validateEditorSnapshot(snapshot).valid).toBe(true);
  });
});

