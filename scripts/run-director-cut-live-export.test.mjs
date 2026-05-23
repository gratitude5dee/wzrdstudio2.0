import { describe, expect, it } from 'vitest';
import {
  buildDirectorCutCreateBody,
  buildDirectorCutStatusBody,
  buildExportSettings,
  buildFunctionUrl,
  buildRedactedDryRun,
  isSuccessfulRun,
  parseArgs,
  resolveRuntimeConfig,
  runDirectorCutExport,
} from './run-director-cut-live-export.mjs';

describe('run-director-cut-live-export helpers', () => {
  it('parses export runner arguments', () => {
    expect(
      parseArgs([
        '--project-id',
        'project-1',
        '--renderer',
        'styled',
        '--quality',
        'high',
        '--resolution',
        '1920x1080',
        '--fps',
        '30',
        '--wait',
        '--poll-interval-ms',
        '10',
        '--max-polls',
        '2',
        '--dry-run',
        '--json',
      ])
    ).toEqual({
      projectId: 'project-1',
      renderer: 'styled',
      quality: 'high',
      resolution: '1920x1080',
      fps: 30,
      wait: true,
      pollIntervalMs: 10,
      maxPolls: 2,
      dryRun: true,
      json: true,
    });

    expect(() =>
      parseArgs(['--project-id', 'project-1', '--renderer', 'fast', '--resolution', 'wide'])
    ).toThrow('--resolution must use WIDTHxHEIGHT with positive integers.');

    expect(() =>
      parseArgs(['--project-id', 'project-1', '--renderer', 'fast', '--fps', 'abc'])
    ).toThrow('--fps must be a positive number.');

    expect(() =>
      parseArgs(['--project-id', 'project-1', '--renderer', 'fast', '--max-polls', '0'])
    ).toThrow('--max-polls must be a positive number.');
  });

  it('builds Director Cut settings for fast and styled renderers', () => {
    expect(buildExportSettings({ renderer: 'fast', quality: 'medium', resolution: '1280x720', fps: 24 })).toEqual({
      resolution: '1280x720',
      fps: 24,
      quality: 'medium',
      includeAudio: true,
      codec: 'h264',
      renderBackend: 'fal_remote',
    });

    expect(buildExportSettings({ renderer: 'styled', quality: 'high', resolution: '1920x1080', fps: 30 })).toMatchObject({
      renderBackend: 'remotion_worker',
      resolution: '1920x1080',
      fps: 30,
    });
  });

  it('builds create and status request bodies', () => {
    expect(buildDirectorCutCreateBody({
      projectId: 'project-1',
      renderer: 'styled',
      quality: 'high',
      resolution: '1280x720',
      fps: 24,
    })).toMatchObject({
      action: 'create',
      projectId: 'project-1',
      settings: {
        renderBackend: 'remotion_worker',
      },
    });

    expect(buildDirectorCutStatusBody({ projectId: 'project-1', jobId: 'job-1' })).toEqual({
      action: 'status',
      projectId: 'project-1',
      jobId: 'job-1',
    });
  });

  it('resolves runtime config without exposing secrets in dry-run output', () => {
    const args = parseArgs(['--project-id', 'project-1', '--renderer', 'fast', '--dry-run']);
    expect(
      resolveRuntimeConfig(args, {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ACCESS_TOKEN: 'user-token',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toEqual({
      functionUrl: 'https://example.supabase.co/functions/v1/director-cut',
      accessToken: 'user-token',
      anonKey: 'anon-key',
    });

    expect(
      buildRedactedDryRun(args, {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ACCESS_TOKEN: 'user-token',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toMatchObject({
      url: 'https://example.supabase.co/functions/v1/director-cut',
      headers: {
        authorization: 'set',
        apikey: 'set',
      },
    });
  });

  it('normalizes Supabase function URLs', () => {
    expect(buildFunctionUrl('https://example.supabase.co/')).toBe(
      'https://example.supabase.co/functions/v1/director-cut'
    );
  });

  it('creates and polls an export through injected fetch and wait helpers', async () => {
    const requests = [];
    const responses = [
      { jobId: 'job-1', provider: 'fal_remote' },
      { status: 'processing', progress: 50, provider: 'fal_remote', providerStatus: 'processing' },
      { status: 'completed', progress: 100, provider: 'fal_remote', providerStatus: 'completed', outputUrl: 'https://example.com/out.mp4' },
    ];
    const fetchImpl = async (_url, init) => {
      requests.push(JSON.parse(init.body));
      const payload = responses.shift();
      return {
        ok: true,
        text: async () => JSON.stringify(payload),
      };
    };

    const result = await runDirectorCutExport({
      args: parseArgs([
        '--project-id',
        'project-1',
        '--renderer',
        'fast',
        '--wait',
        '--poll-interval-ms',
        '1',
        '--max-polls',
        '3',
      ]),
      env: {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ACCESS_TOKEN: 'user-token',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      },
      fetchImpl,
      waitImpl: async () => undefined,
    });

    expect(result).toMatchObject({
      projectId: 'project-1',
      renderer: 'fast',
      jobId: 'job-1',
      finalStatus: {
        status: 'completed',
        outputUrl: 'https://example.com/out.mp4',
      },
    });
    expect(requests).toEqual([
      expect.objectContaining({ action: 'create' }),
      { action: 'status', projectId: 'project-1', jobId: 'job-1' },
      { action: 'status', projectId: 'project-1', jobId: 'job-1' },
    ]);
    expect(isSuccessfulRun(result, { wait: true })).toBe(true);
  });

  it('marks waited runs unsuccessful when polling never reaches completion', async () => {
    const responses = [
      { jobId: 'job-1', provider: 'remotion_worker' },
      { status: 'processing', progress: 5, provider: 'remotion_worker', providerStatus: 'queued' },
    ];
    const fetchImpl = async (_url, init) => {
      JSON.parse(init.body);
      const payload = responses.shift();
      return {
        ok: true,
        text: async () => JSON.stringify(payload),
      };
    };
    const args = parseArgs([
      '--project-id',
      'project-1',
      '--renderer',
      'styled',
      '--wait',
      '--poll-interval-ms',
      '1',
      '--max-polls',
      '1',
    ]);

    const result = await runDirectorCutExport({
      args,
      env: {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ACCESS_TOKEN: 'user-token',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      },
      fetchImpl,
      waitImpl: async () => undefined,
    });

    expect(result).toMatchObject({
      jobId: 'job-1',
      timedOut: true,
      finalStatus: {
        status: 'processing',
        providerStatus: 'queued',
      },
    });
    expect(isSuccessfulRun(result, args)).toBe(false);
  });
});
