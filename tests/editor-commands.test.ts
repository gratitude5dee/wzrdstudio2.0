import { describe, expect, it } from "vitest";
import type { EditorClip, EditorProjectSnapshot } from "@/lib/editor/schema";
import { createEditorState, editorReducer } from "@/lib/editor/store";
import {
  addMarkerCommand,
  deleteMarkerCommand,
  deleteClipCommand,
  moveClipCommand,
  updateClipLyricsBlockCommand,
  updateClipTextCommand,
  splitClipCommand,
  trimClipEndCommand,
  trimClipStartCommand,
  undoCommand,
  redoCommand,
  updateClipStyleCommand,
  updateClipTransformCommand,
  updateProjectSettingsCommand,
  updateRenderSettingsCommand,
  updateTrackSettingsCommand,
} from "@/lib/editor/commands";
import { selectActiveClipsAtTime, selectLayerStackAtTime, selectTracksOrdered } from "@/lib/editor/selectors";

function clip(id: string, overrides: Partial<EditorClip> = {}): EditorClip {
  return {
    id,
    trackId: "video-track",
    assetId: "asset-video",
    kind: "video",
    startMs: 1000,
    durationMs: 3000,
    sourceStartMs: 0,
    sourceEndMs: 3000,
    zIndex: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    ...overrides,
  };
}

function snapshot(): EditorProjectSnapshot {
  return {
    schemaVersion: 1,
    project: { id: "project-1", title: "Test", aspectRatio: "9:16", width: 1080, height: 1920, fps: 30, durationMs: 10000, background: "#000000" },
    tracks: [
      { id: "audio-track", name: "Audio", kind: "audio", order: 0, locked: false, muted: false, hidden: false },
      { id: "video-track", name: "Video", kind: "video", order: 1, locked: false, muted: false, hidden: false },
      { id: "text-track", name: "Text", kind: "text", order: 2, locked: false, muted: false, hidden: false },
    ],
    clips: [clip("clip-a"), clip("clip-b", { id: "clip-b", trackId: "text-track", kind: "text", startMs: 2000, durationMs: 1000, zIndex: 5, text: { text: "hello" } })],
    assets: [{ id: "asset-video", kind: "video", name: "Video", durationMs: 3000 }],
    markers: [],
    renderSettings: { format: "mp4", codec: "h264", audioCodec: "aac", width: 1080, height: 1920, fps: 30, includeCaptions: true, quality: "standard" },
  };
}

describe("editor commands and selectors", () => {
  it("selects active clips and ordered layers at the playhead", () => {
    const state = createEditorState(snapshot());

    expect(selectTracksOrdered(state.snapshot).map((track) => track.id)).toEqual(["audio-track", "video-track", "text-track"]);
    expect(selectActiveClipsAtTime(state.snapshot, 2500).map((active) => active.id)).toEqual(["clip-a", "clip-b"]);
    expect(selectLayerStackAtTime(state.snapshot, 2500).map((active) => active.id)).toEqual(["clip-a", "clip-b"]);
  });

  it("moves, trims, splits, styles, and marks clips through undoable commands", () => {
    let state = createEditorState(snapshot());

    state = editorReducer(state, moveClipCommand("clip-a", { startMs: 1500, trackId: "video-track" }));
    expect(state.snapshot.clips.find((item) => item.id === "clip-a")?.startMs).toBe(1500);

    state = editorReducer(state, trimClipStartCommand("clip-a", 2000));
    expect(state.snapshot.clips.find((item) => item.id === "clip-a")).toMatchObject({ startMs: 2000, durationMs: 2500, sourceStartMs: 500 });

    state = editorReducer(state, trimClipEndCommand("clip-a", 4000));
    expect(state.snapshot.clips.find((item) => item.id === "clip-a")).toMatchObject({ startMs: 2000, durationMs: 2000, sourceEndMs: 2500 });

    state = editorReducer(state, splitClipCommand("clip-a", 3000, "clip-a-right"));
    expect(state.snapshot.clips.map((item) => item.id)).toContain("clip-a-right");

    state = editorReducer(state, updateClipStyleCommand("clip-b", { color: "#fff", preset: "bold-impact" }));
    expect(state.snapshot.clips.find((item) => item.id === "clip-b")?.style).toMatchObject({ color: "#fff", preset: "bold-impact" });

    state = editorReducer(state, addMarkerCommand({ id: "marker-1", timeMs: 3000, kind: "cut", label: "Hook" }));
    expect(state.snapshot.markers).toEqual([{ id: "marker-1", timeMs: 3000, kind: "cut", label: "Hook" }]);

    const withMarker = state;
    state = editorReducer(state, undoCommand());
    expect(state.snapshot.markers).toEqual([]);
    state = editorReducer(state, redoCommand());
    expect(state.snapshot).toEqual(withMarker.snapshot);
  });

  it("clamps moved clips to project bounds and deletes clips through undoable commands", () => {
    let state = createEditorState(snapshot());

    state = editorReducer(state, moveClipCommand("clip-a", { startMs: -500 }));
    expect(state.snapshot.clips.find((item) => item.id === "clip-a")?.startMs).toBe(0);

    state = editorReducer(state, moveClipCommand("clip-a", { startMs: 9500 }));
    expect(state.snapshot.clips.find((item) => item.id === "clip-a")?.startMs).toBe(7000);

    state = editorReducer(state, deleteClipCommand("clip-a"));
    expect(state.snapshot.clips.map((item) => item.id)).not.toContain("clip-a");

    state = editorReducer(state, undoCommand());
    expect(state.snapshot.clips.map((item) => item.id)).toContain("clip-a");
  });
  it("updates selected text and lyric block content through undoable commands", () => {
    let state = createEditorState(snapshot());

    state = editorReducer(state, updateClipTextCommand("clip-b", "Updated hook text"));
    expect(state.snapshot.clips.find((item) => item.id === "clip-b")?.text?.text).toBe("Updated hook text");

    const lyricClip = clip("clip-lyrics", {
      trackId: "text-track",
      kind: "lyrics",
      lyrics: {
        mode: "block",
        offsetMs: 0,
        blocks: [{ id: "block-1", startMs: 1000, endMs: 2500, text: "Original lyric", words: [] }],
      },
    });
    state = createEditorState({ ...snapshot(), clips: [lyricClip] });
    state = editorReducer(state, updateClipLyricsBlockCommand("clip-lyrics", "block-1", "Updated lyric"));
    expect(state.snapshot.clips[0].lyrics?.blocks[0].text).toBe("Updated lyric");

    state = editorReducer(state, undoCommand());
    expect(state.snapshot.clips[0].lyrics?.blocks[0].text).toBe("Original lyric");
  });

  it("updates project title, canvas settings, and render dimensions through undoable commands", () => {
    let state = createEditorState(snapshot());

    state = editorReducer(state, updateProjectSettingsCommand({
      title: "Square remix",
      aspectRatio: "1:1",
      durationMs: 6000,
      background: "#111111",
    }));

    expect(state.snapshot.project).toMatchObject({
      title: "Square remix",
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      durationMs: 6000,
      background: "#111111",
    });
    expect(state.snapshot.renderSettings).toMatchObject({ width: 1080, height: 1080 });

    state = editorReducer(state, undoCommand());
    expect(state.snapshot.project).toMatchObject({ title: "Test", aspectRatio: "9:16", width: 1080, height: 1920 });
  });


  it("updates render quality, fps, and caption settings through undoable commands", () => {
    let state = createEditorState(snapshot());

    state = editorReducer(state, updateRenderSettingsCommand({
      quality: "high",
      fps: 60,
      includeCaptions: false,
    }));

    expect(state.snapshot.renderSettings).toMatchObject({
      quality: "high",
      fps: 60,
      includeCaptions: false,
      width: 1080,
      height: 1920,
      format: "mp4",
      codec: "h264",
      audioCodec: "aac",
    });
    expect(state.snapshot.project.fps).toBe(60);

    state = editorReducer(state, updateRenderSettingsCommand({ fps: 999, quality: "draft", includeCaptions: true }));
    expect(state.snapshot.renderSettings).toMatchObject({ fps: 120, quality: "draft", includeCaptions: true });
    expect(state.snapshot.project.fps).toBe(120);

    state = editorReducer(state, undoCommand());
    expect(state.snapshot.renderSettings).toMatchObject({ quality: "high", fps: 60, includeCaptions: false });
  });

  it("adds, sorts, deletes, and restores timeline markers through undoable commands", () => {
    let state = createEditorState(snapshot());

    state = editorReducer(state, addMarkerCommand({ id: "marker-late", timeMs: 5000, kind: "beat", label: "Drop" }));
    state = editorReducer(state, addMarkerCommand({ id: "marker-early", timeMs: 1500, kind: "cut", label: "Intro cut" }));

    expect(state.snapshot.markers.map((marker) => marker.id)).toEqual(["marker-early", "marker-late"]);

    state = editorReducer(state, deleteMarkerCommand("marker-early"));
    expect(state.snapshot.markers.map((marker) => marker.id)).toEqual(["marker-late"]);

    state = editorReducer(state, undoCommand());
    expect(state.snapshot.markers.map((marker) => marker.id)).toEqual(["marker-early", "marker-late"]);
  });

  it("updates track lock, mute, and hidden flags through undoable commands", () => {
    let state = createEditorState(snapshot());

    state = editorReducer(state, updateTrackSettingsCommand("video-track", { locked: true, muted: true, hidden: true }));

    expect(state.snapshot.tracks.find((track) => track.id === "video-track")).toMatchObject({
      locked: true,
      muted: true,
      hidden: true,
    });

    state = editorReducer(state, undoCommand());
    expect(state.snapshot.tracks.find((track) => track.id === "video-track")).toMatchObject({
      locked: false,
      muted: false,
      hidden: false,
    });
  });

  it("rejects clip mutations on locked tracks", () => {
    let state = createEditorState(snapshot());
    state = editorReducer(state, updateTrackSettingsCommand("video-track", { locked: true }));
    const lockedSnapshot = state.snapshot;

    state = editorReducer(state, moveClipCommand("clip-a", { startMs: 2000 }));
    expect(state.snapshot).toEqual(lockedSnapshot);

    state = editorReducer(state, trimClipStartCommand("clip-a", 1500));
    expect(state.snapshot).toEqual(lockedSnapshot);

    state = editorReducer(state, trimClipEndCommand("clip-a", 2500));
    expect(state.snapshot).toEqual(lockedSnapshot);

    state = editorReducer(state, splitClipCommand("clip-a", 2000, "clip-a-right-locked"));
    expect(state.snapshot).toEqual(lockedSnapshot);

    state = editorReducer(state, deleteClipCommand("clip-a"));
    expect(state.snapshot).toEqual(lockedSnapshot);
  });

  it("updates and resets clip transform through undoable commands", () => {
    let state = createEditorState(snapshot());

    state = editorReducer(state, updateClipTransformCommand("clip-a", {
      x: 120,
      y: -80,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 12,
      opacity: 0.45,
    }));

    expect(state.snapshot.clips.find((item) => item.id === "clip-a")?.transform).toMatchObject({
      x: 120,
      y: -80,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 12,
      opacity: 0.45,
    });

    state = editorReducer(state, updateClipTransformCommand("clip-a", { reset: true }));
    expect(state.snapshot.clips.find((item) => item.id === "clip-a")?.transform).toMatchObject({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    });

    state = editorReducer(state, undoCommand());
    expect(state.snapshot.clips.find((item) => item.id === "clip-a")?.transform).toMatchObject({ x: 120, y: -80 });
  });

});




