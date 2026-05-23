import React from 'react';
import { Composition } from 'remotion';
import {
  EditorComposition,
  type EditorCompositionProps,
} from '../src/components/editor/remotion/EditorComposition';
import {
  LyricRemixComposition,
  type LyricRemixCompositionProps,
} from '../src/components/remix/LyricRemixComposition';
import type { CompositionSettings } from '../src/store/videoEditorStore';

const DEFAULT_COMPOSITION: CompositionSettings = {
  width: 1280,
  height: 720,
  fps: 30,
  aspectRatio: '16:9',
  duration: 10000,
  backgroundColor: '#000000',
};

const DEFAULT_PROPS: EditorCompositionProps = {
  clips: [],
  audioTracks: [],
  composition: DEFAULT_COMPOSITION,
  selectedClipIds: [],
  keyframes: [],
};

const DEFAULT_REMIX_PROPS: LyricRemixCompositionProps = {
  audioUrl: null,
  captions: [],
  lyricStyleId: 'default',
  scale: 0.65,
  backgroundClips: [],
  cutMarkers: [],
  noCuts: false,
  aspectRatio: '9:16',
  durationMs: 15000,
};

const getTimelineDurationMs = (props: EditorCompositionProps) => {
  const clipDuration = props.clips.reduce((max, clip) => {
    const start = clip.startTime ?? 0;
    return Math.max(max, start + (clip.duration ?? 0));
  }, 0);

  const audioDuration = props.audioTracks.reduce((max, track) => {
    const start = track.startTime ?? 0;
    return Math.max(max, start + (track.duration ?? 0));
  }, 0);

  return Math.max(props.composition.duration, clipDuration, audioDuration, 1000);
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="VideoEditorComposition"
      component={EditorComposition}
      durationInFrames={300}
      fps={30}
      width={1280}
      height={720}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={({ props }) => {
        const fps = Math.max(1, Math.round(props.composition.fps || DEFAULT_COMPOSITION.fps));
        return {
          durationInFrames: Math.max(1, Math.ceil((getTimelineDurationMs(props) / 1000) * fps)),
          fps,
          width: Math.max(1, Math.round(props.composition.width || DEFAULT_COMPOSITION.width)),
          height: Math.max(1, Math.round(props.composition.height || DEFAULT_COMPOSITION.height)),
        };
      }}
    />
    <Composition
      id="KanvasLyricRemix"
      component={LyricRemixComposition}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={DEFAULT_REMIX_PROPS}
    />
  </>
);

export default RemotionRoot;
