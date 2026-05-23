import type { AudioTrack, Clip, ClipEffect, CompositionSettings, Keyframe } from '@/store/videoEditorStore';

export interface EditorTimelineDocument {
  version: 1;
  source: 'worldstudio-editor';
  clips: Clip[];
  audioTracks: AudioTrack[];
  keyframes: Keyframe[];
  composition: CompositionSettings;
  updatedAt: string;
}

export interface ParsedEditorTimeline {
  clips: Clip[];
  audioTracks: AudioTrack[];
  keyframes: Keyframe[];
  composition: CompositionSettings;
}

export const DEFAULT_EDITOR_COMPOSITION: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  duration: 0,
  backgroundColor: '#000000',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stringOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const recordOrUndefined = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

export const getTimelineDurationMs = (
  clips: Pick<Clip, 'startTime' | 'duration'>[],
  audioTracks: Pick<AudioTrack, 'startTime' | 'duration' | 'endTime'>[],
  compositionDuration = 0
) => {
  const visualEnd = clips.reduce(
    (max, clip) => Math.max(max, numberOr(clip.startTime, 0) + numberOr(clip.duration, 0)),
    0
  );
  const audioEnd = audioTracks.reduce((max, track) => {
    const explicitEnd = numberOr(track.endTime, 0);
    const derivedEnd = numberOr(track.startTime, 0) + numberOr(track.duration, 0);
    return Math.max(max, explicitEnd, derivedEnd);
  }, 0);
  return Math.max(0, compositionDuration, visualEnd, audioEnd);
};

export const normalizeComposition = (value: unknown): CompositionSettings => {
  const record = isRecord(value) ? value : {};
  const width = numberOr(record.width, DEFAULT_EDITOR_COMPOSITION.width);
  const height = numberOr(record.height, DEFAULT_EDITOR_COMPOSITION.height);
  const fps = numberOr(record.fps ?? record.frameRate, DEFAULT_EDITOR_COMPOSITION.fps);
  const aspectRatio = stringOr(record.aspectRatio, `${width}:${height}`) as CompositionSettings['aspectRatio'];

  return {
    width,
    height,
    fps,
    aspectRatio,
    duration: numberOr(record.duration ?? record.durationMs, DEFAULT_EDITOR_COMPOSITION.duration),
    backgroundColor: stringOr(record.backgroundColor, DEFAULT_EDITOR_COMPOSITION.backgroundColor),
  };
};

const normalizeTransforms = (value: unknown): Clip['transforms'] => {
  const transforms = isRecord(value) ? value : {};
  const position = isRecord(transforms.position) ? transforms.position : {};
  const scale = isRecord(transforms.scale) ? transforms.scale : {};

  return {
    position: {
      x: numberOr(position.x, 0),
      y: numberOr(position.y, 0),
    },
    scale: {
      x: numberOr(scale.x, 1),
      y: numberOr(scale.y, 1),
    },
    rotation: numberOr(transforms.rotation, 0),
    opacity: numberOr(transforms.opacity, 1),
  };
};

const normalizeClipEffect = (value: unknown, index: number): ClipEffect | null => {
  if (!isRecord(value)) return null;
  const type = value.type === 'filter' || value.type === 'overlay' ? value.type : 'adjustment';
  const rawParams = isRecord(value.params) ? value.params : {};
  const params = Object.fromEntries(
    Object.entries(rawParams).filter(([, paramValue]) => typeof paramValue === 'number' && Number.isFinite(paramValue))
  ) as Record<string, number>;

  return {
    id: stringOr(value.id, `effect-${index}`),
    name: stringOr(value.name, `Effect ${index + 1}`),
    type,
    params,
  };
};

const normalizeClip = (value: unknown, index: number): Clip | null => {
  if (!isRecord(value)) return null;
  const clipType: Clip['type'] =
    value.type === 'image' || value.type === 'video' || value.type === 'text' || value.type === 'element'
      ? value.type
      : 'video';
  const url = stringOr(value.url ?? value.fileUrl ?? value.source_url, '');
  if (!url && (clipType === 'image' || clipType === 'video')) return null;
  const startTime = numberOr(value.startTime ?? value.start_time_ms, 0);
  const duration = numberOr(value.duration ?? value.duration_ms, 0);

  return {
    id: stringOr(value.id, `clip-${index}`),
    mediaItemId: typeof value.mediaItemId === 'string' ? value.mediaItemId : undefined,
    type: clipType,
    name: stringOr(value.name, clipType === 'text' ? 'Text' : `Clip ${index + 1}`),
    url,
    thumbnailUrl: stringOrUndefined(value.thumbnailUrl ?? value.thumbnail_url),
    previewUrl: stringOrUndefined(value.previewUrl ?? value.preview_url),
    mediaMetadata: recordOrUndefined(value.mediaMetadata ?? value.media_metadata),
    sourceId: typeof value.sourceId === 'string' ? value.sourceId : null,
    text: stringOrUndefined(value.text ?? value.text_content),
    style: recordOrUndefined(value.style),
    startTime,
    duration,
    endTime: numberOr(value.endTime, startTime + duration),
    trackIndex: numberOr(value.trackIndex, numberOr(value.layer, 0)),
    layer: numberOr(value.layer, numberOr(value.trackIndex, 0)),
    trimStart: typeof value.trimStart === 'number' ? value.trimStart : undefined,
    trimEnd: typeof value.trimEnd === 'number' ? value.trimEnd : undefined,
    transition: isRecord(value.transition) ? (value.transition as unknown as Clip['transition']) : undefined,
    effects: Array.isArray(value.effects)
      ? value.effects
          .map((effect, effectIndex) => normalizeClipEffect(effect, effectIndex))
          .filter((effect): effect is ClipEffect => !!effect)
      : undefined,
    transforms: normalizeTransforms(value.transforms),
  };
};

const normalizeAudioTrack = (value: unknown, index: number): AudioTrack | null => {
  if (!isRecord(value)) return null;
  const url = stringOr(value.url ?? value.storagePath ?? value.storage_path, '');
  if (!url) return null;
  const startTime = numberOr(value.startTime ?? value.start_time_ms, 0);
  const duration = numberOr(value.duration ?? value.duration_ms, 0);

  return {
    id: stringOr(value.id, `audio-${index}`),
    mediaItemId: typeof value.mediaItemId === 'string' ? value.mediaItemId : undefined,
    type: 'audio',
    name: stringOr(value.name, `Audio ${index + 1}`),
    url,
    thumbnailUrl: stringOrUndefined(value.thumbnailUrl ?? value.thumbnail_url),
    previewUrl: stringOrUndefined(value.previewUrl ?? value.preview_url),
    mediaMetadata: recordOrUndefined(value.mediaMetadata ?? value.media_metadata),
    sourceId: typeof value.sourceId === 'string' ? value.sourceId : null,
    startTime,
    duration,
    endTime: numberOr(value.endTime ?? value.end_time_ms, startTime + duration),
    volume: numberOr(value.volume, 1),
    isMuted: value.isMuted === true || value.is_muted === true,
    trackIndex: numberOr(value.trackIndex, 0),
    fadeInDuration: numberOr(value.fadeInDuration, 0),
    fadeOutDuration: numberOr(value.fadeOutDuration, 0),
  };
};

const normalizeKeyframe = (value: unknown, index: number): Keyframe | null => {
  if (!isRecord(value)) return null;
  const targetId = stringOr(value.targetId ?? value.target_id, '');
  if (!targetId) return null;

  return {
    id: stringOr(value.id, `keyframe-${index}`),
    targetId,
    time: numberOr(value.time ?? value.time_ms, 0),
    properties: isRecord(value.properties) ? value.properties : {},
    targetType: value.targetType === 'audio' || value.targetType === 'composition' ? value.targetType : 'clip',
    propertyPath: stringOrUndefined(value.propertyPath ?? value.property_path),
    easing: stringOrUndefined(value.easing),
  };
};

export const parseEditorTimelineDocument = (data: unknown): ParsedEditorTimeline => {
  const record = isRecord(data) ? data : {};
  const clipsSource = Array.isArray(record.clips) ? record.clips : [];
  const audioSource = Array.isArray(record.audioTracks) ? record.audioTracks : [];
  const keyframesSource = Array.isArray(record.keyframes) ? record.keyframes : [];

  const clips = clipsSource
    .map((clip, index) => normalizeClip(clip, index))
    .filter((clip): clip is Clip => !!clip)
    .sort((a, b) => (a.startTime - b.startTime) || (a.layer - b.layer));

  const audioTracks = audioSource
    .map((track, index) => normalizeAudioTrack(track, index))
    .filter((track): track is AudioTrack => !!track)
    .sort((a, b) => (a.startTime - b.startTime) || ((a.trackIndex ?? 0) - (b.trackIndex ?? 0)));

  const validClipIds = new Set(clips.map((clip) => clip.id));
  const validAudioIds = new Set(audioTracks.map((track) => track.id));
  const keyframes = keyframesSource
    .map((keyframe, index) => normalizeKeyframe(keyframe, index))
    .filter((keyframe): keyframe is Keyframe =>
      !!keyframe && (validClipIds.has(keyframe.targetId) || validAudioIds.has(keyframe.targetId))
    )
    .sort((a, b) => (a.targetId.localeCompare(b.targetId)) || (a.time - b.time));

  const composition = normalizeComposition(record.composition);
  return {
    clips,
    audioTracks,
    keyframes,
    composition: {
      ...composition,
      duration: getTimelineDurationMs(clips, audioTracks, composition.duration),
    },
  };
};

export const createEditorTimelineDocument = (
  clips: Clip[],
  audioTracks: AudioTrack[],
  composition: CompositionSettings,
  keyframes: Keyframe[] = []
): EditorTimelineDocument => ({
  version: 1,
  source: 'worldstudio-editor',
  clips,
  audioTracks,
  keyframes,
  composition: {
    ...composition,
    duration: getTimelineDurationMs(clips, audioTracks, composition.duration),
  },
  updatedAt: new Date().toISOString(),
});
