import type { CSSProperties } from "react";
import type { EditorAssetRef, EditorClip, EditorProjectSnapshot } from "./schema";
import { selectActiveClipsAtTime, selectLayerStackAtTime } from "./selectors";

export type EditorPreviewLayer = {
  clip: EditorClip;
  asset: EditorAssetRef | null;
  style: CSSProperties;
};

export type EditorPreviewLayers = {
  visual: EditorPreviewLayer[];
  audio: EditorPreviewLayer[];
};

function resolveAsset(snapshot: EditorProjectSnapshot, clip: EditorClip): EditorAssetRef | null {
  if (!clip.assetId) return null;
  return snapshot.assets.find((asset) => asset.id === clip.assetId) ?? null;
}

export function styleForPreviewClip(clip: EditorClip): CSSProperties {
  const transform = clip.transform;
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity: transform.opacity,
    transform: `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`,
    zIndex: clip.zIndex,
    pointerEvents: "none",
  };
}

export function selectPreviewLayersAtTime(snapshot: EditorProjectSnapshot, timeMs: number): EditorPreviewLayers {
  const mutedTracks = new Set(snapshot.tracks.filter((track) => track.muted).map((track) => track.id));
  const visual = selectLayerStackAtTime(snapshot, timeMs)
    .filter((clip) => ["video", "image"].includes(clip.kind))
    .map((clip) => ({ clip, asset: resolveAsset(snapshot, clip), style: styleForPreviewClip(clip) }));

  const audio = selectActiveClipsAtTime(snapshot, timeMs)
    .filter((clip) => clip.kind === "audio")
    .filter((clip) => !mutedTracks.has(clip.trackId))
    .map((clip) => ({ clip, asset: resolveAsset(snapshot, clip), style: styleForPreviewClip(clip) }));

  return { visual, audio };
}

