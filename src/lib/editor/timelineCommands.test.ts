import { describe, expect, it } from 'vitest';
import type { AudioTrack, Clip, Keyframe } from '@/store/videoEditorStore';
import {
  deleteTimelineSelection,
  duplicateTimelineSelection,
  moveTimelineSelection,
  splitClipAtTime,
  type TimelineCommandState,
} from './timelineCommands';

const clip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Clip 1',
  url: 'https://example.com/source.mp4',
  startTime: 1000,
  duration: 6000,
  endTime: 7000,
  layer: 0,
  trimStart: 500,
  trimEnd: 1000,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
  ...overrides,
});

const audioTrack = (overrides: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 'audio-1',
  type: 'audio',
  name: 'Audio 1',
  url: 'https://example.com/audio.mp3',
  startTime: 2000,
  duration: 1000,
  endTime: 3000,
  volume: 1,
  isMuted: false,
  trackIndex: 0,
  ...overrides,
});

const keyframe = (overrides: Partial<Keyframe> = {}): Keyframe => ({
  id: 'keyframe-1',
  targetId: 'clip-1',
  time: 2000,
  properties: { transforms: clip().transforms },
  ...overrides,
});

const state = (overrides: Partial<TimelineCommandState> = {}): TimelineCommandState => ({
  clips: [clip()],
  audioTracks: [],
  keyframes: [],
  ...overrides,
});

const ids = (...values: string[]) => {
  let index = 0;
  return () => values[index++] ?? `id-${index}`;
};

describe('timeline commands', () => {
  it('splits video clips while preserving source trim metadata and retargeting right-side keyframes', () => {
    const result = splitClipAtTime(
      state({
        keyframes: [
          keyframe({ id: 'before', time: 2500 }),
          keyframe({ id: 'after', time: 5000 }),
        ],
      }),
      'clip-1',
      4000,
      ids('clip-right')
    );

    expect(result?.selectedClipIds).toEqual(['clip-1', 'clip-right']);
    expect(result?.clips).toMatchObject([
      {
        id: 'clip-1',
        startTime: 1000,
        duration: 3000,
        endTime: 4000,
        trimStart: 500,
        trimEnd: 4000,
      },
      {
        id: 'clip-right',
        startTime: 4000,
        duration: 3000,
        endTime: 7000,
        trimStart: 3500,
        trimEnd: 1000,
      },
    ]);
    expect(result?.keyframes.map((item) => ({ id: item.id, targetId: item.targetId, time: item.time }))).toEqual([
      { id: 'before', targetId: 'clip-1', time: 2500 },
      { id: 'after', targetId: 'clip-right', time: 5000 },
    ]);
  });

  it('rejects splits that would create unusably short clip segments', () => {
    expect(splitClipAtTime(state(), 'clip-1', 1050, ids('clip-right'))).toBeNull();
    expect(splitClipAtTime(state(), 'missing', 4000, ids('clip-right'))).toBeNull();
  });

  it('duplicates selected clips, audio, and their keyframes as one command', () => {
    const result = duplicateTimelineSelection(
      state({
        clips: [clip({ id: 'clip-1', startTime: 1000, duration: 1000, endTime: 2000 })],
        audioTracks: [audioTrack({ id: 'audio-1', startTime: 500, duration: 2000, endTime: 2500 })],
        keyframes: [keyframe({ id: 'kf-1', targetId: 'clip-1', time: 1200 })],
      }),
      { clipIds: ['clip-1'], audioTrackIds: ['audio-1'] },
      250,
      ids('clip-copy', 'audio-copy', 'kf-copy')
    );

    expect(result.duplicatedClipIds).toEqual(['clip-copy']);
    expect(result.duplicatedAudioTrackIds).toEqual(['audio-copy']);
    expect(result.clips.find((item) => item.id === 'clip-copy')).toMatchObject({
      startTime: 1250,
      endTime: 2250,
    });
    expect(result.audioTracks.find((item) => item.id === 'audio-copy')).toMatchObject({
      startTime: 750,
      endTime: 2750,
    });
    expect(result.keyframes.find((item) => item.id === 'kf-copy')).toMatchObject({
      targetId: 'clip-copy',
      time: 1450,
    });
  });

  it('ripple deletes selected items and shifts later timeline items and keyframes', () => {
    const result = deleteTimelineSelection(
      state({
        clips: [
          clip({ id: 'a', startTime: 0, duration: 1000, endTime: 1000 }),
          clip({ id: 'b', startTime: 1000, duration: 1000, endTime: 2000 }),
          clip({ id: 'c', startTime: 3000, duration: 1000, endTime: 4000 }),
        ],
        audioTracks: [audioTrack({ id: 'audio-1', startTime: 2000, duration: 1000, endTime: 3000 })],
        keyframes: [
          keyframe({ id: 'deleted', targetId: 'b', time: 1500 }),
          keyframe({ id: 'shifted', targetId: 'c', time: 3500 }),
        ],
      }),
      { clipIds: ['b'] },
      { ripple: true }
    );

    expect(result.deletedClipIds).toEqual(['b']);
    expect(result.clips.map((item) => ({ id: item.id, startTime: item.startTime, endTime: item.endTime }))).toEqual([
      { id: 'a', startTime: 0, endTime: 1000 },
      { id: 'c', startTime: 2000, endTime: 3000 },
    ]);
    expect(result.audioTracks[0]).toMatchObject({ id: 'audio-1', startTime: 1000, endTime: 2000 });
    expect(result.keyframes).toEqual([
      expect.objectContaining({ id: 'shifted', targetId: 'c', time: 2500 }),
    ]);
  });

  it('moves grouped timeline selections and keeps their keyframes aligned', () => {
    const result = moveTimelineSelection(
      state({
        clips: [
          clip({ id: 'a', startTime: 1000, duration: 1000, endTime: 2000 }),
          clip({ id: 'b', startTime: 2500, duration: 500, endTime: 3000 }),
        ],
        audioTracks: [audioTrack({ id: 'audio-1', startTime: 1500, duration: 1000, endTime: 2500 })],
        keyframes: [
          keyframe({ id: 'a-kf', targetId: 'a', time: 1200 }),
          keyframe({ id: 'b-kf', targetId: 'b', time: 2700 }),
          keyframe({ id: 'audio-kf', targetId: 'audio-1', time: 1700 }),
        ],
      }),
      { clipIds: ['a'], audioTrackIds: ['audio-1'] },
      500
    );

    expect(result.appliedDeltaMs).toBe(500);
    expect(result.clips).toMatchObject([
      { id: 'a', startTime: 1500, endTime: 2500 },
      { id: 'b', startTime: 2500, endTime: 3000 },
    ]);
    expect(result.audioTracks).toMatchObject([
      { id: 'audio-1', startTime: 2000, endTime: 3000 },
    ]);
    expect(result.keyframes.map((item) => ({ id: item.id, time: item.time }))).toEqual([
      { id: 'a-kf', time: 1700 },
      { id: 'audio-kf', time: 2200 },
      { id: 'b-kf', time: 2700 },
    ]);
  });

  it('clamps grouped moves at the start of the timeline without collapsing spacing', () => {
    const result = moveTimelineSelection(
      state({
        clips: [
          clip({ id: 'a', startTime: 300, duration: 500, endTime: 800 }),
          clip({ id: 'b', startTime: 700, duration: 500, endTime: 1200 }),
        ],
      }),
      { clipIds: ['a', 'b'] },
      -1000
    );

    expect(result.appliedDeltaMs).toBe(-300);
    expect(result.clips.map((item) => ({ id: item.id, startTime: item.startTime, endTime: item.endTime }))).toEqual([
      { id: 'a', startTime: 0, endTime: 500 },
      { id: 'b', startTime: 400, endTime: 900 },
    ]);
  });
});
