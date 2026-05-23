import { describe, expect, it, vi } from 'vitest';
import { redactForLog, safeLog } from '../../../../supabase/functions/_shared/safe-logger';

describe('safe edge logging', () => {
  it('redacts prompts, secrets, URLs, request bodies, headers, and asset refs', () => {
    const redacted = redactForLog({
      prompt: 'Write a private scene prompt',
      OPENAI_API_KEY: 'sk-secret',
      authorization: 'Bearer private-token',
      output_url: 'https://signed.example.com/video.mp4?token=secret',
      requestBody: { prompt: 'nested prompt' },
      headers: { authorization: 'Bearer nested' },
      assetRefs: [{ id: 'asset-1', url: 'https://media.example.com/image.png' }],
      status: 'processing',
      requestId: 'req_123',
    }) as Record<string, unknown>;

    expect(redacted).toMatchObject({
      prompt: '[redacted-prompt]',
      OPENAI_API_KEY: '[redacted-secret]',
      authorization: '[redacted-secret]',
      output_url: '[redacted-url]',
      requestBody: '[redacted-object]',
      headers: '[redacted-object]',
      assetRefs: '[redacted-array:1]',
      status: 'processing',
      requestId: 'req_123',
    });
  });

  it('summarizes provider payloads without leaking raw provider bodies', () => {
    const redacted = redactForLog({
      providerPayload: {
        stage: 'provider_processing',
        renderer: 'fal-ai/ffmpeg-api/compose',
        falRequestId: 'fal-request-1',
        visualTracks: 14,
        audioTracks: 2,
        responseBody: { video_url: 'https://cdn.example.com/final.mp4' },
        prompt: 'do not log',
      },
    }) as { providerPayload: Record<string, unknown> };

    expect(redacted.providerPayload).toEqual({
      stage: 'provider_processing',
      renderer: 'fal-ai/ffmpeg-api/compose',
      falRequestId: 'fal-request-1',
      visualTracks: 14,
      audioTracks: 2,
    });
  });

  it('logs a redacted payload through the selected console level', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    safeLog('warn', 'generate-workflow.setup_error', {
      prompt: 'private user prompt',
      providerPayload: {
        stage: 'planning',
        provider: 'codex',
        responseBody: { output_text: 'private output' },
      },
    });

    expect(warn).toHaveBeenCalledWith(
      '[generate-workflow.setup_error]',
      expect.objectContaining({
        prompt: '[redacted-prompt]',
        providerPayload: {
          stage: 'planning',
          provider: 'codex',
        },
        timestamp: expect.any(String),
      })
    );
  });
});
