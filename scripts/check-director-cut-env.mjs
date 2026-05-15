#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadDirectorCutEnv } from './director-cut-env-files.mjs';

const REQUIRED_ENV_BY_MODE = {
  client: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
  fal: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FAL_KEY'],
  remotion: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  runner: [
    'SUPABASE_URL|VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY',
    'SUPABASE_ACCESS_TOKEN',
  ],
};
const ALL_REQUIRED_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FAL_KEY',
  'SUPABASE_ACCESS_TOKEN',
];

const printUsage = () => {
  console.log(`
Usage:
  npm run director-cut:check-env
  npm run director-cut:check-env -- --mode remotion --json
  npm run director-cut:check-env -- --mode runner --json

Env setup:
  Values are read from .env.example, .env, .env.local, and then this shell.
  Copy .env.example to .env.local and fill in the blank secrets for live validation.

Options:
  --mode   client, fal, remotion, runner, or all. Defaults to all.
  --json   Print machine-readable JSON.
`);
};

export const parseArgs = (argv) => {
  const args = { mode: 'all', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === 'json' || key === 'help') {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

export const getRequiredEnvKeys = (mode = 'all') => {
  if (mode === 'all') {
    return ALL_REQUIRED_ENV_KEYS;
  }

  const keys = REQUIRED_ENV_BY_MODE[mode];
  if (!keys) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  return keys;
};

export const parseSupabaseProjectId = (configText) => {
  const match = configText.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? null;
};

export const readSupabaseProjectId = (
  configPath = path.resolve(process.cwd(), 'supabase', 'config.toml')
) => {
  if (!existsSync(configPath)) return null;
  return parseSupabaseProjectId(readFileSync(configPath, 'utf8'));
};

export const buildEnvHints = (missing, projectId) => {
  if (!projectId) return {};
  const supabaseUrl = `https://${projectId}.supabase.co`;
  const hints = {};
  if (missing.includes('SUPABASE_URL') || missing.includes('SUPABASE_URL|VITE_SUPABASE_URL')) {
    hints.SUPABASE_URL = supabaseUrl;
  }
  if (missing.includes('VITE_SUPABASE_URL') || missing.includes('SUPABASE_URL|VITE_SUPABASE_URL')) {
    hints.VITE_SUPABASE_URL = supabaseUrl;
  }
  return hints;
};

const isEnvSpecPresent = (env, spec) =>
  spec.split('|').some((key) => typeof env[key] === 'string' && env[key].length > 0);

export const checkEnv = (env = process.env, mode = 'all', options = {}) => {
  const keys = getRequiredEnvKeys(mode);
  const results = keys.map((key) => ({
    key,
    present: isEnvSpecPresent(env, key),
  }));

  return {
    mode,
    ok: results.every((result) => result.present),
    missing: results.filter((result) => !result.present).map((result) => result.key),
    hints: buildEnvHints(
      results.filter((result) => !result.present).map((result) => result.key),
      options.projectId ?? null
    ),
    results,
  };
};

const printTextResult = (result) => {
  console.log(`Director's Cut env preflight (${result.mode})`);
  for (const item of result.results) {
    console.log(`${item.key}=${item.present ? 'set' : 'missing'}`);
  }
  for (const [key, value] of Object.entries(result.hints)) {
    console.log(`hint.${key}=${value}`);
  }
  console.log(result.ok ? 'status=ready' : 'status=blocked');
};

export const main = (argv = process.argv.slice(2), env = loadDirectorCutEnv()) => {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  const result = checkEnv(env, args.mode, { projectId: readSupabaseProjectId() });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextResult(result);
  }

  return result.ok ? 0 : 1;
};

const isCliEntrypoint = () => process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;

if (isCliEntrypoint()) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exitCode = 1;
  }
}
