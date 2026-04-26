// Decode an audio File once with the Web Audio API and downsample to peaks.
// Returns clip-relative duration in seconds and a normalized 0..1 peaks array.

const TARGET_PEAKS = 256;

export interface WaveformResult {
  peaks: number[];
  durationSec: number;
}

function fallbackPeaks(): number[] {
  return Array.from({ length: TARGET_PEAKS }, (_, i) => {
    const h = Math.sin(i * 0.35) * 0.4 + Math.sin(i * 0.13) * 0.3 + 0.55;
    return Math.max(0.15, Math.min(1, Math.abs(h)));
  });
}

export async function decodeWaveform(file: File): Promise<WaveformResult> {
  try {
    const AC: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return { peaks: fallbackPeaks(), durationSec: 0 };

    const ctx = new AC();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const data = audioBuffer.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(data.length / TARGET_PEAKS));
    const peaks: number[] = new Array(TARGET_PEAKS).fill(0);
    let max = 0;
    for (let i = 0; i < TARGET_PEAKS; i++) {
      let sum = 0;
      const start = i * bucketSize;
      const end = Math.min(data.length, start + bucketSize);
      for (let j = start; j < end; j++) sum += data[j] * data[j];
      const rms = Math.sqrt(sum / Math.max(1, end - start));
      peaks[i] = rms;
      if (rms > max) max = rms;
    }
    // Normalize 0..1
    const norm = max > 0 ? peaks.map((p) => p / max) : peaks;
    const duration = audioBuffer.duration;
    try { ctx.close(); } catch { /* ignore */ }
    return { peaks: norm, durationSec: duration };
  } catch (e) {
    console.warn('[decodeWaveform] decode failed, using fallback', e);
    return { peaks: fallbackPeaks(), durationSec: 0 };
  }
}
