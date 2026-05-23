#!/usr/bin/env node
import { loadDirectorCutEnv } from './director-cut-env-files.mjs';

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLLS = 180;
const DEFAULT_QUALITY = 'high';
const DEFAULT_RESOLUTION = '1280x720';
const DEFAULT_FPS = 24;

const printUsage = () => {
  console.log(`
Usage:
  npm run director-cut:run-live-export -- --project-id <project_id> --renderer fast --wait
  npm run director-cut:run-live-export -- --project-id <project_id> --renderer styled --dry-run --json

Required environment for live runs:
  Values are read from .env.example, .env, .env.local, and then this shell.
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_ACCESS_TOKEN or --access-token <user_session_jwt>
  VITE_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY, or --anon-key <anon_key>

Options:
  --project-id          Project to export.
  --renderer            fast or styled. fast uses FAL; styled queues remotion_worker.
  --access-token        User session JWT for the project owner.
  --anon-key            Supabase anon key for edge function invocation.
  --supabase-url        Supabase project URL.
  --quality             low, medium, high, or 4k. Defaults to ${DEFAULT_QUALITY}.
  --resolution          Export resolution. Defaults to ${DEFAULT_RESOLUTION}.
  --fps                 Export fps. Defaults to ${DEFAULT_FPS}.
  --wait                Poll director-cut status until completion, failure, or timeout.
  --poll-interval-ms    Poll interval for --wait. Defaults to ${DEFAULT_POLL_INTERVAL_MS}.
  --max-polls           Maximum status polls for --wait. Defaults to ${DEFAULT_MAX_POLLS}.
  --json                Print machine-readable JSON.
  --dry-run             Print the request body without contacting Supabase.
`);
};

const parsePositiveNumberOption = (key, value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${key} must be a positive number.`);
  }
  return Math.round(parsed);
};

const parseResolutionOption = (value) => {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) {
    throw new Error('--resolution must use WIDTHxHEIGHT with positive integers.');
  }
  return `${Number(match[1])}x${Number(match[2])}`;
};

export const parseArgs = (argv) => {
  const args = {
    renderer: 'fast',
    quality: DEFAULT_QUALITY,
    resolution: DEFAULT_RESOLUTION,
    fps: DEFAULT_FPS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    maxPolls: DEFAULT_MAX_POLLS,
    wait: false,
    json: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === 'wait' || key === 'json' || key === 'dry-run' || key === 'help') {
      args[key === 'dry-run' ? 'dryRun' : key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    if (key === 'project-id') {
      args.projectId = value;
    } else if (key === 'renderer') {
      args.renderer = value;
    } else if (key === 'access-token') {
      args.accessToken = value;
    } else if (key === 'anon-key') {
      args.anonKey = value;
    } else if (key === 'supabase-url') {
      args.supabaseUrl = value;
    } else if (key === 'quality') {
      args.quality = value;
    } else if (key === 'resolution') {
      args.resolution = parseResolutionOption(value);
    } else if (key === 'fps') {
      args.fps = parsePositiveNumberOption(key, value);
    } else if (key === 'poll-interval-ms') {
      args.pollIntervalMs = parsePositiveNumberOption(key, value);
    } else if (key === 'max-polls') {
      args.maxPolls = parsePositiveNumberOption(key, value);
    } else {
      throw new Error(`Unsupported option: --${key}`);
    }
    index += 1;
  }

  if (!args.help && !args.projectId) {
    throw new Error('Missing required option: --project-id');
  }
  if (!['fast', 'styled'].includes(args.renderer)) {
    throw new Error('--renderer must be fast or styled.');
  }
  if (!['low', 'medium', 'high', '4k'].includes(args.quality)) {
    throw new Error('--quality must be low, medium, high, or 4k.');
  }

  return args;
};

export const buildExportSettings = (args) => ({
  resolution: args.resolution ?? DEFAULT_RESOLUTION,
  fps: args.fps ?? DEFAULT_FPS,
  quality: args.quality ?? DEFAULT_QUALITY,
  includeAudio: true,
  codec: 'h264',
  renderBackend: args.renderer === 'styled' ? 'remotion_worker' : 'fal_remote',
});

export const buildDirectorCutCreateBody = (args) => ({
  action: 'create',
  projectId: args.projectId,
  settings: buildExportSettings(args),
});

export const buildDirectorCutStatusBody = ({ projectId, jobId }) => ({
  action: 'status',
  projectId,
  jobId,
});

export const buildFunctionUrl = (supabaseUrl) => {
  if (typeof supabaseUrl !== 'string' || supabaseUrl.length === 0) {
    throw new Error('Supabase URL is required.');
  }
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/director-cut`;
};

export const resolveRuntimeConfig = (args, env = process.env) => {
  const supabaseUrl = args.supabaseUrl ?? env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const accessToken = args.accessToken ?? env.SUPABASE_ACCESS_TOKEN;
  const anonKey = args.anonKey ?? env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error('SUPABASE_URL or VITE_SUPABASE_URL is required.');
  if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN or --access-token is required.');
  if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY, or --anon-key is required.');

  return {
    functionUrl: buildFunctionUrl(supabaseUrl),
    accessToken,
    anonKey,
  };
};

export const buildRedactedDryRun = (args, env = process.env) => {
  const supabaseUrl = args.supabaseUrl ?? env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '<supabase-url>';
  const accessToken = args.accessToken ?? env.SUPABASE_ACCESS_TOKEN;
  const anonKey = args.anonKey ?? env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;

  return {
    url: buildFunctionUrl(supabaseUrl),
    method: 'POST',
    headers: {
      authorization: accessToken ? 'set' : 'missing',
      apikey: anonKey ? 'set' : 'missing',
    },
    body: buildDirectorCutCreateBody(args),
    wait: args.wait,
    pollIntervalMs: args.pollIntervalMs,
    maxPolls: args.maxPolls,
  };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const invokeDirectorCut = async ({ fetchImpl = fetch, config, body }) => {
  const response = await fetchImpl(config.functionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      apikey: config.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text.length > 0 ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error ?? `director-cut request failed (${response.status})`);
  }
  return payload;
};

export const runDirectorCutExport = async ({
  args,
  env = process.env,
  fetchImpl = fetch,
  waitImpl = wait,
}) => {
  const config = resolveRuntimeConfig(args, env);
  const create = await invokeDirectorCut({
    fetchImpl,
    config,
    body: buildDirectorCutCreateBody(args),
  });
  const jobId = create.jobId;
  if (!jobId) {
    throw new Error('director-cut did not return a jobId.');
  }

  const statuses = [];
  if (args.wait) {
    for (let poll = 0; poll < args.maxPolls; poll += 1) {
      await waitImpl(args.pollIntervalMs);
      const status = await invokeDirectorCut({
        fetchImpl,
        config,
        body: buildDirectorCutStatusBody({ projectId: args.projectId, jobId }),
      });
      statuses.push(status);
      if (status.status === 'completed' || status.status === 'failed') {
        break;
      }
    }
  }

  return {
    projectId: args.projectId,
    renderer: args.renderer,
    jobId,
    create,
    statuses,
    finalStatus: statuses.at(-1) ?? null,
    timedOut: args.wait && statuses.at(-1)?.status !== 'completed' && statuses.at(-1)?.status !== 'failed',
  };
};

export const isSuccessfulRun = (result, args) => {
  if (!args.wait) return true;
  return result.finalStatus?.status === 'completed' && typeof result.finalStatus.outputUrl === 'string';
};

const printTextResult = (result) => {
  console.log(`projectId=${result.projectId}`);
  console.log(`renderer=${result.renderer}`);
  console.log(`jobId=${result.jobId}`);
  if (result.finalStatus) {
    console.log(`status=${result.finalStatus.status ?? 'unknown'}`);
    console.log(`provider=${result.finalStatus.provider ?? 'unknown'}`);
    console.log(`providerStatus=${result.finalStatus.providerStatus ?? 'unknown'}`);
    console.log(`outputUrl=${result.finalStatus.outputUrl ? 'set' : 'missing'}`);
  } else {
    console.log('status=created');
  }
  if (result.timedOut) {
    console.log('wait=timed-out');
  }
};

export const main = async (argv = process.argv.slice(2), env = loadDirectorCutEnv()) => {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  if (args.dryRun) {
    const dryRun = buildRedactedDryRun(args, env);
    if (args.json) {
      console.log(JSON.stringify(dryRun, null, 2));
    } else {
      console.log(`url=${dryRun.url}`);
      console.log(`authorization=${dryRun.headers.authorization}`);
      console.log(`apikey=${dryRun.headers.apikey}`);
      console.log(`renderer=${args.renderer}`);
      console.log('status=dry-run');
    }
    return 0;
  }

  const result = await runDirectorCutExport({ args, env });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextResult(result);
  }
  return isSuccessfulRun(result, args) ? 0 : 1;
};

const isCliEntrypoint = () => process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;

if (isCliEntrypoint()) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exitCode = 1;
  }
}
