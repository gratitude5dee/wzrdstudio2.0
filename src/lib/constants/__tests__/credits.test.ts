import { describe, it, expect } from 'vitest';
import {
  getModelCredits,
  buildCreditsMap,
  formatModelLabel,
  formatModelLabelById,
  IMAGE_CREDITS,
  VIDEO_CREDITS,
  AUDIO_CREDITS,
  TEXT_CREDITS,
  STORYLINE_MODEL_OPTIONS,
  formatStorylineModelLabel,
} from '../credits';
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  AUDIO_MODELS,
  TEXT_MODELS,
} from '@/lib/studio-model-constants';

describe('credits constants', () => {
  describe('getModelCredits', () => {
    it('returns credits for a known image model', () => {
      expect(getModelCredits('fal-ai/flux/schnell')).toBe(3);
    });

    it('returns credits for a known video model', () => {
      expect(getModelCredits('fal-ai/kling-video/o3/standard/text-to-video')).toBe(20);
    });

    it('returns undefined for an unknown model', () => {
      expect(getModelCredits('unknown-model-id')).toBeUndefined();
    });
  });

  describe('buildCreditsMap', () => {
    it('builds a map keyed by model ID with credit values', () => {
      const map = buildCreditsMap(IMAGE_MODELS);
      expect(map['fal-ai/flux/schnell']).toBe(3);
      expect(map['fal-ai/flux/dev']).toBe(5);
      expect(Object.keys(map).length).toBe(IMAGE_MODELS.length);
    });
  });

  describe('pre-built credit maps', () => {
    it('IMAGE_CREDITS contains all image models', () => {
      expect(Object.keys(IMAGE_CREDITS).length).toBe(IMAGE_MODELS.length);
    });

    it('VIDEO_CREDITS contains all video models', () => {
      expect(Object.keys(VIDEO_CREDITS).length).toBe(VIDEO_MODELS.length);
    });

    it('AUDIO_CREDITS contains all audio models', () => {
      expect(Object.keys(AUDIO_CREDITS).length).toBe(AUDIO_MODELS.length);
    });

    it('TEXT_CREDITS contains all text models', () => {
      expect(Object.keys(TEXT_CREDITS).length).toBe(TEXT_MODELS.length);
    });
  });

  describe('formatModelLabel', () => {
    it('formats label as "{name} ({credits} credits)"', () => {
      const model = IMAGE_MODELS[0]; // FLUX Schnell, 3 credits
      expect(formatModelLabel(model)).toBe(`${model.name} (${model.credits} credits)`);
    });

    it('works with video models', () => {
      const model = VIDEO_MODELS[0];
      expect(formatModelLabel(model)).toBe(`${model.name} (${model.credits} credits)`);
    });
  });

  describe('formatModelLabelById', () => {
    it('formats label for a known model ID', () => {
      expect(formatModelLabelById('fal-ai/flux/schnell')).toBe('FLUX Schnell (3 credits)');
    });

    it('falls back to model ID for an unknown model', () => {
      expect(formatModelLabelById('unknown-id')).toBe('unknown-id');
    });

    it('falls back to provided name for unknown model', () => {
      expect(formatModelLabelById('unknown-id', 'Custom Name')).toBe('Custom Name');
    });
  });

  describe('STORYLINE_MODEL_OPTIONS', () => {
    it('contains storyline model options with positive numeric credits', () => {
      expect(STORYLINE_MODEL_OPTIONS.length).toBeGreaterThan(0);
      for (const opt of STORYLINE_MODEL_OPTIONS) {
        expect(opt.id).toBeTruthy();
        expect(opt.label).toBeTruthy();
        expect(typeof opt.credits).toBe('number');
        expect(opt.credits).toBeGreaterThan(0);
      }

      expect(STORYLINE_MODEL_OPTIONS).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'gmi/claude-opus-4.7',
            credits: 5,
          }),
          expect.objectContaining({
            id: 'gmi/glm-5.1',
            credits: 2,
          }),
        ])
      );
    });
  });

  describe('formatStorylineModelLabel', () => {
    it('formats storyline option as "{label} ({credits} credits)"', () => {
      const option = STORYLINE_MODEL_OPTIONS[0];
      expect(formatStorylineModelLabel(option)).toBe(
        `${option.label} (${option.credits} credits)`
      );
    });
  });
});
