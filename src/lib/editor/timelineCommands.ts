import type { AudioTrack, Clip, Keyframe } from '@/store/videoEditorStore';

export interface TimelineCommandState {
  clips: Clip[];
  audioTracks: AudioTrack[];
  keyframes: Keyframe[];
}

export interface TimelineSelection {
  clipIds?: string[];
  audioTrackIds?: string[];
}

export interface SplitClipResult extends TimelineCommandState {
  selectedClipIds: string[];
}

export interface DeleteTimelineSelectionResult extends TimelineCommandState {
  deletedClipIds: string[];
  deletedAudioTrackIds: string[];
}

export interface DuplicateTimelineSelectionResult extends TimelineCommandState {
  duplicatedClipIds: string[];
  duplicatedAudioTrackIds: string[];
}

export interface MoveTimelineSelectionResult extends TimelineCommandState {
  movedClipIds: string[];
  movedAudioTrackIds: string[];
  appliedDeltaMs: number;
}

const MIN_CLIP_DURATION_MS = 200;

const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const defaultCreateId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const getEndTime = (item: Pick<Clip | AudioTrack, 'startTime' | 'duration' | 'endTime'>) =>
  typeof item.endTime === 'number' ? item.endTime : item.startTime + item.duration;

const sortClips = (clips: Clip[]) =>
  [...clips].sort((a, b) => (a.startTime - b.startTime) || (a.layer - b.layer));

const sortAudioTracks = (tracks: AudioTrack[]) =>
  [...tracks].sort((a, b) => (a.startTime - b.startTime) || ((a.trackIndex ?? 0) - (b.trackIndex ?? 0)));

const sortKeyframes = (keyframes: Keyframe[]) =>
  [...keyframes].sort((a, b) => (a.targetId.localeCompare(b.targetId)) || (a.time - b.time));

export function splitClipAtTime(
  state: TimelineCommandState,
  clipId: string,
  splitTimeMs: number,
  createId: () => string = defaultCreateId
): SplitClipResult | null {
  const clip = state.clips.find((item) => item.id === clipId);
  if (!clip) return null;

  const clipStart = clip.startTime;
  const clipEnd = getEndTime(clip);
  const firstDuration = splitTimeMs - clipStart;
  const secondDuration = clipEnd - splitTimeMs;
  if (firstDuration < MIN_CLIP_DURATION_MS || secondDuration < MIN_CLIP_DURATION_MS) {
    return null;
  }

  const rightClipId = createId();
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? 0;

  const leftClip: Clip = {
    ...cloneValue(clip),
    duration: firstDuration,
    endTime: splitTimeMs,
    trimEnd: clip.type === 'video' ? trimEnd + secondDuration : clip.trimEnd,
  };

  const rightClip: Clip = {
    ...cloneValue(clip),
    id: rightClipId,
    startTime: splitTimeMs,
    duration: secondDuration,
    endTime: clipEnd,
    trimStart: clip.type === 'video' ? trimStart + firstDuration : clip.trimStart,
    trimEnd: clip.type === 'video' ? trimEnd : clip.trimEnd,
  };

  const clips = sortClips(
    state.clips.flatMap((item) => (item.id === clipId ? [leftClip, rightClip] : [item]))
  );
  const keyframes = sortKeyframes(
    state.keyframes.map((keyframe) =>
      keyframe.targetId === clipId && keyframe.time > splitTimeMs
        ? { ...cloneValue(keyframe), targetId: rightClipId }
        : keyframe
    )
  );

  return {
    clips,
    audioTracks: sortAudioTracks(state.audioTracks),
    keyframes,
    selectedClipIds: [leftClip.id, rightClip.id],
  };
}

const mergeIntervals = (intervals: { start: number; end: number }[]) => {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
    } else {
      last.end = Math.max(last.end, interval.end);
    }
  }

  return merged;
};

const getRippleOffset = (time: number, intervals: { start: number; end: number }[]) =>
  intervals.reduce((offset, interval) => (time >= interval.end ? offset + interval.end - interval.start : offset), 0);

export function deleteTimelineSelection(
  state: TimelineCommandState,
  selection: TimelineSelection,
  options: { ripple?: boolean } = {}
): DeleteTimelineSelectionResult {
  const clipIds = new Set(selection.clipIds ?? []);
  const audioTrackIds = new Set(selection.audioTrackIds ?? []);
  const deletedClips = state.clips.filter((clip) => clipIds.has(clip.id));
  const deletedAudioTracks = state.audioTracks.filter((track) => audioTrackIds.has(track.id));
  const deletedTargetIds = new Set([...deletedClips.map((clip) => clip.id), ...deletedAudioTracks.map((track) => track.id)]);
  const intervals = options.ripple
    ? mergeIntervals(
        [...deletedClips, ...deletedAudioTracks].map((item) => ({
          start: item.startTime,
          end: getEndTime(item),
        }))
      )
    : [];

  const shiftItem = <T extends Clip | AudioTrack>(item: T): T => {
    const offset = getRippleOffset(item.startTime, intervals);
    if (offset <= 0) return item;
    return {
      ...item,
      startTime: Math.max(0, item.startTime - offset),
      endTime: typeof item.endTime === 'number' ? Math.max(0, item.endTime - offset) : undefined,
    };
  };

  return {
    clips: sortClips(state.clips.filter((clip) => !clipIds.has(clip.id)).map(shiftItem)),
    audioTracks: sortAudioTracks(state.audioTracks.filter((track) => !audioTrackIds.has(track.id)).map(shiftItem)),
    keyframes: sortKeyframes(
      state.keyframes
        .filter((keyframe) => !deletedTargetIds.has(keyframe.targetId))
        .map((keyframe) => {
          const offset = getRippleOffset(keyframe.time, intervals);
          return offset > 0 ? { ...keyframe, time: Math.max(0, keyframe.time - offset) } : keyframe;
        })
    ),
    deletedClipIds: deletedClips.map((clip) => clip.id),
    deletedAudioTrackIds: deletedAudioTracks.map((track) => track.id),
  };
}

export function duplicateTimelineSelection(
  state: TimelineCommandState,
  selection: TimelineSelection,
  offsetMs: number,
  createId: () => string = defaultCreateId
): DuplicateTimelineSelectionResult {
  const clipIds = new Set(selection.clipIds ?? []);
  const audioTrackIds = new Set(selection.audioTrackIds ?? []);
  const targetIdMap = new Map<string, string>();

  const duplicatedClips = state.clips
    .filter((clip) => clipIds.has(clip.id))
    .map((clip) => {
      const id = createId();
      targetIdMap.set(clip.id, id);
      return {
        ...cloneValue(clip),
        id,
        startTime: clip.startTime + offsetMs,
        endTime: typeof clip.endTime === 'number' ? clip.endTime + offsetMs : undefined,
      };
    });

  const duplicatedAudioTracks = state.audioTracks
    .filter((track) => audioTrackIds.has(track.id))
    .map((track) => {
      const id = createId();
      targetIdMap.set(track.id, id);
      return {
        ...cloneValue(track),
        id,
        startTime: track.startTime + offsetMs,
        endTime: typeof track.endTime === 'number' ? track.endTime + offsetMs : undefined,
      };
    });

  const duplicatedKeyframes = state.keyframes.flatMap((keyframe) => {
    const targetId = targetIdMap.get(keyframe.targetId);
    if (!targetId) return [];
    return [{
      ...cloneValue(keyframe),
      id: createId(),
      targetId,
      time: keyframe.time + offsetMs,
    }];
  });

  return {
    clips: sortClips([...state.clips, ...duplicatedClips]),
    audioTracks: sortAudioTracks([...state.audioTracks, ...duplicatedAudioTracks]),
    keyframes: sortKeyframes([...state.keyframes, ...duplicatedKeyframes]),
    duplicatedClipIds: duplicatedClips.map((clip) => clip.id),
    duplicatedAudioTrackIds: duplicatedAudioTracks.map((track) => track.id),
  };
}

export function moveTimelineSelection(
  state: TimelineCommandState,
  selection: TimelineSelection,
  deltaMs: number
): MoveTimelineSelectionResult {
  const clipIds = new Set(selection.clipIds ?? []);
  const audioTrackIds = new Set(selection.audioTrackIds ?? []);
  const selectedStarts = [
    ...state.clips.filter((clip) => clipIds.has(clip.id)).map((clip) => clip.startTime),
    ...state.audioTracks.filter((track) => audioTrackIds.has(track.id)).map((track) => track.startTime),
  ];
  const movedClipIds = state.clips.filter((clip) => clipIds.has(clip.id)).map((clip) => clip.id);
  const movedAudioTrackIds = state.audioTracks.filter((track) => audioTrackIds.has(track.id)).map((track) => track.id);
  const minStart = selectedStarts.length > 0 ? Math.min(...selectedStarts) : 0;
  const appliedDeltaMs = Math.max(deltaMs, -minStart);
  const movedTargetIds = new Set([...movedClipIds, ...movedAudioTrackIds]);

  if (movedTargetIds.size === 0 || appliedDeltaMs === 0) {
    return {
      clips: sortClips(state.clips),
      audioTracks: sortAudioTracks(state.audioTracks),
      keyframes: sortKeyframes(state.keyframes),
      movedClipIds,
      movedAudioTrackIds,
      appliedDeltaMs: 0,
    };
  }

  const moveItem = <T extends Clip | AudioTrack>(item: T): T => ({
    ...item,
    startTime: item.startTime + appliedDeltaMs,
    endTime: typeof item.endTime === 'number' ? item.endTime + appliedDeltaMs : undefined,
  });

  return {
    clips: sortClips(state.clips.map((clip) => (clipIds.has(clip.id) ? moveItem(clip) : clip))),
    audioTracks: sortAudioTracks(
      state.audioTracks.map((track) => (audioTrackIds.has(track.id) ? moveItem(track) : track))
    ),
    keyframes: sortKeyframes(
      state.keyframes.map((keyframe) =>
        movedTargetIds.has(keyframe.targetId)
          ? { ...keyframe, time: Math.max(0, keyframe.time + appliedDeltaMs) }
          : keyframe
      )
    ),
    movedClipIds,
    movedAudioTrackIds,
    appliedDeltaMs,
  };
}
