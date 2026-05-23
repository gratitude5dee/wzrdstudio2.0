import type { ExportAsset } from '../_shared/export-helpers.ts';

export const DEFAULT_EDITOR_IMAGE_DURATION_MS = 5000;

export interface TimelineAssetRow {
  id: string;
  position_order: number;
  asset_type: 'image' | 'video' | 'audio';
  source_url: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
}

export type TimelineAssetRole = 'shot_visual' | 'voiceover' | 'sfx' | 'music';

export interface EditorTimelineAssetRowsResult {
  rows: Record<string, unknown>[];
  summary: {
    totalShots: number;
    syncedAssets: number;
    readyVideos: number;
    fallbackImages: number;
    missingShots: number;
    source: 'editor_timeline';
  };
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const numberOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stringOrNull = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null);

export const isRemoteFetchableUrl = (value: unknown): value is string => {
  const sourceUrl = stringOrNull(value);
  if (!sourceUrl) return false;
  try {
    const parsed = new URL(sourceUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const mapRoleToSubtype = (role: TimelineAssetRole) => {
  if (role === 'voiceover' || role === 'sfx' || role === 'music') {
    return role;
  }
  return 'visual';
};

export const getAudioRole = (name: string): TimelineAssetRole => {
  const value = name.toLowerCase();
  if (value.includes('voiceover') || value.includes('narration') || value.includes('voice')) {
    return 'voiceover';
  }
  if (value.includes('sfx') || value.includes('sound') || value.includes('effect')) {
    return 'sfx';
  }
  return 'music';
};

export const mapTimelineAssetsToExportAssets = (assets: TimelineAssetRow[]): ExportAsset[] =>
  assets
    .filter((asset) => isRemoteFetchableUrl(asset.source_url))
    .map((asset) => {
      const meta = (asset.metadata ?? {}) as Record<string, unknown>;
      const role = (meta.asset_role as TimelineAssetRole) ?? 'shot_visual';
      return {
        id: asset.id,
        type: asset.asset_type,
        subtype: mapRoleToSubtype(role),
        url: asset.source_url!,
        duration_ms: asset.duration_ms ?? undefined,
        order_index: asset.position_order,
        metadata: meta,
      };
    });

export function buildEditorTimelineAssetRows(
  document: Record<string, unknown>,
  projectId: string,
  userId: string,
  defaultImageDurationMs = DEFAULT_EDITOR_IMAGE_DURATION_MS
): EditorTimelineAssetRowsResult | null {
  const clips = Array.isArray(document.clips) ? document.clips : [];
  const audioTracks = Array.isArray(document.audioTracks) ? document.audioTracks : [];
  const keyframes = Array.isArray(document.keyframes) ? document.keyframes : [];
  const hasEditorTimelineShape =
    document.source === 'worldstudio-editor' ||
    document.version === 1 ||
    clips.length > 0 ||
    audioTracks.length > 0 ||
    isRecord(document.composition);

  const visualRows = clips
    .map((clip: unknown, index: number) => {
      if (!isRecord(clip)) return null;
      const sourceUrl = stringOrNull(clip.url);
      if (!isRemoteFetchableUrl(sourceUrl)) return null;
      const type = clip.type === 'image' ? 'image' : 'video';
      const startTime = numberOr(clip.startTime, 0);
      const duration = numberOr(clip.duration, type === 'image' ? defaultImageDurationMs : 0);
      const clipId = stringOrNull(clip.id);

      return {
        project_id: projectId,
        user_id: userId,
        position_order: index,
        asset_type: type,
        source_url: sourceUrl,
        duration_ms: duration || null,
        metadata: {
          source: 'editor_timeline',
          asset_role: 'shot_visual',
          clip_id: clipId,
          name: stringOrNull(clip.name) ?? `Clip ${index + 1}`,
          thumbnail_url: stringOrNull(clip.thumbnailUrl ?? clip.thumbnail_url),
          preview_url: stringOrNull(clip.previewUrl ?? clip.preview_url),
          media_metadata: isRecord(clip.mediaMetadata ?? clip.media_metadata)
            ? (clip.mediaMetadata ?? clip.media_metadata)
            : {},
          start_time_ms: startTime,
          end_time_ms: numberOr(clip.endTime, startTime + duration),
          layer: numberOr(clip.layer, 0),
          trim_start_ms: typeof clip.trimStart === 'number' ? clip.trimStart : null,
          trim_end_ms: typeof clip.trimEnd === 'number' ? clip.trimEnd : null,
          transforms: isRecord(clip.transforms) ? clip.transforms : {},
          transition: isRecord(clip.transition) ? clip.transition : null,
          effects: Array.isArray(clip.effects) ? clip.effects : [],
          keyframes: clipId
            ? keyframes.filter(
                (keyframe) =>
                  isRecord(keyframe) &&
                  stringOrNull(keyframe.targetId ?? keyframe.target_id) === clipId
              )
            : [],
          composition: isRecord(document.composition) ? document.composition : {},
        },
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (visualRows.length === 0 && !hasEditorTimelineShape) {
    return null;
  }

  const audioRows = audioTracks
    .map((track: unknown, index: number) => {
      if (!isRecord(track)) return null;
      const sourceUrl = stringOrNull(track.url);
      if (!isRemoteFetchableUrl(sourceUrl)) return null;
      const name = stringOrNull(track.name) ?? `Audio ${index + 1}`;
      const startTime = numberOr(track.startTime, 0);
      const duration = numberOr(track.duration, 0);

      return {
        project_id: projectId,
        user_id: userId,
        position_order: visualRows.length + index,
        asset_type: 'audio',
        source_url: sourceUrl,
        duration_ms: duration || null,
        metadata: {
          source: 'editor_timeline',
          asset_role: getAudioRole(name),
          track_id: stringOrNull(track.id),
          name,
          thumbnail_url: stringOrNull(track.thumbnailUrl ?? track.thumbnail_url),
          preview_url: stringOrNull(track.previewUrl ?? track.preview_url),
          media_metadata: isRecord(track.mediaMetadata ?? track.media_metadata)
            ? (track.mediaMetadata ?? track.media_metadata)
            : {},
          start_time_ms: startTime,
          end_time_ms: numberOr(track.endTime, startTime + duration),
          volume: numberOr(track.volume, 1),
          is_muted: track.isMuted === true,
        },
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  return {
    rows: [...visualRows, ...audioRows],
    summary: {
      totalShots: clips.length,
      syncedAssets: visualRows.length + audioRows.length,
      readyVideos: visualRows.filter((row) => row.asset_type === 'video').length,
      fallbackImages: visualRows.filter((row) => row.asset_type === 'image').length,
      missingShots: Math.max(0, clips.length - visualRows.length),
      source: 'editor_timeline',
    },
  };
}
