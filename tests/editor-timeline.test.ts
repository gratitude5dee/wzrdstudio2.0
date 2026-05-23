import { describe, expect, it } from "vitest";
import {
  clampClipToProject,
  frameToMs,
  msToFrame,
  msToPx,
  pxToMs,
  snapTime,
  splitClip,
  trimClipEnd,
  trimClipStart,
} from "@/lib/editor/timelineMath";
import type { EditorClip } from "@/lib/editor/schema";

function videoClip(overrides: Partial<EditorClip> = {}): EditorClip {
  return {
    id: "clip-1",
    trackId: "track-video",
    assetId: "asset-video",
    kind: "video",
    startMs: 1000,
    durationMs: 4000,
    sourceStartMs: 250,
    sourceEndMs: 4250,
    zIndex: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    ...overrides,
  };
}

describe("editor timeline math", () => {
  it("converts between milliseconds, pixels, and frames", () => {
    expect(msToPx(1500, 0.2)).toBe(300);
    expect(pxToMs(300, 0.2)).toBe(1500);
    expect(frameToMs(15, 30)).toBe(500);
    expect(msToFrame(500, 30)).toBe(15);
  });

  it("snaps a time to the nearest snap point inside the threshold", () => {
    expect(snapTime(1012, [500, 1000, 2000], 20)).toBe(1000);
    expect(snapTime(1040, [500, 1000, 2000], 20)).toBe(1040);
  });

  it("splits a clip at the playhead while preserving source offsets", () => {
    const [left, right] = splitClip(videoClip(), 2500, "clip-right");

    expect(left).toMatchObject({ id: "clip-1", startMs: 1000, durationMs: 1500, sourceStartMs: 250, sourceEndMs: 1750 });
    expect(right).toMatchObject({ id: "clip-right", startMs: 2500, durationMs: 2500, sourceStartMs: 1750, sourceEndMs: 4250 });
  });

  it("trims clip start and end without changing represented media time", () => {
    expect(trimClipStart(videoClip(), 1750)).toMatchObject({ startMs: 1750, durationMs: 3250, sourceStartMs: 1000, sourceEndMs: 4250 });
    expect(trimClipEnd(videoClip(), 4500)).toMatchObject({ startMs: 1000, durationMs: 3500, sourceStartMs: 250, sourceEndMs: 3750 });
  });

  it("clamps clips to project boundaries and minimum duration", () => {
    expect(clampClipToProject(videoClip({ startMs: -500, durationMs: 50 }), 3000)).toMatchObject({ startMs: 0, durationMs: 100 });
    expect(clampClipToProject(videoClip({ startMs: 2800, durationMs: 1000 }), 3000)).toMatchObject({ startMs: 2800, durationMs: 200 });
  });
});

