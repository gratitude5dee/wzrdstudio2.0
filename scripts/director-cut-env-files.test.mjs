import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDirectorCutEnv, parseEnvFile } from './director-cut-env-files.mjs';

describe('director-cut env file loading', () => {
  it('parses dotenv-style values without exposing or expanding secrets', () => {
    expect(
      parseEnvFile(`
# comment
SUPABASE_URL=https://example.supabase.co
SUPABASE_SERVICE_ROLE_KEY="service role # kept"
FAL_KEY='fal-secret'
SUPABASE_ACCESS_TOKEN=token # inline comment
export VITE_SUPABASE_ANON_KEY=anon
`)
    ).toEqual({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service role # kept',
      FAL_KEY: 'fal-secret',
      SUPABASE_ACCESS_TOKEN: 'token',
      VITE_SUPABASE_ANON_KEY: 'anon',
    });
  });

  it('loads example, base, local, and shell values with expected precedence', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'worldstudio-director-cut-env-'));
    try {
      writeFileSync(
        path.join(cwd, '.env.example'),
        'SUPABASE_URL=https://example.supabase.co\nFAL_KEY=\n'
      );
      writeFileSync(path.join(cwd, '.env'), 'FAL_KEY=from-env\nSUPABASE_ACCESS_TOKEN=from-env\n');
      writeFileSync(path.join(cwd, '.env.local'), 'FAL_KEY=from-local\n');

      expect(
        loadDirectorCutEnv({
          cwd,
          env: {
            SUPABASE_ACCESS_TOKEN: 'from-shell',
          },
        })
      ).toMatchObject({
        SUPABASE_URL: 'https://example.supabase.co',
        FAL_KEY: 'from-local',
        SUPABASE_ACCESS_TOKEN: 'from-shell',
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ignores missing env files', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'worldstudio-director-cut-env-'));
    try {
      mkdirSync(path.join(cwd, 'nested'));
      expect(loadDirectorCutEnv({ cwd: path.join(cwd, 'nested'), env: {} })).toEqual({});
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
