import { describe, expect, it } from "vitest";
import type { EditorAssetRef, EditorProjectSnapshot } from "@/lib/editor/schema";
import { addAssetToTimelineCommand } from "@/lib/editor/commands";
import { createEditorState, editorReducer } from "@/lib/editor/store";

function snapshot(): EditorProjectSnapshot {
  return {
    schemaVersion: 1,
    project: { id: "project-1", title: "Timeline", aspectRatio: "9:16", width: 1080, height: 1920, fps: 30, durationMs: 10000, background: "#000" },
    tracks: [
      { id: "audio-track", name: "Audio", kind: "audio", order: 0, locked: false, muted: false, hidden: false },
      { id: "video-track", name: "Video", kind: "video", order: 1, locked: false, muted: false, hidden: false },
      { id: "lyrics-track", name: "Lyrics", kind: "lyrics", order: 2, locked: false, muted: false, hidden: false },
    ],
    clips: [],
    assets: [],
    markers: [],
    renderSettings: { format: "mp4", codec: "h264", audioCodec: "aac", width: 1080, height: 1920, fps: 30, includeCaptions: true, quality: "standard" },
  };
}

const videoAsset: EditorAssetRef = {
  id: "asset-video",
  kind: "video",
  name: "Imported video",
  publicUrl: "https://example.test/video.mp4",
  durationMs: 4000,
};

const audioAsset: EditorAssetRef = {
  id: "asset-audio",
  kind: "audio",
  name: "Imported audio",
  publicUrl: "https://example.test/audio.wav",
  durationMs: 6000,
};

describe("editor asset-to-timeline commands", () => {
  it("adds a video asset to the compatible video track at the requested playhead", () => {
    let state = createEditorState({ ...snapshot(), assets: [videoAsset] });

    state = editorReducer(state, addAssetToTimelineCommand({ assetId: "asset-video", clipId: "clip-video", startMs: 2500 }));

    expect(state.snapshot.clips).toEqual([
      expect.objectContaining({
        id: "clip-video",
        trackId: "video-track",
        assetId: "asset-video",
        kind: "video",
        startMs: 2500,
        durationMs: 4000,
        sourceStartMs: 0,
        sourceEndMs: 4000,
      }),
    ]);
  });

  it("adds an audio asset to the audio track and clamps duration to project bounds", () => {
    let state = createEditorState({ ...snapshot(), assets: [audioAsset] });

    state = editorReducer(state, addAssetToTimelineCommand({ assetId: "asset-audio", clipId: "clip-audio", startMs: 8000 }));

    expect(state.snapshot.clips[0]).toMatchObject({
      id: "clip-audio",
      trackId: "audio-track",
      kind: "audio",
      durationMs: 2000,
      sourceEndMs: 2000,
    });
  });

  it("throws for unsupported or missing assets instead of creating broken clips", () => {
    const state = createEditorState(snapshot());

    expect(() => editorReducer(state, addAssetToTimelineCommand({ assetId: "missing", clipId: "clip-missing", startMs: 0 }))).toThrow(/asset missing/i);
  });
});

