import type { EditorAspectRatio, EditorClip, EditorClipStyle, EditorMarker, EditorRenderSettings, EditorTrack, EditorTransform } from "./schema";

export type EditorCommand =
  | { type: "moveClip"; clipId: string; patch: { startMs?: number; trackId?: string } }
  | { type: "trimClipStart"; clipId: string; startMs: number }
  | { type: "trimClipEnd"; clipId: string; endMs: number }
  | { type: "splitClip"; clipId: string; timeMs: number; rightClipId: string }
  | { type: "updateClipStyle"; clipId: string; style: EditorClipStyle }
  | { type: "updateClipTransform"; clipId: string; transform: Partial<EditorTransform> & { reset?: boolean } }
  | { type: "updateClipText"; clipId: string; text: string }
  | { type: "updateClipLyricsBlock"; clipId: string; blockId: string; text: string }
  | { type: "deleteClip"; clipId: string }
  | { type: "addMarker"; marker: EditorMarker }
  | { type: "deleteMarker"; markerId: string }
  | { type: "updateProjectSettings"; patch: { title?: string; aspectRatio?: EditorAspectRatio; durationMs?: number; background?: string } }
  | { type: "updateRenderSettings"; patch: Pick<Partial<EditorRenderSettings>, "quality" | "fps" | "includeCaptions" | "bitrate"> }
  | { type: "updateTrackSettings"; trackId: string; patch: Pick<Partial<EditorTrack>, "locked" | "muted" | "hidden" | "height"> }
  | { type: "addAssetToTimeline"; assetId: string; clipId: string; startMs: number; trackId?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "replaceClips"; clips: EditorClip[] };

export function moveClipCommand(clipId: string, patch: { startMs?: number; trackId?: string }): EditorCommand {
  return { type: "moveClip", clipId, patch };
}

export function trimClipStartCommand(clipId: string, startMs: number): EditorCommand {
  return { type: "trimClipStart", clipId, startMs };
}

export function trimClipEndCommand(clipId: string, endMs: number): EditorCommand {
  return { type: "trimClipEnd", clipId, endMs };
}

export function splitClipCommand(clipId: string, timeMs: number, rightClipId: string): EditorCommand {
  return { type: "splitClip", clipId, timeMs, rightClipId };
}

export function updateClipStyleCommand(clipId: string, style: EditorClipStyle): EditorCommand {
  return { type: "updateClipStyle", clipId, style };
}

export function updateClipTransformCommand(
  clipId: string,
  transform: Partial<EditorTransform> & { reset?: boolean },
): EditorCommand {
  return { type: "updateClipTransform", clipId, transform };
}

export function updateClipTextCommand(clipId: string, text: string): EditorCommand {
  return { type: "updateClipText", clipId, text };
}

export function updateClipLyricsBlockCommand(clipId: string, blockId: string, text: string): EditorCommand {
  return { type: "updateClipLyricsBlock", clipId, blockId, text };
}

export function deleteClipCommand(clipId: string): EditorCommand {
  return { type: "deleteClip", clipId };
}

export function addMarkerCommand(marker: EditorMarker): EditorCommand {
  return { type: "addMarker", marker };
}

export function deleteMarkerCommand(markerId: string): EditorCommand {
  return { type: "deleteMarker", markerId };
}

export function updateProjectSettingsCommand(patch: {
  title?: string;
  aspectRatio?: EditorAspectRatio;
  durationMs?: number;
  background?: string;
}): EditorCommand {
  return { type: "updateProjectSettings", patch };
}

export function updateRenderSettingsCommand(
  patch: Pick<Partial<EditorRenderSettings>, "quality" | "fps" | "includeCaptions" | "bitrate">,
): EditorCommand {
  return { type: "updateRenderSettings", patch };
}

export function updateTrackSettingsCommand(
  trackId: string,
  patch: Pick<Partial<EditorTrack>, "locked" | "muted" | "hidden" | "height">,
): EditorCommand {
  return { type: "updateTrackSettings", trackId, patch };
}

export function addAssetToTimelineCommand(input: {
  assetId: string;
  clipId: string;
  startMs: number;
  trackId?: string;
}): EditorCommand {
  return { type: "addAssetToTimeline", ...input };
}

export function undoCommand(): EditorCommand {
  return { type: "undo" };
}

export function redoCommand(): EditorCommand {
  return { type: "redo" };
}




