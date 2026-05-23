import { describe, expect, it } from 'vitest';
import {
  captionsToLines,
  lyricBlocksToCaptions,
  normalizeCutMarkers,
  pickClipsForDuration,
  quoteRemixCredits,
} from '@/lib/remix-utils';
import type { FootageAsset } from '@/features/remix/types';

describe('remix-utils', () => {
  it('converts lyric blocks to sorted caption contract with confidence', () => {
    const captions = lyricBlocksToCaptions([
      {
        id: 'b1',
        startTimeMs: 0,
        endTimeMs: 1000,
        words: [
          { id: 'w2', text: 'world', startTimeMs: 500, endTimeMs: 900, confidence: 0.7 },
          { id: 'w1', text: 'hello', startTimeMs: 0, endTimeMs: 400 },
        ],
      },
    ]);

    expect(captions).toEqual([
      { text: 'hello', startMs: 0, endMs: 400, confidence: 0.86 },
      { text: 'world', startMs: 500, endMs: 900, confidence: 0.7 },
    ]);
  });

  it('groups captions into short tiktok-style lines', () => {
    const lines = captionsToLines([
      { text: 'one', startMs: 0, endMs: 200, confidence: 1 },
      { text: 'two', startMs: 250, endMs: 400, confidence: 1 },
      { text: 'three', startMs: 1700, endMs: 1900, confidence: 1 },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('one two');
    expect(lines[1].text).toBe('three');
  });

  it('snaps and dedupes cut markers', () => {
    const markers = normalizeCutMarkers(
      [
        { id: 'a', timestampMs: 53 },
        { id: 'b', timestampMs: 75 },
        { id: 'c', timestampMs: 1000 },
      ],
      1200
    );

    expect(markers).toEqual([
      { id: 'a', timestampMs: 50 },
      { id: 'c', timestampMs: 1000 },
    ]);
  });

  it('quotes credits from duration and quantity', () => {
    expect(quoteRemixCredits(15000, 5)).toBe(75);
    expect(quoteRemixCredits(15100, 1)).toBe(16);
    expect(quoteRemixCredits(15000, 20)).toBe(150);
  });

  it('selects enough clips to cover duration', () => {
    const assets: FootageAsset[] = [
      createAsset('a', 4000),
      createAsset('b', 5000),
      createAsset('c', 6000),
    ];
    const picked = pickClipsForDuration(assets, 12000, 1);
    const total = picked.reduce((sum, clip) => sum + clip.durationMs, 0);

    expect(total).toBeGreaterThanOrEqual(12000);
    expect(picked.length).toBeGreaterThan(1);
  });
});

function createAsset(id: string, durationMs: number): FootageAsset {
  return {
    id,
    owner: 'system',
    categoryId: null,
    title: id,
    source: 'preselected',
    url: `/${id}.mp4`,
    posterUrl: null,
    durationMs,
    aspectRatio: '9:16',
    tags: [],
    createdAt: '2026-05-01T00:00:00Z',
  };
}
