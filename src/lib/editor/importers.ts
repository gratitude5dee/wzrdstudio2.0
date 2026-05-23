import type { LibraryItem } from "@/lib/library/types";
import type { LyricTemplate } from "@/lib/lyrics/types";
import type { EditorAspectRatio, EditorProjectSnapshot, EditorTrack } from "./schema";
import { DEFAULT_EDITOR_TRANSFORM, dimensionsForAspectRatio } from "./schema";

export type ValidationResult = { valid: true; errors: [] } | { valid: false; errors: string[] };

function baseTracks(): EditorTrack[] {
  return [
    { id: "audio-track", name: "Audio", kind: "audio", order: 0, locked: false, muted: false, hidden: false },
    { id: "video-track", name: "Video", kind: "video", order: 1, locked: false, muted: false, hidden: false },
    { id: "lyrics-track", name: "Lyrics", kind: "lyrics", order: 2, locked: false, muted: false, hidden: false },
    { id: "markers-track", name: "Markers", kind: "markers", order: 3, locked: false, muted: false, hidden: false },
  ];
}

export function buildBlankEditorSnapshot(input: {
  projectId: string;
  title?: string;
  aspectRatio?: EditorAspectRatio;
  durationMs?: number;
}): EditorProjectSnapshot {
  const aspectRatio = input.aspectRatio ?? "9:16";
  const dimensions = dimensionsForAspectRatio(aspectRatio);
  const durationMs = input.durationMs ?? 15000;
  return {
    schemaVersion: 1,
    project: {
      id: input.projectId,
      title: input.title ?? "Untitled edit",
      aspectRatio,
      width: dimensions.width,
      height: dimensions.height,
      fps: 30,
      durationMs,
      background: "#000000",
    },
    tracks: baseTracks(),
    clips: [],
    assets: [],
    markers: [],
    renderSettings: {
      format: "mp4",
      codec: "h264",
      audioCodec: "aac",
      width: dimensions.width,
      height: dimensions.height,
      fps: 30,
      includeCaptions: true,
      quality: "standard",
    },
  };
}

export function validateEditorSnapshot(snapshot: EditorProjectSnapshot): ValidationResult {
  const errors: string[] = [];
  if (snapshot.schemaVersion !== 1) errors.push("Unsupported schemaVersion.");
  if (snapshot.project.durationMs <= 0 || snapshot.project.durationMs > 600000) errors.push("Invalid project duration.");
  const trackIds = new Set(snapshot.tracks.map((track) => track.id));
  const assetIds = new Set(snapshot.assets.map((asset) => asset.id));
  const ids = new Set<string>();
  for (const collection of [snapshot.tracks, snapshot.clips, snapshot.assets, snapshot.markers]) {
    for (const item of collection) {
      if (ids.has(item.id)) errors.push(`Duplicate id ${item.id}.`);
      ids.add(item.id);
    }
  }
  for (const clip of snapshot.clips) {
    if (!trackIds.has(clip.trackId)) errors.push(`Clip ${clip.id} references missing track ${clip.trackId}.`);
    if (clip.assetId && !assetIds.has(clip.assetId)) errors.push(`Clip ${clip.id} references missing asset ${clip.assetId}.`);
    if (clip.startMs < 0) errors.push(`Clip ${clip.id} starts before zero.`);
    if (clip.durationMs < 100) errors.push(`Clip ${clip.id} is shorter than 100ms.`);
    if (clip.sourceStartMs < 0) errors.push(`Clip ${clip.id} has negative sourceStartMs.`);
  }
  return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
}

export function editorSnapshotFromLyricTemplate(
  template: LyricTemplate,
  input: { projectId: string; title?: string },
): EditorProjectSnapshot {
  const aspectRatio = (template.render_defaults?.aspectRatio as EditorAspectRatio | undefined) ?? "9:16";
  const snapshot = buildBlankEditorSnapshot({
    projectId: input.projectId,
    title: input.title ?? template.title,
    aspectRatio,
    durationMs: template.selection_duration_ms || template.total_duration_ms || 15000,
  });
  const audioAssetId = template.trimmed_audio_asset_id ?? template.source_audio_asset_id;
  if (audioAssetId) {
    snapshot.assets.push({
      id: audioAssetId,
      kind: "audio",
      name: `${template.title} audio`,
      projectAssetId: template.trimmed_audio_asset_id,
      mediaAssetId: template.source_audio_asset_id,
      durationMs: snapshot.project.durationMs,
      waveformPeaks: template.waveform_peaks ?? [],
      metadata: { lyric_template_id: template.id },
    });
    snapshot.clips.push({
      id: `audio-${template.id}`,
      trackId: "audio-track",
      assetId: audioAssetId,
      kind: "audio",
      startMs: 0,
      durationMs: snapshot.project.durationMs,
      sourceStartMs: template.selection_start_ms ?? 0,
      sourceEndMs: (template.selection_start_ms ?? 0) + snapshot.project.durationMs,
      zIndex: 0,
      transform: { ...DEFAULT_EDITOR_TRANSFORM },
      metadata: { lyric_template_id: template.id },
    });
  }

  snapshot.assets.push({
    id: `lyrics-${template.id}`,
    kind: "lyrics",
    name: `${template.title} lyrics`,
    durationMs: snapshot.project.durationMs,
    metadata: { lyric_template_id: template.id },
  });
  snapshot.clips.push({
    id: `lyrics-clip-${template.id}`,
    trackId: "lyrics-track",
    assetId: `lyrics-${template.id}`,
    kind: "lyrics",
    startMs: 0,
    durationMs: snapshot.project.durationMs,
    sourceStartMs: 0,
    sourceEndMs: snapshot.project.durationMs,
    zIndex: 10,
    transform: { ...DEFAULT_EDITOR_TRANSFORM, y: 720, scaleX: Number(template.render_defaults?.scale ?? 1), scaleY: Number(template.render_defaults?.scale ?? 1) },
    style: { preset: template.render_defaults?.lyricStyleId ?? "default", scale: Number(template.render_defaults?.scale ?? 1) },
    lyrics: {
      mode: "block",
      offsetMs: 0,
      blocks: (template.lyric_blocks ?? []).map((block) => ({
        id: block.id,
        startMs: Math.round(block.startTime * 1000),
        endMs: Math.round(block.endTime * 1000),
        text: block.words.map((word) => word.text).join(" "),
        words: block.words.map((word) => ({
          id: word.id,
          text: word.text,
          startMs: Math.round(word.startTime * 1000),
          endMs: Math.round(word.endTime * 1000),
        })),
      })),
    },
    metadata: { lyric_template_id: template.id },
  });

  snapshot.markers = (template.cut_markers ?? []).map((timeMs, index) => ({
    id: `cut-${timeMs}`,
    timeMs,
    kind: "cut" as const,
    label: `Cut ${index + 1}`,
  }));
  return snapshot;
}

export function editorSnapshotFromLibraryItem(
  item: LibraryItem,
  input: { projectId: string; title?: string },
): EditorProjectSnapshot {
  const durationMs = Math.round((item.duration_sec || item.media?.duration_sec || 15) * 1000);
  const snapshot = buildBlankEditorSnapshot({
    projectId: input.projectId,
    title: input.title ?? item.default_caption ?? `Library clip ${item.library_index + 1}`,
    aspectRatio: "9:16",
    durationMs,
  });
  const assetId = item.final_asset_id ?? item.media?.id ?? item.id;
  snapshot.assets.push({
    id: assetId,
    kind: "video",
    name: item.default_caption ?? `Library clip ${item.library_index + 1}`,
    mediaAssetId: item.final_asset_id,
    libraryItemId: item.id,
    publicUrl: item.media?.public_url ?? undefined,
    durationMs,
    width: item.media?.width ?? undefined,
    height: item.media?.height ?? undefined,
    thumbnailUrl: item.thumbnail_url,
    provenance: { library_item_id: item.id, provenance: item.provenance },
    metadata: item.metadata,
  });
  snapshot.clips.push({
    id: `video-${item.id}`,
    trackId: "video-track",
    assetId,
    kind: "video",
    startMs: 0,
    durationMs,
    sourceStartMs: 0,
    sourceEndMs: durationMs,
    zIndex: 0,
    transform: { ...DEFAULT_EDITOR_TRANSFORM },
    metadata: { library_item_id: item.id, audio_clip_id: item.audio_clip_id },
  });
  let cursor = 0;
  snapshot.markers = (item.segments ?? []).map((segment, index) => {
    cursor += Math.round(Number(segment.durationSec ?? segment.duration_seconds ?? 0) * 1000);
    return {
      id: `segment-${index + 1}`,
      timeMs: cursor,
      kind: "cut" as const,
      label: String(segment.provider ?? segment.source ?? `Segment ${index + 1}`),
    };
  }).filter((marker) => marker.timeMs > 0);
  return snapshot;
}


