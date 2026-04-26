import { describe, expect, it } from 'vitest';
import { Composition } from 'remotion';

import { VideoComposition } from '../src/components/editor/VideoComposition';
import { RemotionRoot } from './Root';

describe('RemotionRoot', () => {
  it('declares the editor composition with the expected defaults', () => {
    const element = RemotionRoot({});

    expect(element.type).toBe(Composition);
    expect(element.props).toMatchObject({
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
});
