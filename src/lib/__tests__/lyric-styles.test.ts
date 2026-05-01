import { describe, expect, it } from 'vitest';
import { LYRIC_STYLES, getLyricStyle, isLyricStyleId } from '@/lib/lyric-styles';

describe('lyric-styles', () => {
  it('contains the eight required preset styles', () => {
    expect(LYRIC_STYLES.map((style) => style.id)).toEqual([
      'default',
      'none',
      'heartless',
      'fly',
      'pikachu',
      'wave',
      'hotpink',
      'brat',
    ]);
  });

  it('falls back to default style for unknown ids', () => {
    expect(getLyricStyle('missing').id).toBe('default');
  });

  it('guards style ids', () => {
    expect(isLyricStyleId('pikachu')).toBe(true);
    expect(isLyricStyleId('missing')).toBe(false);
  });
});
