import type { EditorCommand } from "./commands";
import type { EditorAssetRef, EditorClip, EditorClipKind, EditorProjectSnapshot } from "./schema";
import { DEFAULT_EDITOR_TRANSFORM, dimensionsForAspectRatio } from "./schema";
import { splitClip, trimClipEnd, trimClipStart } from "./timelineMath";

export type EditorState = {
  snapshot: EditorProjectSnapshot;
  undoStack: EditorProjectSnapshot[];
  redoStack: EditorProjectSnapshot[];
  dirty: boolean;
};

export function createEditorState(snapshot: EditorProjectSnapshot): EditorState {
  return { snapshot, undoStack: [], redoStack: [], dirty: false };
}

function cloneSnapshot(snapshot: EditorProjectSnapshot): EditorProjectSnapshot {
  return structuredClone(snapshot) as EditorProjectSnapshot;
}

function commit(state: EditorState, snapshot: EditorProjectSnapshot): EditorState {
  return {
    snapshot,
    undoStack: [...state.undoStack, cloneSnapshot(state.snapshot)],
    redoStack: [],
    dirty: true,
  };
}

function trackForAsset(asset: EditorAssetRef, snapshot: EditorProjectSnapshot, requestedTrackId?: string): string {
  if (requestedTrackId && snapshot.tracks.some((track) => track.id === requestedTrackId)) return requestedTrackId;
  const compatibleKind = asset.kind === "audio" ? "audio" : asset.kind === "image" || asset.kind === "video" ? "video" : asset.kind === "lyrics" ? "lyrics" : "text";
  const track = snapshot.tracks.find((item) => item.kind === compatibleKind || (compatibleKind === "video" && item.kind === "overlay"));
  if (!track) throw new Error(`No compatible ${compatibleKind} track for asset ${asset.id}.`);
  return track.id;
}

function clipKindForAsset(asset: EditorAssetRef): EditorClipKind {
  if (asset.kind === "audio") return "audio";
  if (asset.kind === "image") return "image";
  if (asset.kind === "lyrics") return "lyrics";
  if (asset.kind === "text") return "text";
  return "video";
}

function clampClipStart(startMs: number, durationMs: number, projectDurationMs: number): number {
  return Math.max(0, Math.min(startMs, Math.max(0, projectDurationMs - durationMs)));
}


function trackById(snapshot: EditorProjectSnapshot, trackId: string) {
  return snapshot.tracks.find((track) => track.id === trackId);
}

function clipTrackIsLocked(snapshot: EditorProjectSnapshot, clip: EditorClip | undefined): boolean {
  if (!clip) return false;
  return trackById(snapshot, clip.trackId)?.locked ?? false;
}

function trackIdIsLocked(snapshot: EditorProjectSnapshot, trackId: string | undefined): boolean {
  if (!trackId) return false;
  return trackById(snapshot, trackId)?.locked ?? false;
}

function buildClipForAsset(snapshot: EditorProjectSnapshot, assetId: string, clipId: string, startMs: number, trackId?: string): EditorClip {
  const asset = snapshot.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error(`Asset missing: ${assetId}.`);
  if (!["video", "image", "audio", "text", "lyrics"].includes(asset.kind)) {
    throw new Error(`Unsupported asset kind: ${asset.kind}.`);
  }
  const safeStartMs = Math.max(0, Math.min(startMs, Math.max(0, snapshot.project.durationMs - 100)));
  const preferredDuration = asset.durationMs ?? (asset.kind === "image" || asset.kind === "text" ? 3000 : snapshot.project.durationMs);
  const durationMs = Math.max(100, Math.min(preferredDuration, snapshot.project.durationMs - safeStartMs));
  return {
    id: clipId,
    trackId: trackForAsset(asset, snapshot, trackId),
    assetId: asset.id,
    kind: clipKindForAsset(asset),
    startMs: safeStartMs,
    durationMs,
    sourceStartMs: 0,
    sourceEndMs: durationMs,
    zIndex: 0,
    transform: { ...DEFAULT_EDITOR_TRANSFORM },
    metadata: { editor_asset_id: asset.id },
  };
}

export function editorReducer(state: EditorState, command: EditorCommand): EditorState {
  if (command.type === "undo") {
    const previous = state.undoStack.at(-1);
    if (!previous) return state;
    return {
      snapshot: previous,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, cloneSnapshot(state.snapshot)],
      dirty: true,
    };
  }
  if (command.type === "redo") {
    const next = state.redoStack.at(-1);
    if (!next) return state;
    return {
      snapshot: next,
      undoStack: [...state.undoStack, cloneSnapshot(state.snapshot)],
      redoStack: state.redoStack.slice(0, -1),
      dirty: true,
    };
  }

  const snapshot = cloneSnapshot(state.snapshot);
  const clipIndex = "clipId" in command ? snapshot.clips.findIndex((clip) => clip.id === command.clipId) : -1;

  switch (command.type) {
    case "moveClip": {
      if (clipIndex < 0) return state;
      const currentClip = snapshot.clips[clipIndex];
      if (clipTrackIsLocked(snapshot, currentClip) || trackIdIsLocked(snapshot, command.patch.trackId)) return state;
      const movedClip = { ...currentClip, ...command.patch };
      if (typeof command.patch.startMs === "number") {
        movedClip.startMs = clampClipStart(command.patch.startMs, currentClip.durationMs, snapshot.project.durationMs);
      }
      snapshot.clips[clipIndex] = movedClip;
      snapshot.clips.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
      return commit(state, snapshot);
    }
    case "trimClipStart":
      if (clipIndex < 0 || clipTrackIsLocked(snapshot, snapshot.clips[clipIndex])) return state;
      snapshot.clips[clipIndex] = trimClipStart(snapshot.clips[clipIndex], command.startMs);
      return commit(state, snapshot);
    case "trimClipEnd":
      if (clipIndex < 0 || clipTrackIsLocked(snapshot, snapshot.clips[clipIndex])) return state;
      snapshot.clips[clipIndex] = trimClipEnd(snapshot.clips[clipIndex], command.endMs);
      return commit(state, snapshot);
    case "splitClip": {
      if (clipIndex < 0 || clipTrackIsLocked(snapshot, snapshot.clips[clipIndex])) return state;
      const [left, right] = splitClip(snapshot.clips[clipIndex], command.timeMs, command.rightClipId);
      snapshot.clips.splice(clipIndex, 1, left, right);
      return commit(state, snapshot);
    }
    case "updateClipStyle":
      if (clipIndex < 0) return state;
      snapshot.clips[clipIndex] = {
        ...snapshot.clips[clipIndex],
        style: { ...(snapshot.clips[clipIndex].style ?? {}), ...command.style },
      };
      return commit(state, snapshot);
    case "updateClipTransform": {
      if (clipIndex < 0 || clipTrackIsLocked(snapshot, snapshot.clips[clipIndex])) return state;
      const transform = command.transform.reset
        ? { ...DEFAULT_EDITOR_TRANSFORM }
        : {
          ...snapshot.clips[clipIndex].transform,
          ...command.transform,
          scaleX: Math.max(0.01, command.transform.scaleX ?? snapshot.clips[clipIndex].transform.scaleX),
          scaleY: Math.max(0.01, command.transform.scaleY ?? snapshot.clips[clipIndex].transform.scaleY),
          opacity: Math.max(0, Math.min(1, command.transform.opacity ?? snapshot.clips[clipIndex].transform.opacity)),
        };
      snapshot.clips[clipIndex] = { ...snapshot.clips[clipIndex], transform };
      return commit(state, snapshot);
    }
    case "updateClipText":
      if (clipIndex < 0) return state;
      snapshot.clips[clipIndex] = {
        ...snapshot.clips[clipIndex],
        text: { ...(snapshot.clips[clipIndex].text ?? {}), text: command.text },
      };
      return commit(state, snapshot);
    case "updateClipLyricsBlock": {
      if (clipIndex < 0) return state;
      const clip = snapshot.clips[clipIndex];
      if (!clip.lyrics) return state;
      snapshot.clips[clipIndex] = {
        ...clip,
        lyrics: {
          ...clip.lyrics,
          blocks: clip.lyrics.blocks.map((block) =>
            block.id === command.blockId ? { ...block, text: command.text } : block,
          ),
        },
      };
      return commit(state, snapshot);
    }
    case "deleteClip":
      if (clipIndex < 0 || clipTrackIsLocked(snapshot, snapshot.clips[clipIndex])) return state;
      snapshot.clips.splice(clipIndex, 1);
      return commit(state, snapshot);
    case "addMarker":
      snapshot.markers.push({
        ...command.marker,
        timeMs: Math.max(0, Math.min(command.marker.timeMs, snapshot.project.durationMs)),
      });
      snapshot.markers.sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id));
      return commit(state, snapshot);
    case "deleteMarker": {
      const markerIndex = snapshot.markers.findIndex((marker) => marker.id === command.markerId);
      if (markerIndex < 0) return state;
      snapshot.markers.splice(markerIndex, 1);
      return commit(state, snapshot);
    }
    case "updateTrackSettings": {
      const trackIndex = snapshot.tracks.findIndex((track) => track.id === command.trackId);
      if (trackIndex < 0) return state;
      snapshot.tracks[trackIndex] = { ...snapshot.tracks[trackIndex], ...command.patch };
      return commit(state, snapshot);
    }
    case "updateProjectSettings": {
      const title = typeof command.patch.title === "string" && command.patch.title.trim() ? command.patch.title.trim() : snapshot.project.title;
      const aspectRatio = command.patch.aspectRatio ?? snapshot.project.aspectRatio;
      const dimensions = dimensionsForAspectRatio(aspectRatio);
      const durationMs = typeof command.patch.durationMs === "number" && Number.isFinite(command.patch.durationMs)
        ? Math.max(1000, Math.min(Math.round(command.patch.durationMs), 600000))
        : snapshot.project.durationMs;
      snapshot.project = {
        ...snapshot.project,
        title,
        aspectRatio,
        width: dimensions.width,
        height: dimensions.height,
        durationMs,
        background: command.patch.background ?? snapshot.project.background,
      };
      snapshot.renderSettings = {
        ...snapshot.renderSettings,
        width: dimensions.width,
        height: dimensions.height,
      };
      snapshot.clips = snapshot.clips.map((clip) => ({
        ...clip,
        startMs: Math.max(0, Math.min(clip.startMs, Math.max(0, durationMs - Math.min(clip.durationMs, durationMs)))),
        durationMs: Math.max(100, Math.min(clip.durationMs, durationMs)),
      }));
      return commit(state, snapshot);
    }
    case "updateRenderSettings": {
      const fps = typeof command.patch.fps === "number" && Number.isFinite(command.patch.fps)
        ? Math.max(1, Math.min(120, Math.round(command.patch.fps)))
        : snapshot.renderSettings.fps;
      const quality = command.patch.quality ?? snapshot.renderSettings.quality;
      snapshot.renderSettings = {
        ...snapshot.renderSettings,
        quality,
        fps,
        includeCaptions: command.patch.includeCaptions ?? snapshot.renderSettings.includeCaptions,
        ...(command.patch.bitrate ? { bitrate: command.patch.bitrate } : {}),
        width: snapshot.project.width,
        height: snapshot.project.height,
      };
      snapshot.project = { ...snapshot.project, fps };
      return commit(state, snapshot);
    }
    case "addAssetToTimeline": {
      const asset = snapshot.assets.find((item) => item.id === command.assetId);
      if (!asset) throw new Error(`Asset missing: ${command.assetId}.`);
      const targetTrackId = trackForAsset(asset, snapshot, command.trackId);
      if (trackIdIsLocked(snapshot, targetTrackId)) return state;
      snapshot.clips.push(buildClipForAsset(snapshot, command.assetId, command.clipId, command.startMs, targetTrackId));
      snapshot.clips.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
      return commit(state, snapshot);
    }

    case "replaceClips":
      snapshot.clips = command.clips;
      return commit(state, snapshot);
    default:
      return state;
  }
}




