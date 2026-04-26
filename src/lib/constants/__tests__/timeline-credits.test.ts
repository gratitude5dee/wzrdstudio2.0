import { describe, it, expect } from 'vitest';
import {
  getShotImageCredits,
  getShotVideoCredits,
  DIRECTORS_CUT_CREDITS,
} from '../credits';
import { IMAGE_MODELS, VIDEO_MODELS } from '@/lib/studio-model-constants';

describe('timeline credit helpers', () => {
  describe('getShotImageCredits', () => {
    it('returns credits for a known image model', () => {
      const credits = getShotImageCredits('fal-ai/flux/schnell');
      expect(credits).toBe(3);
    });

    it('returns credits for another known image model', () => {
      const credits = getShotImageCredits('fal-ai/flux/dev');
      expect(credits).toBe(5);
    });

    it('returns default (first model) credits for unknown model', () => {
      const credits = getShotImageCredits('unknown-model');
      expect(credits).toBe(IMAGE_MODELS[0].credits);
    });

    it('returns default credits when no model specified', () => {
      const credits = getShotImageCredits();
      expect(credits).toBe(IMAGE_MODELS[0].credits);
    });
  });

  describe('getShotVideoCredits', () => {
    it('returns credits for a known video model', () => {
      const credits = getShotVideoCredits('fal-ai/kling-video/o3/standard/text-to-video');
      expect(credits).toBe(20);
    });

    it('returns default (first model) credits for unknown model', () => {
      const credits = getShotVideoCredits('unknown-model');
      expect(credits).toBe(VIDEO_MODELS[0].credits);
    });

    it('returns default credits when no model specified', () => {
      const credits = getShotVideoCredits();
      expect(credits).toBe(VIDEO_MODELS[0].credits);
    });
  });

  describe('DIRECTORS_CUT_CREDITS', () => {
    it('is a positive number', () => {
      expect(DIRECTORS_CUT_CREDITS).toBeGreaterThan(0);
    });

    it('equals 12 (FFmpeg Compose cost)', () => {
      expect(DIRECTORS_CUT_CREDITS).toBe(12);
    });
  });
});
