import { describe, expect, it } from 'vitest';
import {
  buildDirectorCutRemotionManifest,
  resolveDirectorCutRenderBackend,
} from './remotion-manifest.ts';

const timelineDocument = {
  clips: [
    {
      id: 'clip-1',
      type: 'video',
      name: 'Opening',
      url: 'https://example.com/opening.mp4',
      startTime: 1000,
      duration: 3000,
      endTime: 4000,
      layer: 1,
      transforms: {
        position: { x: 12, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
      },
    },
    {
      id: 'missing-url',
      type: 'image',
      name: 'Skipped',
      duration: 5000,
    },
  ],
  audioTracks: [
    {
      id: 'music-1',
      type: 'audio',
      name: 'Music',
      url: 'https://example.com/music.mp3',
      startTime: 0,
      duration: 6000,
      endTime: 6000,
    },
  ],
  keyframes: [
    {
      id: 'kf-1',
      targetId: 'clip-1',
      time: 2200,
      properties: { transforms: { opacity: 0.5 } },
    },
    {
      id: 'orphan-kf',
      targetId: 'missing-url',
      time: 1000,
      properties: {},
    },
  ],
  composition: {
    width: 1920,
    height: 1080,
    fps: 24,
    aspectRatio: '16:9',
    duration: 0,
    backgroundColor: '#101010',
  },
};

describe('director-cut remotion manifest helpers', () => {
  it('builds a worker manifest from the saved editor timeline document', () => {
    const manifest = buildDirectorCutRemotionManifest(
      timelineDocument,
      { resolution: '1280x720', fps: 30, includeAudio: true },
      '2026-05-13T22:00:00.000Z'
    );

    expect(manifest).toMatchObject({
      renderer: 'remotion',
      version: 1,
      entryPoint: 'remotion/index.ts',
      compositionId: 'VideoEditorComposition',
      createdAt: '2026-05-13T22:00:00.000Z',
      inputProps: {
        selectedClipIds: [],
        clips: [
          expect.objectContaining({
            id: 'clip-1',
            url: 'https://example.com/opening.mp4',
          }),
        ],
        audioTracks: [
          expect.objectContaining({
            id: 'music-1',
            url: 'https://example.com/music.mp3',
          }),
        ],
        keyframes: [
          expect.objectContaining({
            id: 'kf-1',
            targetId: 'clip-1',
          }),
        ],
        composition: expect.objectContaining({
          width: 1280,
          height: 720,
          fps: 30,
          duration: 6000,
        }),
      },
      output: {
        format: 'mp4',
        codec: 'h264',
        width: 1280,
        height: 720,
        fps: 30,
        durationMs: 6000,
        durationInFrames: 180,
      },
    });
  });

  it('omits audio tracks when export settings disable audio', () => {
    const manifest = buildDirectorCutRemotionManifest(
      timelineDocument,
      { includeAudio: false },
      '2026-05-13T22:00:00.000Z'
    );

    expect(manifest.inputProps.audioTracks).toEqual([]);
    expect(manifest.output.durationMs).toBe(4000);
  });

  it('keeps FAL as the default backend unless the worker is explicitly requested', () => {
    expect(resolveDirectorCutRenderBackend()).toBe('fal_remote');
    expect(resolveDirectorCutRenderBackend({ renderBackend: 'auto' })).toBe('fal_remote');
    expect(resolveDirectorCutRenderBackend({ renderBackend: 'remotion_worker' })).toBe('remotion_worker');
  });
});
