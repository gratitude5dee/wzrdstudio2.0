import { describe, expect, it } from 'vitest';
import { Composition } from 'remotion';
import React from 'react';

import { EditorComposition, type EditorCompositionProps } from '../src/components/editor/remotion/EditorComposition';
import { LyricRemixComposition } from '../src/components/remix/LyricRemixComposition';
import { RemotionRoot } from './Root';

describe('RemotionRoot', () => {
  it('declares the editor composition with the full-fidelity editor renderer', () => {
    const element = RemotionRoot({});
    const compositions = React.Children.toArray(element.props.children).filter(React.isValidElement);
    const editorComposition = compositions.find((child) => child.props.id === 'VideoEditorComposition');

    expect(editorComposition?.type).toBe(Composition);
    expect(editorComposition?.props).toMatchObject({
      id: 'VideoEditorComposition',
      component: EditorComposition,
      durationInFrames: 300,
      fps: 30,
      width: 1280,
      height: 720,
      defaultProps: {
        clips: [],
        audioTracks: [],
        selectedClipIds: [],
        keyframes: [],
        composition: {
          width: 1280,
          height: 720,
          fps: 30,
          duration: 10000,
          backgroundColor: '#000000',
        },
      },
    });
  });

  it('derives editor render metadata from timeline props', () => {
    const element = RemotionRoot({});
    const compositions = React.Children.toArray(element.props.children).filter(React.isValidElement);
    const editorComposition = compositions.find((child) => child.props.id === 'VideoEditorComposition');
    const calculateMetadata = editorComposition?.props.calculateMetadata;

    const props: EditorCompositionProps = {
      clips: [
        {
          id: 'clip-1',
          type: 'video',
          name: 'Clip',
          url: 'https://example.com/clip.mp4',
          startTime: 1500,
          duration: 2500,
          layer: 0,
          transforms: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
          },
        },
      ],
      audioTracks: [
        {
          id: 'audio-1',
          type: 'audio',
          name: 'Audio',
          url: 'https://example.com/audio.mp3',
          startTime: 0,
          duration: 6000,
          volume: 1,
          isMuted: false,
        },
      ],
      composition: {
        width: 1920,
        height: 1080,
        fps: 24,
        aspectRatio: '16:9',
        duration: 1000,
        backgroundColor: '#111111',
      },
      selectedClipIds: [],
      keyframes: [],
    };

    expect(calculateMetadata?.({ props })).toMatchObject({
      durationInFrames: 144,
      fps: 24,
      width: 1920,
      height: 1080,
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
