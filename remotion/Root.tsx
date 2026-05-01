import React from 'react';
import { Composition } from 'remotion';
import { VideoComposition, type VideoCompositionProps } from '../src/components/editor/VideoComposition';
import {
  LyricRemixComposition,
  type LyricRemixCompositionProps,
} from '../src/components/remix/LyricRemixComposition';

const DEFAULT_PROPS: VideoCompositionProps = {
  clips: [],
  audioTracks: [],
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

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="VideoEditorComposition"
      component={VideoComposition}
      durationInFrames={300}
      fps={30}
      width={1280}
      height={720}
      defaultProps={DEFAULT_PROPS}
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
