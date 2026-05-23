// Shared frontend/backend types for Kanvas Lyrics templates.
// Times are stored in MILLISECONDS at the API/db boundary; the wizard UI
// works in seconds and converts at the service boundary.

export type TemplateStatus =
  | 'draft'
  | 'audio_ready'
  | 'lyrics_processing'
  | 'lyrics_ready'
  | 'markers_ready'
  | 'saved'
  | 'failed'
  | 'archived';

export type ClipDurationMs = 15000 | 30000 | 45000 | 60000;

export interface LyricWord {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence?: number;
}

export interface LyricBlock {
  id: string;
  startTimeMs: number;
  endTimeMs: number;
  words: LyricWord[];
}

export interface CutMarker {
  id: string;
  timestampMs: number;
}

export interface KanvasLyricTemplate {
  id: string;
  projectId: string | null;
  title: string;
  status: TemplateStatus;
  sourceAudioAssetId: string;
  trimmedAudioAssetId: string | null;
  selectionStartMs: number;
  selectionDurationMs: ClipDurationMs;
  totalDurationMs: number | null;
  waveformPeaks: number[];
  lyricBlocks: LyricBlock[];
  cutMarkers: CutMarker[];
  transcriptMeta: Record<string, unknown>;
  renderDefaults: Record<string, unknown>;
  errorMessage: string | null;
  savedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTemplatesFilters {
  projectId?: string;
  status?: TemplateStatus;
  limit?: number;
}
