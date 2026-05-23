import { describe, expect, it } from "vitest";
import type { EditorClip, EditorProjectSnapshot } from "@/lib/editor/schema";
import { selectPreviewLayersAtTime } from "@/lib/editor/preview";

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
    transform: { x: 12, y: -24, scaleX: 1.2, scaleY: 0.9, rotation: 15, opacity: 0.8 },
    ...overrides,
  };
}

function snapshot(): EditorProjectSnapshot {
  return {
    schemaVersion: 1,
    project: { id: "project-1", title: "Preview", aspectRatio: "9:16", width: 1080, height: 1920, fps: 30, durationMs: 10000, background: "#101010" },
    tracks: [
      { id: "video-track", name: "Video", kind: "video", order: 0, locked: false, muted: false, hidden: false },
      { id: "overlay-track", name: "Overlay", kind: "overlay", order: 1, locked: false, muted: false, hidden: false },
      { id: "audio-track", name: "Audio", kind: "audio", order: 2, locked: false, muted: false, hidden: false },
    ],
    assets: [
      { id: "asset-video", kind: "video", name: "Hero video", publicUrl: "https://example.test/hero.mp4", thumbnailUrl: "https://example.test/hero.jpg", width: 1080, height: 1920 },
      { id: "asset-image", kind: "image", name: "Overlay image", publicUrl: "https://example.test/overlay.png" },
      { id: "asset-audio", kind: "audio", name: "Song", publicUrl: "https://example.test/song.mp3" },
    ],
    clips: [
      clip("clip-video"),
      clip("clip-image", { trackId: "overlay-track", assetId: "asset-image", kind: "image", startMs: 1500, durationMs: 2000, zIndex: 10 }),
      clip("clip-audio", { trackId: "audio-track", assetId: "asset-audio", kind: "audio", startMs: 0, durationMs: 5000 }),
    ],
    markers: [],
    renderSettings: { format: "mp4", codec: "h264", audioCodec: "aac", width: 1080, height: 1920, fps: 30, includeCaptions: true, quality: "standard" },
  };
}

describe("editor preview layers", () => {
  it("resolves active visual and audio clips with their backing asset URLs", () => {
    const layers = selectPreviewLayersAtTime(snapshot(), 2000);

    expect(layers.visual.map((layer) => [layer.clip.id, layer.asset?.publicUrl])).toEqual([
      ["clip-video", "https://example.test/hero.mp4"],
      ["clip-image", "https://example.test/overlay.png"],
    ]);
    expect(layers.audio.map((layer) => [layer.clip.id, layer.asset?.publicUrl])).toEqual([
      ["clip-audio", "https://example.test/song.mp3"],
    ]);
    expect(layers.visual[0].style.transform).toContain("translate(12px, -24px)");
    expect(layers.visual[0].style.opacity).toBe(0.8);
  });

  it("omits hidden visual tracks and muted audio tracks from preview layers", () => {
    const base = snapshot();
    const layers = selectPreviewLayersAtTime({
      ...base,
      tracks: base.tracks.map((track) =>
        track.id === "overlay-track"
          ? { ...track, hidden: true }
          : track.id === "audio-track"
            ? { ...track, muted: true }
            : track,
      ),
    }, 2000);

    expect(layers.visual.map((layer) => layer.clip.id)).toEqual(["clip-video"]);
    expect(layers.audio).toEqual([]);
  });

});

