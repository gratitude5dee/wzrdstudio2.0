import type { AudioData, ClipDuration } from './types';

export const CLIP_DURATIONS: ClipDuration[] = [15, 20, 25, 30];

export const INITIAL_AUDIO: AudioData = {
  fileName: null,
  fileUrl: null,
  totalDuration: 0,
  selectionStart: 0,
  selectionDuration: 15,
  zoom: 1,
  confirmed: false,
  peaks: [],
};
