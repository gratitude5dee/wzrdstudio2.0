import { describe, expect, it } from "vitest";
import type { EditorProjectSnapshot } from "@/lib/editor/schema";
import { buildEditorRenderPlan } from "@/lib/editor/renderPayload";

function snapshot(): EditorProjectSnapshot {
  return {
    schemaVersion: 1,
    project: {
      id: "project-1",
      title: "Render me",
      aspectRatio: "9:16",
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 5000,
      background: "#000",
    },
    tracks: [
      { id: "video-track", name: "Video", kind: "video", order: 1, locked: false, muted: false, hidden: false },
      { id: "audio-track", name: "Audio", kind: "audio", order: 0, locked: false, muted: false, hidden: false },
      { id: "lyrics-track", name: "Lyrics", kind: "lyrics", order: 2, locked: false, muted: false, hidden: false },
    ],
    assets: [
      { id: "video-asset", kind: "video", name: "Final video", publicUrl: "https://example.test/video.mp4", durationMs: 5000 },
      { id: "audio-asset", kind: "audio", name: "Song", signedUrl: "https://signed.test/audio.wav", durationMs: 5000 },
    ],
    clips: [
      {
        id: "video-clip",
        trackId: "video-track",
        assetId: "video-asset",
        kind: "video",
        startMs: 0,
        durationMs: 5000,
        sourceStartMs: 0,
        sourceEndMs: 5000,
        zIndex: 0,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      },
      {
        id: "lyrics-clip",
        trackId: "lyrics-track",
        assetId: null,
        kind: "lyrics",
        startMs: 0,
        durationMs: 5000,
        sourceStartMs: 0,
        sourceEndMs: 5000,
        zIndex: 10,
        transform: { x: 0, y: 700, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        style: { preset: "bold-impact", color: "#ffffff" },
        lyrics: {
          mode: "block",
          offsetMs: 0,
          blocks: [
            { id: "b1", startMs: 500, endMs: 1500, text: "sound on", words: [] },
            { id: "b2", startMs: 2000, endMs: 3500, text: "shine bright", words: [] },
          ],
        },
      },
    ],
    markers: [{ id: "m1", timeMs: 2500, kind: "cut", label: "Cut" }],
    renderSettings: { format: "mp4", codec: "h264", audioCodec: "aac", width: 1080, height: 1920, fps: 30, includeCaptions: true, quality: "standard" },
  };
}

describe("editor render payload", () => {
  it("builds a provider-neutral render plan from the canonical snapshot", () => {
    const plan = buildEditorRenderPlan({ projectId: "project-1", revisionId: "revision-1", snapshot: snapshot() });

    expect(plan).toMatchObject({ projectId: "project-1", revisionId: "revision-1", width: 1080, height: 1920, fps: 30, durationMs: 5000 });
    expect(plan.assets).toEqual([
      { id: "video-asset", kind: "video", url: "https://example.test/video.mp4", durationMs: 5000 },
      { id: "audio-asset", kind: "audio", url: "https://signed.test/audio.wav", durationMs: 5000 },
    ]);
    expect(plan.captions).toEqual([
      { startMs: 500, endMs: 1500, text: "sound on", style: { preset: "bold-impact", color: "#ffffff" } },
      { startMs: 2000, endMs: 3500, text: "shine bright", style: { preset: "bold-impact", color: "#ffffff" } },
    ]);
    expect(plan.output).toEqual({ format: "mp4", codec: "h264", audioCodec: "aac" });
  });

  it("rejects render plans when an asset has no usable URL", () => {
    const broken = snapshot();
    broken.assets[0].publicUrl = null;
    broken.assets[0].signedUrl = null;

    expect(() => buildEditorRenderPlan({ projectId: "project-1", revisionId: "revision-1", snapshot: broken })).toThrow(/missing a renderable URL/i);
  });
});

