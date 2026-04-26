import { describe, expect, it } from 'vitest';

import {
  compileCinematicPrompt,
  isShotControlEmpty,
  normalizeReferenceInputs,
  shotToCameraPayload,
  summarizeShot,
} from '../shotCamera';

describe('shotCamera', () => {
  describe('isShotControlEmpty', () => {
    it('treats undefined / empty objects as empty', () => {
      expect(isShotControlEmpty(undefined)).toBe(true);
      expect(isShotControlEmpty(null)).toBe(true);
      expect(isShotControlEmpty({})).toBe(true);
    });
    it('returns false when at least one field is set', () => {
      expect(isShotControlEmpty({ focalLength: '24mm' })).toBe(false);
    });
  });

  describe('compileCinematicPrompt', () => {
    it('returns the raw prompt untouched when shot is empty', () => {
      expect(compileCinematicPrompt('A sunset over the ocean')).toBe('A sunset over the ocean');
      expect(compileCinematicPrompt('hello', {})).toBe('hello');
    });

    it('appends the camera suffix when shot fields are present', () => {
      const out = compileCinematicPrompt('A lone rider', {
        cameraBody: 'Sony Venice',
        lensFamily: 'Zeiss Ultra Prime',
        focalLength: '24mm',
        aperture: 'f/2.8',
        shotSize: 'wide',
      });
      expect(out).toContain('A lone rider');
      expect(out.toLowerCase()).toContain('shot on sony venice');
      expect(out).toContain('Zeiss Ultra Prime');
      expect(out).toContain('24mm at f/2.8');
      expect(out).toContain('wide framing');
    });

    it('omits movement for image media type', () => {
      const out = compileCinematicPrompt('x', { movement: 'Dolly' }, 'image');
      expect(out).not.toContain('dolly');
    });

    it('includes movement for video media type', () => {
      const out = compileCinematicPrompt('x', { movement: 'Dolly' }, 'video');
      expect(out.toLowerCase()).toContain('dolly');
    });

    it('handles partial fields without leaving holes', () => {
      const out = compileCinematicPrompt('hello.', { focalLength: '50mm' });
      expect(out).toBe('hello. 50mm.');
    });

    it('upcases first character when raw prompt is empty', () => {
      const out = compileCinematicPrompt('', { mood: 'Cinematic' });
      expect(out.startsWith('C')).toBe(true);
    });
  });

  describe('summarizeShot', () => {
    it('returns empty string for empty shot', () => {
      expect(summarizeShot()).toBe('');
    });
    it('joins focal length, aperture, body, size with separator', () => {
      expect(
        summarizeShot({
          focalLength: '24mm',
          aperture: 'f/2.8',
          cameraBody: 'Sony Venice',
          shotSize: 'medium',
        })
      ).toBe('24mm · f/2.8 · Sony Venice · medium');
    });
  });

  describe('normalizeReferenceInputs', () => {
    it('returns empty array for empty input', () => {
      expect(normalizeReferenceInputs(undefined)).toEqual([]);
      expect(normalizeReferenceInputs({})).toEqual([]);
    });

    it('collects from reference / image / image_url / image_urls / referenceImageUrls', () => {
      const out = normalizeReferenceInputs({
        reference: 'https://a.com/r1.png',
        image: 'https://a.com/i1.png',
        image_url: 'https://a.com/i2.png',
        image_urls: ['https://a.com/i3.png'],
        referenceImageUrls: ['https://a.com/r2.png'],
      });
      expect(out).toEqual([
        'https://a.com/r1.png',
        'https://a.com/r2.png',
        'https://a.com/i1.png',
        'https://a.com/i2.png',
        'https://a.com/i3.png',
      ]);
    });

    it('dedupes URLs while preserving the first-seen order', () => {
      const out = normalizeReferenceInputs({
        image_url: 'https://x/1.png',
        image_urls: ['https://x/1.png', 'https://x/2.png'],
      });
      expect(out).toEqual(['https://x/1.png', 'https://x/2.png']);
    });

    it('extracts url from object-shaped values', () => {
      const out = normalizeReferenceInputs({
        image: { url: 'https://x/o.png' },
      });
      expect(out).toEqual(['https://x/o.png']);
    });
  });

  describe('shotToCameraPayload', () => {
    it('returns undefined for empty shot', () => {
      expect(shotToCameraPayload({})).toBeUndefined();
    });
    it('maps fields to snake_case keys', () => {
      expect(
        shotToCameraPayload({ cameraBody: 'Sony Venice', focalLength: '50mm', aperture: 'f/2' })
      ).toMatchObject({ body: 'Sony Venice', focal_length: '50mm', aperture: 'f/2' });
    });
  });
});
