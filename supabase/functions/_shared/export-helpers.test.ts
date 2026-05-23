import { describe, expect, it } from 'vitest';
import {
  buildVideoTrimInput,
  buildComposeTracks,
  collectRenderWarnings,
  extractVideoUrl,
  type ExportAsset,
} from './export-helpers.ts';

const asset = (overrides: Partial<ExportAsset>): ExportAsset => ({
  id: 'asset-1',
  type: 'video',
  url: 'https://example.com/video.mp4',
  duration_ms: 4000,
  order_index: 0,
  metadata: {
    start_time_ms: 0,
    end_time_ms: 4000,
  },
  ...overrides,
});

describe('export helpers', () => {
  it('builds FAL compose tracks for visual and audio timeline assets', () => {
    const result = buildComposeTracks([
      asset({
        id: 'image-1',
        type: 'image',
        url: 'https://example.com/image.png',
        duration_ms: 5000,
        order_index: 0,
        metadata: { start_time_ms: 0, end_time_ms: 5000 },
      }),
      asset({
        id: 'video-1',
        type: 'video',
        url: 'https://example.com/video.mp4',
        duration_ms: 3000,
        order_index: 1,
        metadata: { start_time_ms: 5000, end_time_ms: 8000 },
      }),
      asset({
        id: 'music-1',
        type: 'audio',
        url: 'https://example.com/music.mp3',
        duration_ms: 7000,
        order_index: 2,
        metadata: { start_time_ms: 1000, end_time_ms: 8000 },
      }),
    ]);

    expect(result.shotFailures).toEqual([]);
    expect(result.audioTrackCount).toBe(1);
    expect(result.timelineDurationMs).toBe(8000);
    expect(result.tracks).toEqual([
      {
        id: 'visual-images',
        type: 'image',
        keyframes: [{ timestamp: 0, duration: 5000, url: 'https://example.com/image.png' }],
      },
      {
        id: 'visual-videos',
        type: 'video',
        keyframes: [{ timestamp: 5000, duration: 3000, url: 'https://example.com/video.mp4' }],
      },
      {
        id: 'audio-0-music-1',
        type: 'audio',
        keyframes: [{ timestamp: 1000, duration: 7000, url: 'https://example.com/music.mp3' }],
      },
    ]);
  });

  it('derives sequential visual timing when timeline metadata is absent', () => {
    const result = buildComposeTracks([
      asset({
        id: 'image-1',
        type: 'image',
        url: 'https://example.com/one.png',
        duration_ms: 2000,
        order_index: 0,
        metadata: {},
      }),
      asset({
        id: 'image-2',
        type: 'image',
        url: 'https://example.com/two.png',
        duration_ms: 3000,
        order_index: 1,
        metadata: {},
      }),
    ]);

    expect(result.tracks[0].keyframes).toEqual([
      { timestamp: 0, duration: 2000, url: 'https://example.com/one.png' },
      { timestamp: 2000, duration: 3000, url: 'https://example.com/two.png' },
    ]);
  });

  it('uses cached nested media metadata for compose durations', () => {
    const result = buildComposeTracks([
      asset({
        id: 'cached-video',
        type: 'video',
        duration_ms: undefined,
        order_index: 0,
        metadata: {
          start_time_ms: 250,
          media_metadata: {
            duration_ms: 2750,
            width: 1920,
            height: 1080,
          },
        },
      }),
    ]);

    expect(result.shotFailures).toEqual([]);
    expect(result.timelineDurationMs).toBe(3000);
    expect(result.tracks[0].keyframes).toEqual([
      { timestamp: 250, duration: 2750, url: 'https://example.com/video.mp4' },
    ]);
  });

  it('omits audio tracks when export settings disable audio', () => {
    const result = buildComposeTracks(
      [
        asset({ id: 'video-1' }),
        asset({
          id: 'music-1',
          type: 'audio',
          url: 'https://example.com/music.mp3',
          duration_ms: 4000,
          order_index: 1,
          metadata: { start_time_ms: 0 },
        }),
      ],
      { includeAudio: false }
    );

    expect(result.audioTrackCount).toBe(0);
    expect(result.tracks.some((track) => track.type === 'audio')).toBe(false);
  });

  it('reports visual assets that cannot be represented in compose input', () => {
    const result = buildComposeTracks([
      asset({
        id: 'video-without-duration',
        type: 'video',
        duration_ms: undefined,
        metadata: {},
      }),
    ]);

    expect(result.shotFailures).toEqual([
      {
        assetId: 'video-without-duration',
        orderIndex: 0,
        reason: 'Missing duration',
      },
    ]);
    expect(result.tracks).toEqual([]);
  });

  it('extracts video urls from FAL compose and merge responses', () => {
    expect(extractVideoUrl({ video_url: 'https://example.com/composed.mp4' })).toBe(
      'https://example.com/composed.mp4'
    );
    expect(extractVideoUrl({ video: { url: 'https://example.com/merged.mp4' } })).toBe(
      'https://example.com/merged.mp4'
    );
  });

  it('builds trim-video input from editor video in/out metadata', () => {
    expect(
      buildVideoTrimInput(
        asset({
          id: 'trimmed-video',
          type: 'video',
          url: 'https://example.com/source.mp4',
          duration_ms: 4500,
          metadata: {
            start_time_ms: 2000,
            end_time_ms: 6500,
            trim_start_ms: 1250,
            trim_end_ms: 3000,
          },
        })
      )
    ).toEqual({
      video_url: 'https://example.com/source.mp4',
      start_time: 1.25,
      duration: 4.5,
    });
  });

  it('does not build trim-video input for untrimmed or non-video assets', () => {
    expect(buildVideoTrimInput(asset({ id: 'video-without-trim' }))).toBeNull();
    expect(
      buildVideoTrimInput(
        asset({
          id: 'image-with-trim',
          type: 'image',
          url: 'https://example.com/image.png',
          metadata: { trim_start_ms: 1000 },
        })
      )
    ).toBeNull();
  });

  it('reports editor-only render features unsupported by the FAL compose backend', () => {
    expect(
      collectRenderWarnings([
        asset({
          id: 'styled-clip',
          metadata: {
            transforms: {
              position: { x: 24, y: 0 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              opacity: 1,
            },
            transition: { type: 'fade', duration: 500 },
            effects: [{ id: 'brightness', params: { value: 120 } }],
            keyframes: [{ id: 'kf-1', targetId: 'styled-clip', time: 1000 }],
          },
        }),
      ])
    ).toEqual([
      {
        assetId: 'styled-clip',
        orderIndex: 0,
        features: ['transform', 'transition', 'effect', 'keyframe'],
        reason: expect.stringContaining('FAL compose renders timing and media URLs only'),
      },
    ]);
  });
});
