import { describe, expect, it } from 'vitest';
import { Composition } from 'remotion';
import React from 'react';

import { VideoComposition } from '../src/components/editor/VideoComposition';
import { LyricRemixComposition } from '../src/components/remix/LyricRemixComposition';
import { RemotionRoot } from './Root';

describe('RemotionRoot', () => {
  it('declares the editor composition with the expected defaults', () => {
    const element = RemotionRoot({});
    const compositions = React.Children.toArray(element.props.children).filter(React.isValidElement);
    const editorComposition = compositions.find((child) => child.props.id === 'VideoEditorComposition');

    expect(editorComposition?.type).toBe(Composition);
    expect(editorComposition?.props).toMatchObject({
      id: 'VideoEditorComposition',
      component: VideoComposition,
      durationInFrames: 300,
      fps: 30,
      width: 1280,
      height: 720,
      defaultProps: {
        clips: [],
        audioTracks: [],
      },
    });
  });

  it('declares the kanvas lyric remix composition with vertical defaults', () => {
    const element = RemotionRoot({});
    const compositions = React.Children.toArray(element.props.children).filter(React.isValidElement);
    const remixComposition = compositions.find((child) => child.props.id === 'KanvasLyricRemix');

    expect(remixComposition?.type).toBe(Composition);
    expect(remixComposition?.props).toMatchObject({
      id: 'KanvasLyricRemix',
      component: LyricRemixComposition,
      durationInFrames: 450,
      fps: 30,
      width: 1080,
      height: 1920,
      defaultProps: {
        captions: [],
        lyricStyleId: 'default',
        scale: 0.65,
        aspectRatio: '9:16',
        durationMs: 15000,
      },
    });
  });
});
