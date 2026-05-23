export type EditorAspectRatio = "9:16" | "1:1" | "16:9";
export type EditorTrackKind = "video" | "audio" | "text" | "lyrics" | "overlay" | "effect" | "markers";
export type EditorClipKind = "video" | "image" | "audio" | "text" | "lyrics" | "caption" | "shape";

export type EditorProjectSnapshot = {
  schemaVersion: 1;
  project: {
    id: string;
    title: string;
    aspectRatio: EditorAspectRatio;
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    background: string;
  };
  tracks: EditorTrack[];
  clips: EditorClip[];
  assets: EditorAssetRef[];
  markers: EditorMarker[];
  renderSettings: EditorRenderSettings;
};

export type EditorTrack = {
  id: string;
  name: string;
  kind: EditorTrackKind;
  order: number;
  locked: boolean;
  muted: boolean;
  hidden: boolean;
  height?: number;
};

export type EditorAssetRef = {
  id: string;
  kind: "video" | "image" | "audio" | "text" | "lyrics" | "subtitle" | "shape" | "effect";
  name: string;
  mediaAssetId?: string | null;
  projectAssetId?: string | null;
  libraryItemId?: string | null;
  sourceCandidateId?: string | null;
  publicUrl?: string | null;
  signedUrl?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  thumbnailUrl?: string | null;
  waveformPeaks?: number[] | null;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type EditorClip = {
  id: string;
  trackId: string;
  assetId?: string | null;
  kind: EditorClipKind;
  startMs: number;
  durationMs: number;
  sourceStartMs: number;
  sourceEndMs?: number | null;
  zIndex: number;
  transform: EditorTransform;
  crop?: EditorCrop | null;
  style?: EditorClipStyle;
  animation?: EditorKeyframe[];
  text?: EditorTextPayload | null;
  lyrics?: EditorLyricsPayload | null;
  effects?: EditorEffectRef[];
  metadata?: Record<string, unknown>;
};

export type EditorTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
};

export type EditorCrop = { x: number; y: number; width: number; height: number };

export type EditorClipStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  backgroundColor?: string;
  borderRadius?: number;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  preset?: "default" | "bold-impact" | "minimal" | "neon" | string;
  scale?: number;
};

export type EditorTextPayload = {
  text: string;
  contentEditable?: boolean;
};

export type EditorLyricsPayload = {
  mode: "block" | "word" | "karaoke";
  blocks: Array<{
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    words: Array<{ id: string; text: string; startMs: number; endMs: number }>;
  }>;
  offsetMs: number;
};

export type EditorMarker = {
  id: string;
  timeMs: number;
  kind: "cut" | "beat" | "lyric" | "chapter";
  label?: string;
};

export type EditorKeyframe = {
  timeMs: number;
  property: string;
  value: unknown;
  easing?: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
};

export type EditorEffectRef = {
  id: string;
  kind: string;
  params: Record<string, unknown>;
};

export type EditorRenderSettings = {
  format: "mp4";
  codec: "h264";
  audioCodec: "aac";
  width: number;
  height: number;
  fps: number;
  bitrate?: string;
  includeCaptions: boolean;
  quality: "draft" | "standard" | "high";
};

export const DEFAULT_EDITOR_TRANSFORM: EditorTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};

export function dimensionsForAspectRatio(aspectRatio: EditorAspectRatio): { width: number; height: number } {
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 };
}

