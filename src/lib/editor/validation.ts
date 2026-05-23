import type { EditorClip, EditorProjectSnapshot } from "./schema";

export function validateEditorSnapshot(input: unknown): asserts input is EditorProjectSnapshot {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Editor snapshot must be an object.");
  }
  const snapshot = input as EditorProjectSnapshot;
  if (snapshot.schemaVersion !== 1) throw new Error("Editor snapshot schemaVersion must be 1.");
  if (!snapshot.project || typeof snapshot.project.durationMs !== "number") throw new Error("Editor snapshot project is invalid.");
  if (snapshot.project.durationMs <= 0 || snapshot.project.durationMs > 600000) {
    throw new Error("Project duration must be > 0 and <= 600000ms.");
  }
  if (!Array.isArray(snapshot.tracks) || !Array.isArray(snapshot.clips) || !Array.isArray(snapshot.assets) || !Array.isArray(snapshot.markers)) {
    throw new Error("Editor snapshot arrays are invalid.");
  }

  const trackIds = assertUniqueIds(snapshot.tracks, "track");
  const assetIds = assertUniqueIds(snapshot.assets, "asset");
  assertUniqueIds(snapshot.clips, "clip");
  assertUniqueIds(snapshot.markers, "marker");
  assertUniqueNumbers(snapshot.tracks.map((track) => track.order), "track order");

  for (const track of snapshot.tracks) {
    for (const key of ["locked", "muted", "hidden"] as const) {
      if (typeof track[key] !== "boolean") throw new Error(`Track ${key} must be booleans.`);
    }
  }

  for (const clip of snapshot.clips) {
    validateClipTiming(clip, snapshot.project.durationMs);
    if (!trackIds.has(clip.trackId)) throw new Error("Every clip must reference an existing track.");
    if (clip.assetId && !assetIds.has(clip.assetId)) throw new Error("Every clip assetId must reference an existing asset.");
  }

  for (const marker of snapshot.markers) {
    if (marker.timeMs < 0 || marker.timeMs > snapshot.project.durationMs) throw new Error("Marker time must be within project duration.");
  }

  if (snapshot.renderSettings.width !== snapshot.project.width || snapshot.renderSettings.height !== snapshot.project.height) {
    throw new Error("Render settings dimensions must match project dimensions.");
  }
}

function assertUniqueIds(items: Array<{ id: string }>, label: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || ids.has(item.id)) throw new Error(`Duplicate ${label} id detected.`);
    ids.add(item.id);
  }
  return ids;
}

function assertUniqueNumbers(values: number[], label: string): void {
  const seen = new Set<number>();
  for (const value of values) {
    if (!Number.isInteger(value) || seen.has(value)) throw new Error(`Duplicate ${label} detected.`);
    seen.add(value);
  }
}

function validateClipTiming(clip: EditorClip, projectDurationMs: number): void {
  if (clip.startMs < 0) throw new Error("Clip startMs must be non-negative.");
  if (clip.durationMs < 100) throw new Error("Clip durationMs must be at least 100ms.");
  if (clip.sourceStartMs < 0) throw new Error("Clip sourceStartMs must be non-negative.");
  if (clip.startMs + clip.durationMs > projectDurationMs + 1000) {
    throw new Error("Clip timing exceeds project duration.");
  }
}

