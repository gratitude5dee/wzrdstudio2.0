import { describe, expect, it } from 'vitest';
import {
  buildCanonicalFalInputs,
  normalizeFalModelId,
  parseSettingsOverride,
} from '@/lib/falModelNormalization';

describe('falModelNormalization', () => {
  it('normalizes known aliases', () => {
    expect(normalizeFalModelId('kling-2-1')).toBe('fal-ai/kling-video/o3/standard/text-to-video');
    expect(normalizeFalModelId('google/gemini-2.5-flash-image-preview')).toBe('fal-ai/nano-banana-2');
  });

  it('merges inputs with precedence defaults -> settings -> settings_override', () => {
    const result = buildCanonicalFalInputs('fal-ai/nano-banana-2', {
      prompt: 'test prompt',
      num_images: 1,
      settings: {
        num_images: 2,
        aspect_ratio: '1:1',
      },
      settings_override: {
        num_images: 3,
      },
    });

    expect(result.modelId).toBe('fal-ai/nano-banana-2');
    expect(result.inputs.output_format).toBe('png');
    expect(result.inputs.num_images).toBe(3);
    expect(result.inputs.aspect_ratio).toBe('1:1');
    expect(result.inputs.prompt).toBe('test prompt');
  });

  it('rejects invalid override JSON', () => {
    expect(parseSettingsOverride('{bad json')).toEqual({
      valid: false,
      error: 'Invalid JSON syntax in override.',
    });

    expect(() =>
      buildCanonicalFalInputs('fal-ai/nano-banana-2', {
        prompt: 'test',
        settings_override: '{bad json',
      })
    ).toThrow('Invalid JSON syntax in override.');
  });
});
