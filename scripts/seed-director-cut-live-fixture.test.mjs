import { describe, expect, it, vi } from 'vitest';
import {
  buildDirectorCutTimelineFixture,
  main,
  parseArgs,
  requireEnv,
  validatePublicMediaUrl,
} from './seed-director-cut-live-fixture.mjs';

const args = {
  projectId: 'project-1',
  userId: 'user-1',
  videoUrl: 'https://example.com/video.mp4',
  audioUrl: 'https://example.com/audio.mp3',
  durationMs: 3000,
  sourceDurationMs: 4000,
};

describe('seed-director-cut-live-fixture helpers', () => {
  it('parses required live fixture arguments', () => {
    expect(
      parseArgs([
        '--project-id',
        'project-1',
        '--user-id',
        'user-1',
        '--video-url',
        'https://example.com/video.mp4',
        '--audio-url',
        'https://example.com/audio.mp3',
        '--duration-ms',
        '5000',
        '--source-duration-ms',
        '6500',
        '--dry-run',
        '--json',
      ])
    ).toEqual({
      projectId: 'project-1',
      userId: 'user-1',
      videoUrl: 'https://example.com/video.mp4',
      audioUrl: 'https://example.com/audio.mp3',
      durationMs: 5000,
      sourceDurationMs: 6500,
      dryRun: true,
      json: true,
    });

    const requiredArgs = [
      '--project-id',
      'project-1',
      '--user-id',
      'user-1',
      '--video-url',
      'https://example.com/video.mp4',
      '--audio-url',
      'https://example.com/audio.mp3',
    ];
    expect(() => parseArgs([...requiredArgs, '--duration-ms', '0'])).toThrow(
      '--duration-ms must be a positive number.'
    );
    expect(() => parseArgs([...requiredArgs, '--source-duration-ms', 'abc'])).toThrow(
      '--source-duration-ms must be a positive number.'
    );
  });

  it('requires Supabase service credentials for writes', () => {
    expect(() => requireEnv({})).toThrow('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    expect(
      requireEnv({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      })
    ).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'service-role',
    });
  });

  it('rejects fixture media URLs that FAL cannot fetch remotely', () => {
    expect(validatePublicMediaUrl('https://example.com/video.mp4', '--video-url')).toBe(
      'https://example.com/video.mp4'
    );
    expect(() => validatePublicMediaUrl('file:///tmp/video.mp4', '--video-url')).toThrow(
      '--video-url must be a public http(s) URL.'
    );
    expect(() =>
      parseArgs([
        '--project-id',
        'project-1',
        '--user-id',
        'user-1',
        '--video-url',
        'blob:http://localhost/video',
        '--audio-url',
        'https://example.com/audio.mp3',
      ])
    ).toThrow('--video-url must be a public http(s) URL.');
  });

  it('builds a saved editor timeline with trim, audio, metadata, effects, and keyframes', () => {
    const fixture = buildDirectorCutTimelineFixture(args, '2026-05-13T23:00:00.000Z');
    expect(fixture.row).toMatchObject({
      project_id: 'project-1',
      user_id: 'user-1',
      duration_ms: 3000,
      resolution: '1280x720',
      frame_rate: 24,
    });

    expect(fixture.document.clips[0]).toMatchObject({
      id: 'live-fixture-video-1',
      type: 'video',
      url: 'https://example.com/video.mp4',
      trimStart: 500,
      trimEnd: 3500,
      transition: { type: 'fade' },
      mediaMetadata: { duration_ms: 4000 },
    });
    expect(fixture.document.clips[0].effects).toHaveLength(2);
    expect(fixture.document.audioTracks[0]).toMatchObject({
      id: 'live-fixture-audio-1',
      type: 'audio',
      url: 'https://example.com/audio.mp3',
      volume: 0.85,
    });
    expect(fixture.document.keyframes[0]).toMatchObject({
      targetId: 'live-fixture-video-1',
      properties: {
        transforms: {
          position: { x: 24, y: -12 },
        },
      },
    });
  });

  it('supports dry-run output without requiring Supabase env', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await expect(
        main([
          '--project-id',
          'project-1',
          '--user-id',
          'user-1',
          '--video-url',
          'https://example.com/video.mp4',
          '--audio-url',
          'https://example.com/audio.mp3',
          '--dry-run',
          '--json',
        ], {})
      ).resolves.toBe(0);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
