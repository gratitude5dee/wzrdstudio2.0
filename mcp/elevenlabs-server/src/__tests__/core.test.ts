import { Buffer } from 'node:buffer';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ElevenLabsClient } from '../elevenlabsClient.js';
import { logger } from '../logger.js';
import { RateLimiter } from '../rateLimiter.js';
import { audioFormats, invokeSchema, textToSpeechSchema } from '../schema.js';
import { createToolRouter } from '../service.js';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses debug output at the default info threshold', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logger.debug('debug.hidden');

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('writes structured JSON for warn logs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('warn.visible', { requestId: 'req-1' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warnSpy.mock.calls[0][0]))).toMatchObject({
      level: 'warn',
      message: 'warn.visible',
      requestId: 'req-1',
    });
  });
});

describe('ElevenLabsClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when no API key is configured', () => {
    expect(() => new ElevenLabsClient({ apiKey: '' })).toThrow(
      'ELEVENLABS_API_KEY is required'
    );
  });

  it('passes the ElevenLabs API key header on JSON requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ voices: [{ voice_id: 'voice-1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const client = new ElevenLabsClient({ apiKey: 'api-key', fetchImpl });
    const result = await client.listVoices();

    expect(result).toEqual({ voices: [{ voice_id: 'voice-1' }] });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/voices',
      expect.objectContaining({
        headers: expect.objectContaining({ 'xi-api-key': 'api-key' }),
      })
    );
  });

  it('returns base64 audio payloads for binary synthesis responses', async () => {
    const audioBytes = Uint8Array.from([1, 2, 3, 4]);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(audioBytes, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      })
    );

    const client = new ElevenLabsClient({ apiKey: 'api-key', fetchImpl });
    const result = await client.textToSpeech({
      text: 'hello world',
      voice_id: 'voice-1',
      stability: 0.3,
      optimize_streaming_latency: 0,
    });

    expect(result).toEqual({
      audio_base64: Buffer.from(audioBytes).toString('base64'),
      audio_format: 'mp3',
      voice_id: 'voice-1',
      model_id: null,
      text: 'hello world',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/text-to-speech/voice-1',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'audio/mp3',
          'Content-Type': 'application/json',
          'xi-api-key': 'api-key',
        }),
      })
    );

    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(requestBody).toMatchObject({
      text: 'hello world',
      optimize_streaming_latency: 0,
      voice_settings: { stability: 0.3 },
    });
    expect(requestBody.voice_settings).not.toHaveProperty('similarity_boost');
    expect(requestBody).not.toHaveProperty('model_id');
  });

  it('logs and throws when the upstream request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad request' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    );
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const client = new ElevenLabsClient({ apiKey: 'api-key', fetchImpl });

    await expect(client.listVoices()).rejects.toThrow(
      'ElevenLabs request failed with status 500'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'elevenlabs.request-failed',
      expect.objectContaining({
        path: '/voices',
        status: 500,
      })
    );
  });
});

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows requests within the configured window and resets new buckets', () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    const limiter = new RateLimiter({ windowMs: 500, maxRequests: 2 });

    expect(() => limiter.consume('tts')).not.toThrow();
    expect(() => limiter.consume('tts')).not.toThrow();
    expect(debugSpy).toHaveBeenCalledWith('rate-limiter.reset', { key: 'tts' });
  });

  it('throws a retryable error after the request budget is exhausted', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_100).mockReturnValueOnce(1_250);

    const limiter = new RateLimiter({ windowMs: 500, maxRequests: 2 });

    limiter.consume('tts');
    limiter.consume('tts');

    try {
      limiter.consume('tts');
      throw new Error('expected rate limit error');
    } catch (error) {
      expect((error as Error).message).toContain('Rate limit exceeded for tts');
      expect((error as Error & { retryInMs?: number }).retryInMs).toBe(250);
    }

    expect(warnSpy).toHaveBeenCalledWith('rate-limiter.limit-hit', {
      key: 'tts',
      retryInMs: 250,
    });
  });
});

describe('schema', () => {
  it('accepts valid text-to-speech payloads', () => {
    expect(
      textToSpeechSchema.parse({
        text: 'hello',
        voice_id: 'voice-1',
        audio_format: audioFormats[0],
        optimize_streaming_latency: 4,
      })
    ).toMatchObject({
      text: 'hello',
      voice_id: 'voice-1',
      audio_format: 'mp3',
      optimize_streaming_latency: 4,
    });
  });

  it('rejects invalid tool invocations', () => {
    expect(() => invokeSchema.parse({ tool: 'unknown-tool' })).toThrow();
    expect(() =>
      textToSpeechSchema.parse({
        text: '',
        voice_id: '',
      })
    ).toThrow();
  });
});

describe('createToolRouter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid requests before hitting the limiter', async () => {
    const limiter = { consume: vi.fn() };
    const router = createToolRouter({
      client: {
        listVoices: vi.fn(),
        getVoiceSettings: vi.fn(),
        textToSpeech: vi.fn(),
      } as any,
      limiter: limiter as any,
    });

    const result = await router.invoke({ tool: 'invalid' } as any);

    expect(result).toEqual({
      id: undefined,
      ok: false,
      error: { message: 'Invalid request', code: 'INVALID_REQUEST' },
    });
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  it('returns a successful result for list_voices', async () => {
    const limiter = { consume: vi.fn() };
    const client = {
      listVoices: vi.fn().mockResolvedValue({ voices: ['voice-1'] }),
      getVoiceSettings: vi.fn(),
      textToSpeech: vi.fn(),
    };
    const router = createToolRouter({ client: client as any, limiter: limiter as any });

    const result = await router.invoke({ id: 'req-1', tool: 'list_voices' });

    expect(limiter.consume).toHaveBeenCalledWith('list_voices');
    expect(result).toEqual({
      id: 'req-1',
      ok: true,
      result: { voices: ['voice-1'] },
    });
  });

  it('surfaces retry information when the limiter rejects a request', async () => {
    const limiter = {
      consume: vi.fn(() => {
        const error = new Error('slow down');
        (error as Error & { retryInMs?: number }).retryInMs = 750;
        throw error;
      }),
    };
    const router = createToolRouter({
      client: {
        listVoices: vi.fn(),
        getVoiceSettings: vi.fn(),
        textToSpeech: vi.fn(),
      } as any,
      limiter: limiter as any,
    });

    const result = await router.invoke({ id: 'req-2', tool: 'list_voices' });

    expect(result).toEqual({
      id: 'req-2',
      ok: false,
      error: {
        message: 'slow down',
        code: 'RATE_LIMITED',
        retryInMs: 750,
      },
    });
  });

  it('converts handler failures into INTERNAL_ERROR responses', async () => {
    const limiter = { consume: vi.fn() };
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const client = {
      listVoices: vi.fn(),
      getVoiceSettings: vi.fn().mockRejectedValue(new Error('upstream exploded')),
      textToSpeech: vi.fn(),
    };
    const router = createToolRouter({ client: client as any, limiter: limiter as any });

    const result = await router.invoke({
      id: 'req-3',
      tool: 'get_voice_settings',
      params: { voice_id: 'voice-1' },
    });

    expect(result).toEqual({
      id: 'req-3',
      ok: false,
      error: {
        message: 'upstream exploded',
        code: 'INTERNAL_ERROR',
      },
    });
    expect(errorSpy).toHaveBeenCalledWith('tool.invoke-error', {
      tool: 'get_voice_settings',
      message: 'upstream exploded',
    });
  });
});
