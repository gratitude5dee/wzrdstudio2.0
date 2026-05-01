// Slice a window out of a source audio File using OfflineAudioContext and
// encode the result as a 16-bit PCM WAV Blob. WAV is large but universally
// supported and avoids shipping an MP3 encoder; the clips are at most 60s
// so total size stays comfortably small (~10MB stereo @ 44.1kHz).

export interface ClipResult {
  blob: Blob;
  durationMs: number;
  fileName: string;
  mimeType: 'audio/wav';
}

export async function sliceAudioToWav(
  file: File,
  startSec: number,
  durationSec: number,
  outFileName?: string
): Promise<ClipResult> {
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) throw new Error('Web Audio API is not available in this browser');

  // Decode source file
  const tempCtx = new AC();
  const arrayBuffer = await file.arrayBuffer();
  let sourceBuffer: AudioBuffer;
  try {
    sourceBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    try { await tempCtx.close(); } catch { /* ignore */ }
  }

  const sampleRate = sourceBuffer.sampleRate;
  const channels = Math.min(2, sourceBuffer.numberOfChannels);
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const totalAvailable = Math.max(0, sourceBuffer.length - startSample);
  const requestedSamples = Math.floor(durationSec * sampleRate);
  const lengthSamples = Math.min(requestedSamples, totalAvailable);

  if (lengthSamples <= 0) {
    throw new Error('Selected clip range is empty');
  }

  // Render the window through OfflineAudioContext so any necessary
  // resampling/copying is handled cleanly.
  const OAC: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!OAC) throw new Error('OfflineAudioContext is not available in this browser');

  const offline = new OAC(channels, lengthSamples, sampleRate);
  const sliceBuffer = offline.createBuffer(channels, lengthSamples, sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const src = sourceBuffer.getChannelData(Math.min(ch, sourceBuffer.numberOfChannels - 1));
    const dst = sliceBuffer.getChannelData(ch);
    dst.set(src.subarray(startSample, startSample + lengthSamples));
  }
  const node = offline.createBufferSource();
  node.buffer = sliceBuffer;
  node.connect(offline.destination);
  node.start(0);
  const rendered = await offline.startRendering();

  const wav = encodeWav(rendered);
  const baseName = (outFileName ?? file.name.replace(/\.[^.]+$/, '')).replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = new Blob([wav], { type: 'audio/wav' });
  return {
    blob,
    durationMs: Math.round((lengthSamples / sampleRate) * 1000),
    fileName: `${baseName}-clip.wav`,
    mimeType: 'audio/wav',
  };
}

// 16-bit PCM WAV encoder. Interleaves channels and writes a standard
// RIFF/WAVE header. Sufficient for upload + Gemini transcription.
function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;

  const out = new ArrayBuffer(bufferSize);
  const view = new DataView(out);
  let offset = 0;

  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };

  writeStr('RIFF');
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeStr('WAVE');
  writeStr('fmt ');
  view.setUint32(offset, 16, true); offset += 4; // fmt chunk size
  view.setUint16(offset, 1, true); offset += 2;  // PCM
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true); offset += 2;
  writeStr('data');
  view.setUint32(offset, dataSize, true); offset += 4;

  // Interleave + clamp to int16
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) channelData.push(buffer.getChannelData(ch));
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      let s = channelData[ch][i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return out;
}
