#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { loadDirectorCutEnv } from './director-cut-env-files.mjs';

const DEFAULT_DURATION_MS = 3000;
const DEFAULT_SOURCE_DURATION_MS = 4000;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_FPS = 24;

const printUsage = () => {
  console.log(`
Usage:
  npm run director-cut:seed-live-fixture -- --project-id <project_id> --user-id <user_id> --video-url <public_mp4_url> --audio-url <public_audio_url>
  npm run director-cut:seed-live-fixture -- --project-id <project_id> --user-id <user_id> --video-url <public_mp4_url> --audio-url <public_audio_url> --dry-run --json

Required environment for live writes:
  Values are read from .env.example, .env, .env.local, and then this shell.
  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for live writes.

Options:
  --project-id        Existing project id to receive the saved editor timeline.
  --user-id           Project owner id. The script refuses to write if it does not match projects.user_id.
  --video-url         Publicly reachable MP4/MOV URL for the trimmed visual clip.
  --audio-url         Publicly reachable MP3/WAV URL for the audio track.
  --duration-ms       Timeline duration. Defaults to ${DEFAULT_DURATION_MS}.
  --source-duration-ms Cached source video/audio duration. Defaults to ${DEFAULT_SOURCE_DURATION_MS}.
  --json              Print machine-readable JSON.
  --dry-run           Print the row payload without contacting Supabase.
`);
};

const parsePositiveNumberOption = (key, value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${key} must be a positive number.`);
  }
  return Math.round(parsed);
};

export const parseArgs = (argv) => {
  const args = {
    durationMs: DEFAULT_DURATION_MS,
    sourceDurationMs: DEFAULT_SOURCE_DURATION_MS,
    json: false,
    dryRun: false,
  };

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
    if (key === 'dry-run') {
      args.dryRun = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    if (key === 'duration-ms') {
      args.durationMs = parsePositiveNumberOption(key, value);
    } else if (key === 'source-duration-ms') {
      args.sourceDurationMs = parsePositiveNumberOption(key, value);
    } else if (key === 'project-id') {
      args.projectId = value;
    } else if (key === 'user-id') {
      args.userId = value;
    } else if (key === 'video-url') {
      args.videoUrl = value;
    } else if (key === 'audio-url') {
      args.audioUrl = value;
    } else {
      throw new Error(`Unsupported option: --${key}`);
    }
    index += 1;
  }

  if (!args.help) {
    for (const key of ['projectId', 'userId', 'videoUrl', 'audioUrl']) {
      if (!args[key]) throw new Error(`Missing required option: --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
    }
    args.videoUrl = validatePublicMediaUrl(args.videoUrl, '--video-url');
    args.audioUrl = validatePublicMediaUrl(args.audioUrl, '--audio-url');
  }

  return args;
};

export const validatePublicMediaUrl = (value, optionName) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('unsupported protocol');
    }
    return url.href;
  } catch {
    throw new Error(`${optionName} must be a public http(s) URL.`);
  }
};

export const requireEnv = (env = process.env) => {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return { supabaseUrl, serviceRoleKey };
};

const createTransforms = (overrides = {}) => ({
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  ...overrides,
});

export const buildDirectorCutTimelineFixture = (args, now = new Date().toISOString()) => {
  const duration = args.durationMs ?? DEFAULT_DURATION_MS;
  const sourceDuration = Math.max(args.sourceDurationMs ?? DEFAULT_SOURCE_DURATION_MS, duration + 500);
  const trimStart = Math.min(500, Math.max(0, sourceDuration - duration));
  const trimEnd = trimStart + duration;
  const composition = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    fps: DEFAULT_FPS,
    aspectRatio: '16:9',
    duration,
    backgroundColor: '#050505',
  };
  const baseTransforms = createTransforms({
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  });
  const styledTransforms = createTransforms({
    position: { x: 24, y: -12 },
    scale: { x: 1.06, y: 1.06 },
    rotation: 1.5,
    opacity: 1,
  });

  const document = {
    version: 1,
    source: 'worldstudio-editor',
    clips: [
      {
        id: 'live-fixture-video-1',
        type: 'video',
        name: 'Director Cut Live Fixture Video',
        url: args.videoUrl,
        thumbnailUrl: null,
        previewUrl: null,
        mediaMetadata: {
          duration_ms: sourceDuration,
          duration_seconds: sourceDuration / 1000,
          fixture: 'director-cut-live',
        },
        startTime: 0,
        duration,
        endTime: duration,
        trackIndex: 0,
        layer: 0,
        trimStart,
        trimEnd,
        transition: {
          type: 'fade',
          duration: 250,
          direction: 'left',
        },
        effects: [
          {
            id: 'brightness',
            name: 'Brightness',
            type: 'adjustment',
            params: { value: 108 },
          },
          {
            id: 'contrast',
            name: 'Contrast',
            type: 'adjustment',
            params: { value: 104 },
          },
        ],
        transforms: baseTransforms,
      },
    ],
    audioTracks: [
      {
        id: 'live-fixture-audio-1',
        type: 'audio',
        name: 'Fixture Music',
        url: args.audioUrl,
        thumbnailUrl: null,
        previewUrl: null,
        mediaMetadata: {
          duration_ms: duration,
          duration_seconds: duration / 1000,
          fixture: 'director-cut-live',
        },
        startTime: 0,
        duration,
        endTime: duration,
        volume: 0.85,
        isMuted: false,
        trackIndex: 0,
        fadeInDuration: 120,
        fadeOutDuration: 180,
      },
    ],
    keyframes: [
      {
        id: 'live-fixture-keyframe-1',
        targetId: 'live-fixture-video-1',
        time: duration,
        properties: {
          transforms: styledTransforms,
        },
      },
    ],
    composition,
    updatedAt: now,
  };

  return {
    projectId: args.projectId,
    userId: args.userId,
    document,
    row: {
      project_id: args.projectId,
      user_id: args.userId,
      composition_data: document,
      duration_ms: duration,
      resolution: `${DEFAULT_WIDTH}x${DEFAULT_HEIGHT}`,
      frame_rate: DEFAULT_FPS,
      updated_at: now,
    },
  };
};

const createSupabaseAdmin = (env = process.env) => {
  const { supabaseUrl, serviceRoleKey } = requireEnv(env);
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const verifyProjectOwner = async (supabaseAdmin, projectId, userId) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single();
  if (error || !data) throw new Error(`Project not found: ${error?.message ?? projectId}`);
  if (data.user_id !== userId) {
    throw new Error(`Project ${projectId} is owned by ${data.user_id}, not ${userId}.`);
  }
};

const loadLatestTimeline = async (supabaseAdmin, projectId, userId) => {
  const { data, error } = await supabaseAdmin
    .from('timelines')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load existing timeline: ${error.message}`);
  return data ?? null;
};

export const saveDirectorCutTimelineFixture = async ({ supabaseAdmin, fixture }) => {
  await verifyProjectOwner(supabaseAdmin, fixture.projectId, fixture.userId);
  const existing = await loadLatestTimeline(supabaseAdmin, fixture.projectId, fixture.userId);

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('timelines')
      .update(fixture.row)
      .eq('id', existing.id);
    if (error) throw new Error(`Failed to update timeline fixture: ${error.message}`);
    return { action: 'updated', timelineId: existing.id };
  }

  const { data, error } = await supabaseAdmin
    .from('timelines')
    .insert(fixture.row)
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to insert timeline fixture: ${error?.message ?? 'no row returned'}`);
  return { action: 'inserted', timelineId: data.id };
};

const printTextResult = (result) => {
  console.log(`projectId=${result.projectId}`);
  console.log(`userId=${result.userId}`);
  console.log(`timelineAction=${result.action}`);
  console.log(`timelineId=${result.timelineId ?? 'dry-run'}`);
  console.log(`durationMs=${result.durationMs}`);
  console.log('status=ready');
};

export const main = async (argv = process.argv.slice(2), env = loadDirectorCutEnv()) => {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  const fixture = buildDirectorCutTimelineFixture(args);
  const writeResult = args.dryRun
    ? { action: 'dry-run', timelineId: null }
    : await saveDirectorCutTimelineFixture({
        supabaseAdmin: createSupabaseAdmin(env),
        fixture,
      });

  const result = {
    projectId: fixture.projectId,
    userId: fixture.userId,
    ...writeResult,
    durationMs: fixture.row.duration_ms,
    row: args.dryRun ? fixture.row : undefined,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextResult(result);
  }
  return 0;
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
