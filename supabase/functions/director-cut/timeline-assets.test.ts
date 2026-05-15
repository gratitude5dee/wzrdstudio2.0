import { describe, expect, it } from 'vitest';
import {
  buildEditorTimelineAssetRows,
  isRemoteFetchableUrl,
  mapTimelineAssetsToExportAssets,
  type TimelineAssetRow,
} from './timeline-assets.ts';

describe('director-cut timeline asset helpers', () => {
  it('builds editor timeline rows with cached metadata and keyed animation state', () => {
    const result = buildEditorTimelineAssetRows(
      {
        clips: [
          {
            id: 'clip-1',
            type: 'video',
            name: 'Opening clip',
            url: 'https://example.com/opening.mp4',
            thumbnailUrl: 'https://example.com/opening.jpg',
            previewUrl: 'https://example.com/opening-preview.mp4',
            mediaMetadata: { duration_ms: 4000, width: 1920, height: 1080 },
            startTime: 1000,
            duration: 4000,
            endTime: 5000,
            layer: 1,
            trimStart: 250,
            transforms: {
              position: { x: 12, y: 0 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              opacity: 1,
            },
            transition: { type: 'fade', duration: 500 },
            effects: [{ id: 'contrast', params: { value: 120 } }],
          },
          {
            id: 'missing-url',
            type: 'image',
            name: 'Skipped',
          },
        ],
        audioTracks: [
          {
            id: 'audio-1',
            type: 'audio',
            name: 'Narration VO',
            url: 'https://example.com/voice.mp3',
            previewUrl: 'https://example.com/voice-preview.mp3',
            mediaMetadata: { duration_ms: 3500, channels: 2 },
            startTime: 1200,
            duration: 3500,
            endTime: 4700,
            volume: 0.7,
            isMuted: false,
          },
        ],
        keyframes: [
          {
            id: 'kf-1',
            targetId: 'clip-1',
            time: 2500,
            properties: { transforms: { position: { x: 30, y: 0 } } },
          },
          {
            id: 'orphan-kf',
            targetId: 'missing-url',
            time: 2500,
            properties: {},
          },
        ],
        composition: {
          width: 1920,
          height: 1080,
          fps: 30,
          aspectRatio: '16:9',
          duration: 5000,
          backgroundColor: '#000000',
        },
      },
      'project-1',
      'user-1'
    );

    expect(result?.summary).toEqual({
      totalShots: 2,
      syncedAssets: 2,
      readyVideos: 1,
      fallbackImages: 0,
      missingShots: 1,
      source: 'editor_timeline',
    });
    expect(result?.rows[0]).toMatchObject({
      project_id: 'project-1',
      user_id: 'user-1',
      position_order: 0,
      asset_type: 'video',
      source_url: 'https://example.com/opening.mp4',
      duration_ms: 4000,
      metadata: {
        thumbnail_url: 'https://example.com/opening.jpg',
        preview_url: 'https://example.com/opening-preview.mp4',
        media_metadata: { duration_ms: 4000, width: 1920, height: 1080 },
        trim_start_ms: 250,
        keyframes: [
          {
            id: 'kf-1',
            targetId: 'clip-1',
            time: 2500,
            properties: { transforms: { position: { x: 30, y: 0 } } },
          },
        ],
      },
    });
    expect(result?.rows[1]).toMatchObject({
      asset_type: 'audio',
      duration_ms: 3500,
      metadata: {
        asset_role: 'voiceover',
        preview_url: 'https://example.com/voice-preview.mp3',
        media_metadata: { duration_ms: 3500, channels: 2 },
        volume: 0.7,
      },
    });
  });

  it('maps persisted timeline rows into export assets', () => {
    const rows: TimelineAssetRow[] = [
      {
        id: 'visual-1',
        position_order: 0,
        asset_type: 'image',
        source_url: 'https://example.com/shot.png',
        duration_ms: 5000,
        metadata: { asset_role: 'shot_visual', thumbnail_url: 'https://example.com/shot.png' },
      },
      {
        id: 'music-1',
        position_order: 1,
        asset_type: 'audio',
        source_url: 'https://example.com/music.mp3',
        duration_ms: 5000,
        metadata: { asset_role: 'music' },
      },
      {
        id: 'local-preview',
        position_order: 2,
        asset_type: 'video',
        source_url: 'blob:http://localhost/preview',
        duration_ms: 1000,
        metadata: { asset_role: 'shot_visual' },
      },
    ];

    expect(mapTimelineAssetsToExportAssets(rows)).toEqual([
      {
        id: 'visual-1',
        type: 'image',
        subtype: 'visual',
        url: 'https://example.com/shot.png',
        duration_ms: 5000,
        order_index: 0,
        metadata: { asset_role: 'shot_visual', thumbnail_url: 'https://example.com/shot.png' },
      },
      {
        id: 'music-1',
        type: 'audio',
        subtype: 'music',
        url: 'https://example.com/music.mp3',
        duration_ms: 5000,
        order_index: 1,
        metadata: { asset_role: 'music' },
      },
    ]);
  });

  it('skips non-fetchable editor media URLs before Director Cut export', () => {
    expect(isRemoteFetchableUrl('https://example.com/media.mp4')).toBe(true);
    expect(isRemoteFetchableUrl('http://example.com/media.mp4')).toBe(true);
    expect(isRemoteFetchableUrl('blob:http://localhost/preview')).toBe(false);
    expect(isRemoteFetchableUrl('file:///tmp/source.mp4')).toBe(false);
    expect(isRemoteFetchableUrl('/placeholder-video.mp4')).toBe(false);

    const result = buildEditorTimelineAssetRows(
      {
        clips: [
          { id: 'blob-video', type: 'video', url: 'blob:http://localhost/preview', duration: 1000 },
          { id: 'file-video', type: 'video', url: 'file:///tmp/source.mp4', duration: 1000 },
          { id: 'relative-video', type: 'video', url: '/placeholder-video.mp4', duration: 1000 },
          { id: 'remote-image', type: 'image', url: 'https://example.com/still.png', duration: 2000 },
        ],
        audioTracks: [
          { id: 'data-audio', type: 'audio', url: 'data:audio/mp3;base64,AAAA', duration: 1000 },
          { id: 'remote-music', type: 'audio', name: 'Music', url: 'https://example.com/music.mp3', duration: 2000 },
        ],
        keyframes: [],
        composition: {},
      },
      'project-1',
      'user-1'
    );

    expect(result?.summary).toEqual({
      totalShots: 4,
      syncedAssets: 2,
      readyVideos: 0,
      fallbackImages: 1,
      missingShots: 3,
      source: 'editor_timeline',
    });
    expect(result?.rows.map((row) => row.source_url)).toEqual([
      'https://example.com/still.png',
      'https://example.com/music.mp3',
    ]);
  });

  it('keeps saved editor timelines authoritative when visual clips are not remotely fetchable', () => {
    const result = buildEditorTimelineAssetRows(
      {
        source: 'worldstudio-editor',
        clips: [
          { id: 'blob-video', type: 'video', url: 'blob:http://localhost/preview', duration: 1000 },
          { id: 'relative-image', type: 'image', url: '/placeholder-image.jpg', duration: 2000 },
        ],
        audioTracks: [],
        keyframes: [],
        composition: {},
      },
      'project-1',
      'user-1'
    );

    expect(result).toEqual({
      rows: [],
      summary: {
        totalShots: 2,
        syncedAssets: 0,
        readyVideos: 0,
        fallbackImages: 0,
        missingShots: 2,
        source: 'editor_timeline',
      },
    });
  });

  it('keeps audio-only saved editor timelines authoritative for the visual export gate', () => {
    const result = buildEditorTimelineAssetRows(
      {
        version: 1,
        source: 'worldstudio-editor',
        clips: [],
        audioTracks: [
          { id: 'remote-music', type: 'audio', name: 'Music', url: 'https://example.com/music.mp3', duration: 2000 },
        ],
        keyframes: [],
        composition: { width: 1280, height: 720, duration: 2000 },
      },
      'project-1',
      'user-1'
    );

    expect(result?.summary).toEqual({
      totalShots: 0,
      syncedAssets: 1,
      readyVideos: 0,
      fallbackImages: 0,
      missingShots: 0,
      source: 'editor_timeline',
    });
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0]).toMatchObject({
      asset_type: 'audio',
      source_url: 'https://example.com/music.mp3',
    });
  });
});
