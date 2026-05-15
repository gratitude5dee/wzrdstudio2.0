import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildRemotionArgs,
  getInputProps,
  parseArgs,
} from './render-editor-composition.mjs';

const inputProps = {
  clips: [],
  audioTracks: [],
  keyframes: [],
  composition: {
    width: 1280,
    height: 720,
    fps: 30,
    aspectRatio: '16:9',
    duration: 1000,
    backgroundColor: '#000000',
  },
};

describe('render-editor-composition runner', () => {
  it('parses runner arguments', () => {
    expect(
      parseArgs([
        '--props',
        './manifest.json',
        '--out',
        './export.mp4',
        '--crf',
        '18',
        '--dry-run',
      ])
    ).toEqual({
      props: './manifest.json',
      out: './export.mp4',
      crf: '18',
      'dry-run': true,
    });
  });

  it('accepts raw props or a render manifest', () => {
    expect(getInputProps(inputProps)).toBe(inputProps);
    expect(getInputProps({ inputProps })).toBe(inputProps);
    expect(() => getInputProps({ inputProps: { clips: [] } })).toThrow('audioTracks array');
  });

  it('accepts the committed smoke manifest fixture', () => {
    const fixture = JSON.parse(
      readFileSync('scripts/fixtures/editor-remotion-smoke-manifest.json', 'utf8')
    );

    expect(getInputProps(fixture)).toMatchObject({
      clips: [
        {
          id: 'smoke-image-1',
          type: 'image',
          transition: { type: 'fade' },
        },
      ],
      audioTracks: [],
      keyframes: [
        {
          targetId: 'smoke-image-1',
        },
      ],
      composition: {
        width: 320,
        height: 180,
        fps: 15,
        duration: 1000,
      },
    });
  });

  it('builds the Remotion CLI command arguments', () => {
    expect(
      buildRemotionArgs({
        entry: 'remotion/index.ts',
        composition: 'VideoEditorComposition',
        out: './export.mp4',
        propsPath: '/tmp/editor-props.json',
        codec: 'h264',
        crf: '18',
        x264Preset: 'slow',
        concurrency: '4',
      })
    ).toEqual([
      'render',
      'remotion/index.ts',
      'VideoEditorComposition',
      './export.mp4',
      '--props',
      '/tmp/editor-props.json',
      '--codec',
      'h264',
      '--overwrite',
      '--crf',
      '18',
      '--x264-preset',
      'slow',
      '--concurrency',
      '4',
    ]);
  });
});
