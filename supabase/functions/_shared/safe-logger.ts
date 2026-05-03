type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SECRET_KEY_PATTERN = /(authorization|apikey|api_key|api-key|secret|token|password|key)$/i;
const URL_KEY_PATTERN = /(^url$|_url$|Url$|URL$|uri|href|src|signed)/i;
const PROMPT_KEY_PATTERN = /(prompt|messages|system|instructions)/i;
const PAYLOAD_KEY_PATTERN = /(provider_payload|providerPayload|webhookPayload|requestBody|request_body|responseBody|response_body|body|headers|input)$/i;
const ASSET_KEY_PATTERN = /(assetRefs|asset_refs|assets|shotFailures)$/i;

function redactError(error: Error) {
  return {
    name: error.name,
    message: error.message,
  };
}

function safeProviderPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '[redacted-provider-payload]';
  }
  const input = value as Record<string, unknown>;
  const safeKeys = [
    'stage',
    'status',
    'renderer',
    'provider',
    'providerStatus',
    'provider_status',
    'requestId',
    'providerJobId',
    'provider_job_id',
    'falRequestId',
    'editframeRenderId',
    'fallbackStatus',
    'fallbackReason',
    'fallbackUsed',
    'renderMode',
    'width',
    'height',
    'fps',
    'durationMs',
    'totalAssets',
    'visualTracks',
    'audioTracks',
    'failedShotCount',
  ];

  return Object.fromEntries(
    safeKeys
      .filter((key) => input[key] !== undefined)
      .map((key) => [key, input[key]])
  );
}

export function redactForLog(value: unknown, key = ''): unknown {
  if (value instanceof Error) return redactError(value);
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (SECRET_KEY_PATTERN.test(key)) return '[redacted-secret]';
    if (PAYLOAD_KEY_PATTERN.test(key)) return '[redacted-payload]';
    if (URL_KEY_PATTERN.test(key)) return '[redacted-url]';
    if (PROMPT_KEY_PATTERN.test(key)) return '[redacted-prompt]';
    return value.length > 600 ? `${value.slice(0, 600)}...` : value;
  }
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    if (ASSET_KEY_PATTERN.test(key) || PAYLOAD_KEY_PATTERN.test(key)) {
      return `[redacted-array:${value.length}]`;
    }
    return value.slice(0, 12).map((item) => redactForLog(item, key));
  }

  if (PAYLOAD_KEY_PATTERN.test(key)) {
    return key === 'providerPayload' || key === 'provider_payload'
      ? safeProviderPayload(value)
      : '[redacted-object]';
  }

  const output: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (entryKey === 'providerPayload' || entryKey === 'provider_payload') {
      output[entryKey] = safeProviderPayload(entryValue);
    } else if (ASSET_KEY_PATTERN.test(entryKey)) {
      output[entryKey] = Array.isArray(entryValue) ? `[redacted-array:${entryValue.length}]` : '[redacted-assets]';
    } else if (SECRET_KEY_PATTERN.test(entryKey)) {
      output[entryKey] = '[redacted-secret]';
    } else if (URL_KEY_PATTERN.test(entryKey)) {
      output[entryKey] = '[redacted-url]';
    } else if (PROMPT_KEY_PATTERN.test(entryKey)) {
      output[entryKey] = '[redacted-prompt]';
    } else {
      output[entryKey] = redactForLog(entryValue, entryKey);
    }
  }
  return output;
}

export function safeLog(level: LogLevel, event: string, details: Record<string, unknown> = {}) {
  const logger = console[level] ?? console.log;
  logger(`[${event}]`, redactForLog({
    ...details,
    timestamp: new Date().toISOString(),
  }));
}
