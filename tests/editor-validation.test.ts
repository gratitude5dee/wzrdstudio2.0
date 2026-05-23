import { describe, expect, it } from "vitest";
import type { EditorProjectSnapshot } from "@/lib/editor/schema";
import { validateEditorSnapshot } from "@/lib/editor/validation";

function snapshot(): EditorProjectSnapshot {
  return {
    schemaVersion: 1,
    project: { id: "project-1", title: "Validated", aspectRatio: "9:16", width: 1080, height: 1920, fps: 30, durationMs: 10000, background: "#000000" },
    tracks: [
      { id: "video-track", name: "Video", kind: "video", order: 0, locked: false, muted: false, hidden: false },
      { id: "audio-track", name: "Audio", kind: "audio", order: 1, locked: false, muted: false, hidden: false },
    ],
    assets: [
      { id: "asset-video", kind: "video", name: "Video", durationMs: 4000 },
      { id: "asset-audio", kind: "audio", name: "Audio", durationMs: 10000 },
    ],
    clips: [
      { id: "clip-video", trackId: "video-track", assetId: "asset-video", kind: "video", startMs: 0, durationMs: 4000, sourceStartMs: 0, sourceEndMs: 4000, zIndex: 0, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 } },
      { id: "clip-audio", trackId: "audio-track", assetId: "asset-audio", kind: "audio", startMs: 0, durationMs: 10000, sourceStartMs: 0, sourceEndMs: 10000, zIndex: 0, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 } },
    ],
    markers: [{ id: "marker-1", timeMs: 2000, kind: "beat", label: "Beat" }],
    renderSettings: { format: "mp4", codec: "h264", audioCodec: "aac", width: 1080, height: 1920, fps: 30, includeCaptions: true, quality: "standard" },
  };
}

describe("editor snapshot validation", () => {
  it("accepts a valid schema v1 editor snapshot", () => {
    expect(() => validateEditorSnapshot(snapshot())).not.toThrow();
  });

  it("rejects missing track and asset references", () => {
    const missingTrack = snapshot();
    missingTrack.clips[0] = { ...missingTrack.clips[0], trackId: "missing-track" };
    expect(() => validateEditorSnapshot(missingTrack)).toThrow(/track/i);

    const missingAsset = snapshot();
    missingAsset.clips[0] = { ...missingAsset.clips[0], assetId: "missing-asset" };
    expect(() => validateEditorSnapshot(missingAsset)).toThrow(/asset/i);
  });

  it("rejects duplicate ids, invalid booleans, invalid timings, and render dimension drift", () => {
    const duplicateTrack = snapshot();
    duplicateTrack.tracks[1] = { ...duplicateTrack.tracks[1], id: "video-track" };
    expect(() => validateEditorSnapshot(duplicateTrack)).toThrow(/duplicate/i);

    const invalidBoolean = snapshot() as unknown as { tracks: Array<Record<string, unknown>> };
    invalidBoolean.tracks[0].locked = "false";
    expect(() => validateEditorSnapshot(invalidBoolean)).toThrow(/locked/i);

    const invalidTiming = snapshot();
    invalidTiming.clips[0] = { ...invalidTiming.clips[0], startMs: 10000, durationMs: 1001 };
    expect(() => validateEditorSnapshot(invalidTiming)).toThrow(/project duration/i);

    const renderDrift = snapshot();
    renderDrift.renderSettings = { ...renderDrift.renderSettings, width: 720 };
    expect(() => validateEditorSnapshot(renderDrift)).toThrow(/render settings/i);
  });
});

