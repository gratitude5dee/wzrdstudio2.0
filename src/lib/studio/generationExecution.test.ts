import { describe, expect, it } from 'vitest';

import {
  normalizeGenerationErrorMessage,
  resolveStudioGenerationModel,
} from '@/lib/studio/generationExecution';

describe('generationExecution', () => {
  it('falls back image generation requests to a compatible default when the model is missing', () => {
    const resolution = resolveStudioGenerationModel({
      kind: 'Image',
      requestedModelId: 'missing/image-model',
      hasImageInputs: false,
    });

    expect(resolution.fallbackUsed).toBe(true);
    expect(resolution.resolvedModelId).toBeTruthy();
    expect(resolution.resolvedModel?.workflowType).toBe('text-to-image');
    expect(resolution.fallbackReason).toContain('unknown_model');
  });

  it('falls back video generation requests to image-to-video when references exist', () => {
    const resolution = resolveStudioGenerationModel({
      kind: 'Video',
      requestedModelId: 'fal-ai/kling-video/o3/standard/text-to-video',
      hasImageInputs: true,
    });

    expect(resolution.fallbackUsed).toBe(true);
    expect(resolution.resolvedModelId).toBe('fal-ai/kling-video/o3/standard/image-to-video');
    expect(resolution.fallbackReason).toContain('incompatible_with_reference_input');
  });

  it('falls back GMI text-only video selections to a same-family image-driven variant when available', () => {
    const resolution = resolveStudioGenerationModel({
      kind: 'Video',
      requestedModelId: 'gmi/seedance-2.0-t2v',
      hasImageInputs: true,
    });

    expect(resolution.fallbackUsed).toBe(true);
    expect(resolution.resolvedModelId).toBe('gmi/seedance-2.0-i2v');
    expect(resolution.fallbackReason).toContain('same_family');
  });

  it('falls back incompatible GMI video selections to the image-driven default when no same-family variant exists', () => {
    const resolution = resolveStudioGenerationModel({
      kind: 'Video',
      requestedModelId: 'gmi/kling-v3-omni',
      hasImageInputs: true,
    });

    expect(resolution.fallbackUsed).toBe(true);
    expect(resolution.resolvedModelId).toBe('gmi/ltx-fast-i2v');
    expect(resolution.fallbackReason).toContain('default:gmi/ltx-fast-i2v');
  });

  it('normalizes stringified JSON error payloads into user-facing text', () => {
    expect(
      normalizeGenerationErrorMessage('{"ERROR":"Request failed. Please try again."}')
    ).toBe('Request failed. Please try again.');

    expect(
      normalizeGenerationErrorMessage(
        new Error('{"error":"Model temporarily unavailable","details":{"message":"Retry later"}}')
      )
    ).toBe('Model temporarily unavailable');
  });
});
