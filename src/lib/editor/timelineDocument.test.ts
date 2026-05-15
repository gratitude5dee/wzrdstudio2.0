import { describe, expect, it } from 'vitest';
import {
  createEditorTimelineDocument,
  getTimelineDurationMs,
  parseEditorTimelineDocument,
} from './timelineDocument';
import type { AudioTrack, Clip, CompositionSettings, Keyframe } from '@/store/videoEditorStore';

const composition: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  duration: 0,
  backgroundColor: '#000000',
};

const clip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Shot 1',
  url: 'https://example.com/shot.mp4',
  startTime: 1000,
  duration: 4000,
  endTime: 5000,
  layer: 0,
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
  name: 'Music',
  url: 'https://example.com/music.mp3',
  startTime: 0,
  duration: 7000,
  endTime: 7000,
  volume: 1,
  isMuted: false,
  ...overrides,
});

const keyframe = (overrides: Partial<Keyframe> = {}): Keyframe => ({
  id: 'keyframe-1',
  targetId: 'clip-1',
  time: 2000,
  properties: {
    transforms: {
      position: { x: 10, y: 20 },
      scale: { x: 1.2, y: 1.2 },
      rotation: 5,
      opacity: 0.8,
    },
  },
  ...overrides,
});

describe('timelineDocument', () => {
  it('serializes clips, audio tracks, composition, and derived duration', () => {
    const document = createEditorTimelineDocument(
      [
        clip({
          thumbnailUrl: 'https://example.com/thumb.jpg',
          previewUrl: 'https://example.com/preview.mp4',
          mediaMetadata: { duration_ms: 4000, width: 1920, height: 1080 },
          effects: [{ id: 'brightness', name: 'Brightness', type: 'adjustment', params: { value: 120 } }],
        }),
      ],
      [audioTrack()],
      composition,
      [keyframe()]
    );

    expect(document.source).toBe('worldstudio-editor');
    expect(document.clips).toHaveLength(1);
    expect(document.audioTracks).toHaveLength(1);
    expect(document.keyframes).toHaveLength(1);
    expect(document.clips[0].effects).toHaveLength(1);
    expect(document.clips[0].thumbnailUrl).toBe('https://example.com/thumb.jpg');
    expect(document.clips[0].mediaMetadata?.duration_ms).toBe(4000);
    expect(document.composition.duration).toBe(7000);
  });

  it('parses persisted documents with defaults and stable ordering', () => {
    const parsed = parseEditorTimelineDocument({
      clips: [
        clip({ id: 'late', startTime: 3000 }),
        {
          ...clip({ id: 'early', startTime: 0, url: 'https://example.com/early.png', type: 'image' }),
          thumbnail_url: 'https://example.com/early-thumb.png',
          media_metadata: { width: 1024, height: 576 },
        },
        { id: 'missing-url' },
      ],
      audioTracks: [audioTrack({ id: 'audio-late', startTime: 500 }), audioTrack({ id: 'audio-early', startTime: 0 })],
      keyframes: [
        keyframe({ id: 'late-kf', targetId: 'late', time: 4000 }),
        keyframe({ id: 'early-kf', targetId: 'early', time: 1000 }),
        keyframe({ id: 'orphan-kf', targetId: 'missing', time: 1000 }),
      ],
      composition: { width: 1280, height: 720, fps: 24, aspectRatio: '16:9' },
    });

    expect(parsed.clips.map((item) => item.id)).toEqual(['early', 'late']);
    expect(parsed.audioTracks.map((item) => item.id)).toEqual(['audio-early', 'audio-late']);
    expect(parsed.keyframes.map((item) => item.id)).toEqual(['early-kf', 'late-kf']);
    expect(parsed.clips[0].thumbnailUrl).toBe('https://example.com/early-thumb.png');
    expect(parsed.clips[0].mediaMetadata?.width).toBe(1024);
    expect(parsed.composition.width).toBe(1280);
    expect(parsed.composition.duration).toBe(7500);
  });

  it('computes the end of mixed visual and audio timelines', () => {
    expect(getTimelineDurationMs(
      [clip({ startTime: 2000, duration: 3000 })],
      [audioTrack({ startTime: 1000, duration: 8000, endTime: 9000 })],
      1000
    )).toBe(9000);
  });
});
