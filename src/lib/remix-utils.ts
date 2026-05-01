import type { CutMarker, LyricBlock } from '@/features/kanvas-lyrics/types';
import type { FootageAsset, RemixTimelineSlot } from '@/features/remix/types';

export interface LyricCaption {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface CaptionLine {
  text: string;
  startMs: number;
  endMs: number;
  words: LyricCaption[];
}

const SNAP_MS = 50;
const MARKER_DEDUPE_MS = 250;

export function lyricBlocksToCaptions(blocks: LyricBlock[]): LyricCaption[] {
  return blocks
    .flatMap((block) =>
      block.words.map((word) => ({
        text: word.text,
        startMs: word.startTimeMs,
        endMs: Math.max(word.startTimeMs + 1, word.endTimeMs),
        confidence: typeof word.confidence === 'number' ? word.confidence : 0.86,
      }))
    )
    .filter((word) => word.text.trim().length > 0)
    .sort((a, b) => a.startMs - b.startMs);
}

export function captionsToLines(captions: LyricCaption[], combineWithinMs = 1200): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: LyricCaption[] = [];

  for (const caption of captions) {
    const previous = current[current.length - 1];
    const shouldStartNew =
      current.length > 0 &&
      (caption.startMs - (previous?.endMs ?? caption.startMs) > 360 ||
        caption.endMs - current[0].startMs > combineWithinMs ||
        current.length >= 5);

    if (shouldStartNew) {
      lines.push(captionGroupToLine(current));
      current = [];
    }
    current.push(caption);
  }

  if (current.length > 0) lines.push(captionGroupToLine(current));
  return lines;
}

function captionGroupToLine(words: LyricCaption[]): CaptionLine {
  return {
    text: words.map((word) => word.text).join(' '),
    startMs: words[0]?.startMs ?? 0,
    endMs: words[words.length - 1]?.endMs ?? 0,
    words,
  };
}

export function snapMarkerMs(valueMs: number): number {
  return Math.max(0, Math.round(valueMs / SNAP_MS) * SNAP_MS);
}

export function normalizeCutMarkers(markers: CutMarker[], durationMs: number): CutMarker[] {
  const sorted = markers
    .map((marker) => ({
      id: marker.id,
      timestampMs: Math.min(durationMs, snapMarkerMs(marker.timestampMs)),
    }))
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const out: CutMarker[] = [];
  for (const marker of sorted) {
    const last = out[out.length - 1];
    if (!last || marker.timestampMs - last.timestampMs >= MARKER_DEDUPE_MS) out.push(marker);
  }
  return out;
}

export function quoteRemixCredits(durationMs: number, quantity: number): number {
  const safeQuantity = Math.max(1, Math.min(10, Math.round(quantity)));
  return Math.ceil(Math.max(1, durationMs / 1000)) * safeQuantity;
}

export function estimateRequiredClipSlots(durationMs: number, assets: Pick<FootageAsset, 'durationMs'>[]): number {
  if (durationMs <= 0) return 0;
  const average = assets.length
    ? assets.reduce((sum, asset) => sum + Math.max(1000, asset.durationMs), 0) / assets.length
    : 6000;
  return Math.max(1, Math.ceil(durationMs / average));
}

export function pickClipsForDuration(
  assets: FootageAsset[],
  durationMs: number,
  seed = 1
): FootageAsset[] {
  if (assets.length === 0 || durationMs <= 0) return [];

  const shuffled = seededShuffle(assets, seed);
  const picked: FootageAsset[] = [];
  let total = 0;
  let index = 0;

  while (total < durationMs && index < shuffled.length * 3) {
    const asset = shuffled[index % shuffled.length];
    picked.push(asset);
    total += Math.max(1000, asset.durationMs);
    index += 1;
  }

  return picked;
}

export function seededShuffle<T>(items: T[], seed = 1): T[] {
  const out = [...items];
  let state = seed || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
