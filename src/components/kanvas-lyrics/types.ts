export type WizardStep = 1 | 2 | 3;

export type AppState =
  | 'upload'
  | 'trim'
  | 'lyrics_edit'
  | 'lyrics_complete'
  | 'markers_edit';

export type ClipDuration = 15 | 30 | 45 | 60;

export type TranscribeStatus =
  | 'idle'
  | 'uploading'
  | 'transcribing'
  | 'parsing'
  | 'ready'
  | 'failed';

export interface AudioData {
  fileName: string | null;
  fileUrl: string | null;
  totalDuration: number;
  selectionStart: number;
  selectionDuration: ClipDuration;
  zoom: number;
  confirmed: boolean;
  peaks: number[];
}

export interface LyricWord {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

export interface LyricBlock {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  words: LyricWord[];
}

export interface CutMarker {
  id: string;
  timestamp: number;
}
