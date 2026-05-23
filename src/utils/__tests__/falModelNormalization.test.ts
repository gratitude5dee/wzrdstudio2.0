import { describe, expect, it } from 'vitest';
import {
  buildCanonicalFalInputs,
  normalizeFalModelId,
} from '@/lib/falModelNormalization';

describe('fal canonical model helpers', () => {
  it('normalizes legacy video alias to canonical O3 model', () => {
    expect(normalizeFalModelId('kling-2-1')).toBe(
      'fal-ai/kling-video/o3/standard/text-to-video'
    );
  });

  it('merges defaults, settings, then settings_override in precedence order', () => {
    const result = buildCanonicalFalInputs('fal-ai/kling-video/o3/standard/text-to-video', {
      prompt: 'cinematic shot',
      settings: {
        duration: '8',
        aspect_ratio: '9:16',
      },
      settings_override: {
        generate_audio: false,
      },
    });

    expect(result.modelId).toBe('fal-ai/kling-video/o3/standard/text-to-video');
    expect(result.inputs.prompt).toBe('cinematic shot');
    expect(result.inputs.duration).toBe('8');
    expect(result.inputs.aspect_ratio).toBe('9:16');
    expect(result.inputs.generate_audio).toBe(false);
  });

  it('applies alias normalization during canonical input building', () => {
    const result = buildCanonicalFalInputs('luma-dream', {
      prompt: 'orbital camera move',
      duration: '5',
    });

    expect(result.modelId).toBe('fal-ai/kling-video/v3/pro/image-to-video');
    expect(result.inputs.prompt).toBe('orbital camera move');
  });
});
