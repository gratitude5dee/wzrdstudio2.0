import type { EditorClip, EditorProjectSnapshot, EditorTrack } from "./schema";

export function selectTracksOrdered(snapshot: EditorProjectSnapshot): EditorTrack[] {
  return [...snapshot.tracks].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function selectClipsForTrack(snapshot: EditorProjectSnapshot, trackId: string): EditorClip[] {
  return snapshot.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startMs - b.startMs || a.zIndex - b.zIndex || a.id.localeCompare(b.id));
}

export function selectActiveClipsAtTime(snapshot: EditorProjectSnapshot, timeMs: number): EditorClip[] {
  const trackOrder = new Map(selectTracksOrdered(snapshot).map((track, index) => [track.id, index]));
  const visibleTracks = new Set(snapshot.tracks.filter((track) => !track.hidden).map((track) => track.id));
  return snapshot.clips
    .filter((clip) => visibleTracks.has(clip.trackId))
    .filter((clip) => timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs)
    .sort((a, b) => {
      const orderDelta = (trackOrder.get(a.trackId) ?? 0) - (trackOrder.get(b.trackId) ?? 0);
      if (orderDelta !== 0) return orderDelta;
      return a.zIndex - b.zIndex || a.id.localeCompare(b.id);
    });
}

export function selectLayerStackAtTime(snapshot: EditorProjectSnapshot, timeMs: number): EditorClip[] {
  return selectActiveClipsAtTime(snapshot, timeMs).filter((clip) => clip.kind !== "audio");
}

export function selectSnapPoints(snapshot: EditorProjectSnapshot): number[] {
  const points = new Set<number>([0, snapshot.project.durationMs]);
  for (const marker of snapshot.markers) points.add(marker.timeMs);
  for (const clip of snapshot.clips) {
    points.add(clip.startMs);
    points.add(clip.startMs + clip.durationMs);
  }
  return Array.from(points).sort((a, b) => a - b);
}

