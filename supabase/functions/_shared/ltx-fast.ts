export const LTX_FAST_DEFAULT_RESOLUTION = '1920x1080';
export const LTX_FAST_DEFAULT_FPS = 25;
export const LTX_FAST_DEFAULT_DURATION = 6;
export const LTX_FAST_DEFAULT_GENERATE_AUDIO = true;

export const VALID_LTX_FAST_RESOLUTIONS = [
  '1920x1080',
  '2560x1440',
  '3840x2160',
] as const;

export const VALID_LTX_FPS = [25, 50] as const;

export const VALID_LTX_CAMERA_MOTIONS = [
  'dolly_in',
  'dolly_out',
  'dolly_left',
  'dolly_right',
  'jib_up',
  'jib_down',
  'static',
  'focus_shift',
] as const;

export const LTX_SUPPORT_MATRIX: Record<string, Record<number, readonly number[]>> = {
  '1920x1080': {
    25: [6, 8, 10, 12, 14, 16, 18, 20],
    50: [6, 8, 10],
  },
  '2560x1440': {
    25: [6, 8, 10],
    50: [6, 8, 10],
  },
  '3840x2160': {
    25: [6, 8, 10],
    50: [6, 8, 10],
  },
};

const LTX_RESOLUTION_ALIAS_MAP: Record<string, typeof VALID_LTX_FAST_RESOLUTIONS[number]> = {
  '1080p': '1920x1080',
  '1920x1080': '1920x1080',
  '1440p': '2560x1440',
  '2560x1440': '2560x1440',
  '4k': '3840x2160',
  '3840x2160': '3840x2160',
};

export interface LtxFastSettingsInput {
  duration?: unknown;
  duration_seconds?: unknown;
  durationSeconds?: unknown;
  resolution?: unknown;
  fps?: unknown;
  generate_audio?: unknown;
  generateAudio?: unknown;
  camera_motion?: unknown;
  cameraMotion?: unknown;
}

export interface NormalizedLtxFastSettings {
  duration: number;
  resolution: typeof VALID_LTX_FAST_RESOLUTIONS[number];
  fps: typeof VALID_LTX_FPS[number];
  generate_audio: boolean;
  camera_motion?: typeof VALID_LTX_CAMERA_MOTIONS[number];
}

export interface LtxFastPayloadInput extends LtxFastSettingsInput {
  image_uri?: unknown;
  image_url?: unknown;
  image?: unknown;
  prompt?: unknown;
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function isLtxFastEndpointModel(modelId: string): boolean {
  return modelId === 'ltx-2-fast-image-to-video' || modelId === 'gmi/ltx-fast-i2v';
}

export function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return undefined;
}

export function normalizeLtxResolution(value: unknown): typeof VALID_LTX_FAST_RESOLUTIONS[number] {
  const normalized = asTrimmedString(value)?.toLowerCase();
  if (!normalized) {
    return LTX_FAST_DEFAULT_RESOLUTION;
  }

  return LTX_RESOLUTION_ALIAS_MAP[normalized] ?? LTX_FAST_DEFAULT_RESOLUTION;
}

export function normalizeLtxFps(value: unknown): typeof VALID_LTX_FPS[number] {
  const fps = coerceFiniteNumber(value);
  return fps === 50 ? 50 : LTX_FAST_DEFAULT_FPS;
}

export function getAllowedLtxDurations(
  resolution: typeof VALID_LTX_FAST_RESOLUTIONS[number],
  fps: typeof VALID_LTX_FPS[number],
): readonly number[] {
  return LTX_SUPPORT_MATRIX[resolution]?.[fps] ?? LTX_SUPPORT_MATRIX[LTX_FAST_DEFAULT_RESOLUTION][LTX_FAST_DEFAULT_FPS];
}

export function normalizeLtxDuration(
  requestedValue: unknown,
  resolution: typeof VALID_LTX_FAST_RESOLUTIONS[number],
  fps: typeof VALID_LTX_FPS[number],
): number {
  const allowedDurations = getAllowedLtxDurations(resolution, fps);
  const requestedDuration = coerceFiniteNumber(requestedValue);

  if (requestedDuration === undefined) {
    return allowedDurations[0] ?? LTX_FAST_DEFAULT_DURATION;
  }

  if (allowedDurations.includes(requestedDuration)) {
    return requestedDuration;
  }

  const lowerOrEqual = allowedDurations.filter((duration) => duration <= requestedDuration);
  if (lowerOrEqual.length > 0) {
    return lowerOrEqual[lowerOrEqual.length - 1] ?? allowedDurations[0] ?? LTX_FAST_DEFAULT_DURATION;
  }

  return allowedDurations[0] ?? LTX_FAST_DEFAULT_DURATION;
}

export function normalizeLtxCameraMotion(
  value: unknown,
): typeof VALID_LTX_CAMERA_MOTIONS[number] | undefined {
  const normalized = asTrimmedString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return VALID_LTX_CAMERA_MOTIONS.includes(
    normalized as typeof VALID_LTX_CAMERA_MOTIONS[number],
  )
    ? (normalized as typeof VALID_LTX_CAMERA_MOTIONS[number])
    : undefined;
}

export function normalizeLtxFastSettings(input: LtxFastSettingsInput): NormalizedLtxFastSettings {
  const resolution = normalizeLtxResolution(input.resolution);
  const fps = normalizeLtxFps(input.fps);
  const duration = normalizeLtxDuration(
    firstDefined(input.duration, input.duration_seconds, input.durationSeconds),
    resolution,
    fps,
  );
  const generateAudio = coerceBoolean(
    firstDefined(input.generate_audio, input.generateAudio),
  ) ?? LTX_FAST_DEFAULT_GENERATE_AUDIO;
  const cameraMotion = normalizeLtxCameraMotion(
    firstDefined(input.camera_motion, input.cameraMotion),
  );

  return {
    duration,
    resolution,
    fps,
    generate_audio: generateAudio,
    ...(cameraMotion ? { camera_motion: cameraMotion } : {}),
  };
}

function asPromptString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

export function buildLtxFastPayload(input: LtxFastPayloadInput): Record<string, unknown> {
  const settings = normalizeLtxFastSettings(input);
  const imageUri = firstDefined(
    asTrimmedString(input.image_uri),
    asTrimmedString(input.image_url),
    asTrimmedString(input.image),
  );

  return {
    image_uri: imageUri,
    prompt: asPromptString(input.prompt),
    ...settings,
  };
}
