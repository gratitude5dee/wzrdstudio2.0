import type { EditorClip } from "./schema";

export const MIN_CLIP_DURATION_MS = 100;

export function msToPx(ms: number, zoomPxPerMs: number): number {
  return ms * zoomPxPerMs;
}

export function pxToMs(px: number, zoomPxPerMs: number): number {
  if (zoomPxPerMs <= 0) return 0;
  return Math.round(px / zoomPxPerMs);
}

export function frameToMs(frame: number, fps: number): number {
  if (fps <= 0) return 0;
  return Math.round((frame / fps) * 1000);
}

export function msToFrame(ms: number, fps: number): number {
  if (fps <= 0) return 0;
  return Math.round((ms / 1000) * fps);
}

export function snapTime(timeMs: number, snapPoints: number[], thresholdMs: number): number {
  let best = timeMs;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of snapPoints) {
    const distance = Math.abs(point - timeMs);
    if (distance <= thresholdMs && distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

export function splitClip(clip: EditorClip, timeMs: number, rightClipId: string): [EditorClip, EditorClip] {
  const splitOffset = timeMs - clip.startMs;
  if (splitOffset < MIN_CLIP_DURATION_MS || clip.durationMs - splitOffset < MIN_CLIP_DURATION_MS) {
    throw new Error("Split point must leave both clips at least 100ms long.");
  }
  const sourceSplit = clip.sourceStartMs + splitOffset;
  const left: EditorClip = {
    ...clip,
    durationMs: splitOffset,
    sourceEndMs: sourceSplit,
  };
  const right: EditorClip = {
    ...clip,
    id: rightClipId,
    startMs: timeMs,
    durationMs: clip.durationMs - splitOffset,
    sourceStartMs: sourceSplit,
    sourceEndMs:
      typeof clip.sourceEndMs === "number" ? clip.sourceEndMs : sourceSplit + (clip.durationMs - splitOffset),
  };
  return [left, right];
}

export function trimClipStart(clip: EditorClip, newStartMs: number): EditorClip {
  const maxStart = clip.startMs + clip.durationMs - MIN_CLIP_DURATION_MS;
  const startMs = Math.max(0, Math.min(newStartMs, maxStart));
  const delta = startMs - clip.startMs;
  const durationMs = clip.durationMs - delta;
  return {
    ...clip,
    startMs,
    durationMs,
    sourceStartMs: clip.sourceStartMs + delta,
  };
}

export function trimClipEnd(clip: EditorClip, newEndMs: number): EditorClip {
  const minEnd = clip.startMs + MIN_CLIP_DURATION_MS;
  const endMs = Math.max(minEnd, newEndMs);
  const durationMs = endMs - clip.startMs;
  return {
    ...clip,
    durationMs,
    sourceEndMs: clip.sourceStartMs + durationMs,
  };
}

export function clampClipToProject(clip: EditorClip, projectDurationMs: number): EditorClip {
  const startMs = Math.max(0, Math.min(clip.startMs, Math.max(0, projectDurationMs - MIN_CLIP_DURATION_MS)));
  const maxDuration = Math.max(MIN_CLIP_DURATION_MS, projectDurationMs - startMs);
  const durationMs = Math.max(MIN_CLIP_DURATION_MS, Math.min(clip.durationMs, maxDuration));
  return {
    ...clip,
    startMs,
    durationMs,
    sourceEndMs:
      typeof clip.sourceEndMs === "number" ? clip.sourceStartMs + durationMs : clip.sourceEndMs,
  };
}

