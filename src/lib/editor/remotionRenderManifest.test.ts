import { describe, expect, it } from 'vitest';
import type { AudioTrack, Clip, CompositionSettings, Keyframe } from '@/store/videoEditorStore';
import {
  EDITOR_REMOTION_COMPOSITION_ID,
  EDITOR_REMOTION_ENTRY_POINT,
  buildEditorRemotionInputProps,
  buildEditorRemotionRenderManifest,
} from './remotionRenderManifest';

const composition: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 24,
  aspectRatio: '16:9',
  duration: 1000,
  backgroundColor: '#111111',
};

const clip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Shot',
  url: 'https://example.com/shot.mp4',
  startTime: 500,
  duration: 2500,
  layer: 0,
  transforms: {
    position: { x: 10, y: 20 },
    scale: { x: 1.1, y: 1.1 },
    rotation: 3,
    opacity: 0.9,
  },
  transition: { type: 'fade', duration: 400 },
  effects: [{ id: 'contrast', name: 'Contrast', type: 'adjustment', params: { value: 110 } }],
  ...overrides,
});

const audioTrack = (overrides: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 'audio-1',
  type: 'audio',
  name: 'Music',
  url: 'https://example.com/music.mp3',
  startTime: 0,
  duration: 6000,
  volume: 1,
  isMuted: false,
  ...overrides,
});

const keyframe = (overrides: Partial<Keyframe> = {}): Keyframe => ({
  id: 'keyframe-1',
  targetId: 'clip-1',
  time: 1500,
  properties: {
    transforms: {
      position: { x: 40, y: 60 },
      scale: { x: 1.2, y: 1.2 },
      rotation: 8,
      opacity: 1,
    },
  },
  ...overrides,
});

describe('remotionRenderManifest', () => {
  it('builds full editor composition props from a timeline document', () => {
    const props = buildEditorRemotionInputProps({
      clips: [clip()],
      audioTracks: [audioTrack()],
      keyframes: [keyframe()],
      composition,
    });

    expect(props.clips).toHaveLength(1);
    expect(props.audioTracks).toHaveLength(1);
    expect(props.keyframes).toHaveLength(1);
    expect(props.selectedClipIds).toEqual([]);
    expect(props.composition).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 24,
      duration: 6000,
      backgroundColor: '#111111',
    });
    expect(props.clips[0].effects?.[0].id).toBe('contrast');
    expect(props.clips[0].transition?.type).toBe('fade');
  });

  it('builds a stable Remotion render manifest for worker execution', () => {
    expect(
      buildEditorRemotionRenderManifest(
        {
          clips: [clip()],
          audioTracks: [audioTrack()],
          keyframes: [keyframe()],
          composition,
        },
        '2026-05-13T00:00:00.000Z'
      )
    ).toMatchObject({
      renderer: 'remotion',
      version: 1,
      entryPoint: EDITOR_REMOTION_ENTRY_POINT,
      compositionId: EDITOR_REMOTION_COMPOSITION_ID,
      output: {
        format: 'mp4',
        codec: 'h264',
        width: 1920,
        height: 1080,
        fps: 24,
        durationMs: 6000,
        durationInFrames: 144,
      },
      createdAt: '2026-05-13T00:00:00.000Z',
    });
  });
});
