import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getImageSize } from '@/services/worldLabsService';
import type { AspectRatioType, ResolutionType } from '@/types/worldview';

// ---------------------------------------------------------------------------
// getImageSize — pure function, no mocks needed
// ---------------------------------------------------------------------------

describe('getImageSize', () => {
  it('returns correct dimensions for 512 @ 16:9', () => {
    expect(getImageSize('512', '16:9')).toEqual({ width: 512, height: 288 });
  });

  it('returns correct dimensions for 1K @ 4:3', () => {
    expect(getImageSize('1K', '4:3')).toEqual({ width: 1024, height: 768 });
  });

  it('returns correct dimensions for 2K @ 1:1', () => {
    expect(getImageSize('2K', '1:1')).toEqual({ width: 2048, height: 2048 });
  });

  it('returns correct dimensions for 4K @ 2.39:1', () => {
    const { width, height } = getImageSize('4K', '2.39:1');
    expect(width).toBe(4096);
    expect(height).toBe(Math.round(4096 / 2.39));
  });

  it('returns correct dimensions for 1K @ 9:16 (portrait)', () => {
    const { width, height } = getImageSize('1K', '9:16');
    expect(width).toBe(1024);
    expect(height).toBe(Math.round(1024 / (9 / 16)));
  });

  it('covers all resolution × ratio combinations without error', () => {
    const resolutions: ResolutionType[] = ['512', '1K', '2K', '4K'];
    const ratios: AspectRatioType[] = ['16:9', '4:3', '1:1', '2.39:1', '9:16'];

    for (const res of resolutions) {
      for (const ratio of ratios) {
        const size = getImageSize(res, ratio);
        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Service function signatures — verify they exist and are functions
// ---------------------------------------------------------------------------

describe('worldLabsService exports', () => {
  // We dynamically import so that Supabase client init (which reads
  // localStorage) can happen inside the test runner environment.
  it('exports expected functions', async () => {
    const mod = await import('@/services/worldLabsService');
    const svc = mod.worldLabsService;

    expect(typeof svc.generateWorld).toBe('function');
    expect(typeof svc.pollOperation).toBe('function');
    expect(typeof svc.getWorld).toBe('function');
    expect(typeof svc.listWorlds).toBe('function');
    expect(typeof svc.uploadMediaAsset).toBe('function');
    expect(typeof svc.captureTake).toBe('function');
    expect(typeof svc.generateShot).toBe('function');
  });
});
