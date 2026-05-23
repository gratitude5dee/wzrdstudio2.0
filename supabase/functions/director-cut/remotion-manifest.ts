export type DirectorCutRenderBackend = 'fal_remote' | 'remotion_worker' | 'auto';

export interface DirectorCutRemotionSettings {
  resolution?: string;
  fps?: number;
  codec?: string;
  quality?: string;
  includeAudio?: boolean;
  renderBackend?: DirectorCutRenderBackend;
}

export interface DirectorCutRemotionManifest {
  renderer: 'remotion';
  version: 1;
  entryPoint: 'remotion/index.ts';
  compositionId: 'VideoEditorComposition';
  inputProps: {
    clips: Record<string, unknown>[];
    audioTracks: Record<string, unknown>[];
    composition: Record<string, unknown>;
    selectedClipIds: string[];
    keyframes: Record<string, unknown>[];
  };
  output: {
    format: 'mp4';
    codec: 'h264';
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    durationInFrames: number;
  };
  createdAt: string;
}

const DEFAULT_COMPOSITION = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  duration: 0,
  backgroundColor: '#000000',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const numberOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stringOr = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const parseResolution = (resolution: unknown) => {
  if (typeof resolution !== 'string') return null;
  const match = resolution.match(/^(\d+)x(\d+)$/i);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
};

const getDurationInFrames = (durationMs: number, fps: number) =>
  Math.max(1, Math.ceil((durationMs / 1000) * fps));

const normalizeComposition = (
  value: unknown,
  settings: DirectorCutRemotionSettings = {}
) => {
  const record = isRecord(value) ? value : {};
  const requestedResolution = parseResolution(settings.resolution);
  const width = requestedResolution?.width ?? numberOr(record.width, DEFAULT_COMPOSITION.width);
  const height = requestedResolution?.height ?? numberOr(record.height, DEFAULT_COMPOSITION.height);
  const fps = Math.max(
    1,
    Math.round(numberOr(settings.fps, numberOr(record.fps ?? record.frameRate, DEFAULT_COMPOSITION.fps)))
  );

  return {
    ...DEFAULT_COMPOSITION,
    ...record,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    fps,
    aspectRatio: stringOr(record.aspectRatio, `${width}:${height}`),
    duration: numberOr(record.duration ?? record.durationMs, DEFAULT_COMPOSITION.duration),
    backgroundColor: stringOr(record.backgroundColor, DEFAULT_COMPOSITION.backgroundColor),
  };
};

const getTimelineDurationMs = (
  clips: Record<string, unknown>[],
  audioTracks: Record<string, unknown>[],
  compositionDuration = 0
) => {
  const visualEnd = clips.reduce((max, clip) => {
    const startTime = numberOr(clip.startTime ?? clip.start_time_ms, 0);
    const duration = numberOr(clip.duration ?? clip.duration_ms, 0);
    return Math.max(max, startTime + duration);
  }, 0);

  const audioEnd = audioTracks.reduce((max, track) => {
    const startTime = numberOr(track.startTime ?? track.start_time_ms, 0);
    const duration = numberOr(track.duration ?? track.duration_ms, 0);
    const explicitEnd = numberOr(track.endTime ?? track.end_time_ms, 0);
    return Math.max(max, explicitEnd, startTime + duration);
  }, 0);

  return Math.max(0, compositionDuration, visualEnd, audioEnd);
};

const normalizeClips = (document: Record<string, unknown>) =>
  (Array.isArray(document.clips) ? document.clips : [])
    .filter(isRecord)
    .filter((clip) => typeof (clip.url ?? clip.fileUrl ?? clip.source_url) === 'string')
    .sort((a, b) => {
      const aStart = numberOr(a.startTime ?? a.start_time_ms, 0);
      const bStart = numberOr(b.startTime ?? b.start_time_ms, 0);
      const aLayer = numberOr(a.layer ?? a.trackIndex, 0);
      const bLayer = numberOr(b.layer ?? b.trackIndex, 0);
      return aStart - bStart || aLayer - bLayer;
    });

const normalizeAudioTracks = (document: Record<string, unknown>, settings: DirectorCutRemotionSettings) => {
  if (settings.includeAudio === false) return [];

  return (Array.isArray(document.audioTracks) ? document.audioTracks : [])
    .filter(isRecord)
    .filter((track) => typeof (track.url ?? track.storagePath ?? track.storage_path) === 'string')
    .sort((a, b) => {
      const aStart = numberOr(a.startTime ?? a.start_time_ms, 0);
      const bStart = numberOr(b.startTime ?? b.start_time_ms, 0);
      const aTrack = numberOr(a.trackIndex, 0);
      const bTrack = numberOr(b.trackIndex, 0);
      return aStart - bStart || aTrack - bTrack;
    });
};

const normalizeKeyframes = (document: Record<string, unknown>, clips: Record<string, unknown>[], audioTracks: Record<string, unknown>[]) => {
  const targetIds = new Set(
    [...clips, ...audioTracks]
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  return (Array.isArray(document.keyframes) ? document.keyframes : [])
    .filter(isRecord)
    .filter((keyframe) => {
      const targetId = keyframe.targetId ?? keyframe.target_id;
      return typeof targetId === 'string' && targetIds.has(targetId);
    })
    .sort((a, b) => {
      const aTarget = stringOr(a.targetId ?? a.target_id, '');
      const bTarget = stringOr(b.targetId ?? b.target_id, '');
      const aTime = numberOr(a.time ?? a.time_ms, 0);
      const bTime = numberOr(b.time ?? b.time_ms, 0);
      return aTarget.localeCompare(bTarget) || aTime - bTime;
    });
};

export function resolveDirectorCutRenderBackend(settings: DirectorCutRemotionSettings = {}) {
  return settings.renderBackend === 'remotion_worker' ? 'remotion_worker' : 'fal_remote';
}

export function buildDirectorCutRemotionManifest(
  timelineDocument: unknown,
  settings: DirectorCutRemotionSettings = {},
  createdAt = new Date().toISOString()
): DirectorCutRemotionManifest {
  const document = isRecord(timelineDocument) ? timelineDocument : {};
  const clips = normalizeClips(document);
  const audioTracks = normalizeAudioTracks(document, settings);
  const keyframes = normalizeKeyframes(document, clips, audioTracks);
  const composition = normalizeComposition(document.composition, settings);
  const duration = getTimelineDurationMs(clips, audioTracks, composition.duration);
  const renderComposition = { ...composition, duration };

  return {
    renderer: 'remotion',
    version: 1,
    entryPoint: 'remotion/index.ts',
    compositionId: 'VideoEditorComposition',
    inputProps: {
      clips,
      audioTracks,
      composition: renderComposition,
      selectedClipIds: [],
      keyframes,
    },
    output: {
      format: 'mp4',
      codec: 'h264',
      width: renderComposition.width,
      height: renderComposition.height,
      fps: renderComposition.fps,
      durationMs: renderComposition.duration,
      durationInFrames: getDurationInFrames(renderComposition.duration, renderComposition.fps),
    },
    createdAt,
  };
}
