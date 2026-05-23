import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildEnvHints,
  checkEnv,
  getRequiredEnvKeys,
  main,
  parseSupabaseProjectId,
  parseArgs,
} from './check-director-cut-env.mjs';

describe('director-cut env preflight', () => {
  it('parses mode and JSON flags', () => {
    expect(parseArgs(['--mode', 'remotion', '--json'])).toEqual({
      mode: 'remotion',
      json: true,
    });
  });

  it('resolves required keys by validation mode', () => {
    expect(getRequiredEnvKeys('client')).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
    expect(getRequiredEnvKeys('fal')).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FAL_KEY']);
    expect(getRequiredEnvKeys('remotion')).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    expect(getRequiredEnvKeys('runner')).toEqual([
      'SUPABASE_URL|VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY',
      'SUPABASE_ACCESS_TOKEN',
    ]);
    expect(getRequiredEnvKeys('all')).toEqual([
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'FAL_KEY',
      'SUPABASE_ACCESS_TOKEN',
    ]);
  });

  it('keeps .env.example aligned with required validation variables', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const exampleKeys = new Set(
      Array.from(envExample.matchAll(/^([A-Z0-9_]+)=/gm), (match) => match[1])
    );
    const requiredKeys = Array.from(
      new Set(
        [...getRequiredEnvKeys('all'), ...getRequiredEnvKeys('runner')].flatMap((spec) =>
          spec.split('|')
        )
      )
    );

    expect(requiredKeys).not.toHaveLength(0);
    for (const key of requiredKeys) {
      expect(exampleKeys).toContain(key);
    }
  });

  it('keeps secret values blank in .env.example', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const envEntries = Object.fromEntries(
      Array.from(envExample.matchAll(/^([A-Z0-9_]+)=(.*)$/gm), (match) => [
        match[1],
        match[2].trim(),
      ])
    );

    for (const key of ['VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN', 'FAL_KEY']) {
      expect(envEntries[key]).toBe('');
    }
  });

  it('reports missing values without exposing secret contents', () => {
    expect(
      checkEnv(
        {
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: '',
          FAL_KEY: 'fal-secret',
        },
        'fal'
      )
    ).toEqual({
      mode: 'fal',
      ok: false,
      missing: ['SUPABASE_SERVICE_ROLE_KEY'],
      hints: {},
      results: [
        { key: 'SUPABASE_URL', present: true },
        { key: 'SUPABASE_SERVICE_ROLE_KEY', present: false },
        { key: 'FAL_KEY', present: true },
      ],
    });
  });

  it('supports alternate Supabase URL and anon key names for the CLI runner', () => {
    expect(
      checkEnv(
        {
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_ANON_KEY: 'anon-key',
          SUPABASE_ACCESS_TOKEN: 'user-token',
        },
        'runner'
      )
    ).toEqual({
      mode: 'runner',
      ok: true,
      missing: [],
      hints: {},
      results: [
        { key: 'SUPABASE_URL|VITE_SUPABASE_URL', present: true },
        { key: 'VITE_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY', present: true },
        { key: 'SUPABASE_ACCESS_TOKEN', present: true },
      ],
    });
  });

  it('derives non-secret Supabase URL hints from the project ref', () => {
    expect(parseSupabaseProjectId('project_id = "ixkkrousepsiorwlaycp"\n')).toBe(
      'ixkkrousepsiorwlaycp'
    );
    expect(
      buildEnvHints(
        ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_URL|VITE_SUPABASE_URL', 'FAL_KEY'],
        'ixkkrousepsiorwlaycp'
      )
    ).toEqual({
      SUPABASE_URL: 'https://ixkkrousepsiorwlaycp.supabase.co',
      VITE_SUPABASE_URL: 'https://ixkkrousepsiorwlaycp.supabase.co',
    });
  });

  it('returns process-style exit codes from main', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(
        main(['--mode', 'remotion', '--json'], {
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role',
        })
      ).toBe(0);

      expect(main(['--mode', 'remotion', '--json'], {})).toBe(1);
    } finally {
      log.mockRestore();
    }
  });
});
