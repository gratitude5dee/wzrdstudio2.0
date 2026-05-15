import type { EditorCompositionProps } from '@/components/editor/remotion/EditorComposition';
import type { CompositionSettings } from '@/store/videoEditorStore';
import {
  DEFAULT_EDITOR_COMPOSITION,
  getTimelineDurationMs,
  parseEditorTimelineDocument,
} from './timelineDocument';

export const EDITOR_REMOTION_ENTRY_POINT = 'remotion/index.ts';
export const EDITOR_REMOTION_COMPOSITION_ID = 'VideoEditorComposition';

export interface EditorRemotionRenderManifest {
  renderer: 'remotion';
  version: 1;
  entryPoint: typeof EDITOR_REMOTION_ENTRY_POINT;
  compositionId: typeof EDITOR_REMOTION_COMPOSITION_ID;
  inputProps: EditorCompositionProps;
  output: {
    format: 'mp4';
    codec: 'h264';
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    durationInFrames: number;
  };
  createdAt: string;
}

const getDurationInFrames = (durationMs: number, fps: number) =>
  Math.max(1, Math.ceil((durationMs / 1000) * fps));

const normalizeRenderComposition = (composition: CompositionSettings): CompositionSettings => ({
  ...DEFAULT_EDITOR_COMPOSITION,
  ...composition,
  width: Math.max(1, Math.round(composition.width || DEFAULT_EDITOR_COMPOSITION.width)),
  height: Math.max(1, Math.round(composition.height || DEFAULT_EDITOR_COMPOSITION.height)),
  fps: Math.max(1, Math.round(composition.fps || DEFAULT_EDITOR_COMPOSITION.fps)),
});

export function buildEditorRemotionInputProps(timelineDocument: unknown): EditorCompositionProps {
  const parsed = parseEditorTimelineDocument(timelineDocument);
  const composition = normalizeRenderComposition(parsed.composition);
  const duration = getTimelineDurationMs(parsed.clips, parsed.audioTracks, composition.duration);

  return {
    clips: parsed.clips,
    audioTracks: parsed.audioTracks,
    composition: {
      ...composition,
      duration,
    },
    selectedClipIds: [],
    keyframes: parsed.keyframes,
  };
}

export function buildEditorRemotionRenderManifest(
  timelineDocument: unknown,
  createdAt = new Date().toISOString()
): EditorRemotionRenderManifest {
  const inputProps = buildEditorRemotionInputProps(timelineDocument);
  const { composition } = inputProps;

  return {
    renderer: 'remotion',
    version: 1,
    entryPoint: EDITOR_REMOTION_ENTRY_POINT,
    compositionId: EDITOR_REMOTION_COMPOSITION_ID,
    inputProps,
    output: {
      format: 'mp4',
      codec: 'h264',
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      durationMs: composition.duration,
      durationInFrames: getDurationInFrames(composition.duration, composition.fps),
    },
    createdAt,
  };
}
