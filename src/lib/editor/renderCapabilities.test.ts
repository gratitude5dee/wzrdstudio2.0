import { describe, expect, it } from 'vitest';
import type { Clip, Keyframe } from '@/store/videoEditorStore';
import { collectRemoteRenderWarnings, isRemoteFetchableMediaUrl } from './renderCapabilities';

const clip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Clip',
  url: 'https://example.com/clip.mp4',
  startTime: 0,
  duration: 3000,
  layer: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
  ...overrides,
});

describe('collectRemoteRenderWarnings', () => {
  it('detects media URLs that remote renderers can fetch', () => {
    expect(isRemoteFetchableMediaUrl('https://example.com/clip.mp4')).toBe(true);
    expect(isRemoteFetchableMediaUrl('http://example.com/clip.mp4')).toBe(true);
    expect(isRemoteFetchableMediaUrl('blob:http://localhost/clip')).toBe(false);
    expect(isRemoteFetchableMediaUrl('file:///tmp/clip.mp4')).toBe(false);
    expect(isRemoteFetchableMediaUrl('/placeholder-video.mp4')).toBe(false);
  });

  it('returns no warnings for timing-only clips', () => {
    expect(collectRemoteRenderWarnings([clip()], [])).toEqual([]);
  });

  it('reports editor styling that the current remote renderer cannot apply', () => {
    const keyframe: Keyframe = {
      id: 'kf-1',
      targetId: 'styled',
      time: 1000,
      properties: { transforms: {} },
    };

    expect(
      collectRemoteRenderWarnings(
        [
          clip({
            id: 'styled',
            name: 'Styled clip',
            transforms: {
              position: { x: 12, y: 0 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              opacity: 1,
            },
            transition: { type: 'fade', duration: 500 },
            effects: [{ id: 'brightness', name: 'Brightness', type: 'adjustment', params: { value: 120 } }],
          }),
        ],
        [keyframe]
      )
    ).toEqual([
      {
        clipId: 'styled',
        clipName: 'Styled clip',
        features: ['transform', 'transition', 'effect', 'keyframe'],
        reason: expect.stringContaining('Remotion/FFmpeg renderer'),
      },
    ]);
  });
});
