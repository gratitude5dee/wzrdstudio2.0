import { describe, expect, it } from 'vitest';

import {
  MEDIA_ACTIONS,
  getActionDefaults,
  getActionInputBinding,
  getMediaActionById,
} from './mediaActionRegistry';
import {
  getDefaultAudioModel,
  getDefaultImageEditModel,
  getDefaultImageModel,
  getDefaultImageToVideoModel,
  getDefaultTextModel,
  getDefaultVideoModel,
} from '@/lib/studio-model-constants';

const PREVIEW_TYPES = new Set(['text', 'image', 'video', 'audio', 'json', '3d', 'tensor', 'string', 'number', 'boolean', 'any']);
const BATCH_POLICIES = new Set(['single', 'map', 'zip', 'cartesian', 'fanOut']);
const REQUIRED_ACTION_IDS = [
  'text.enter',
  'text.upload',
  'text.analyze',
  'text.summarize',
  'text.task-breakdown',
  'text.prompt-generation',
  'text.scene-storyboarding',
  'image.upload',
  'image.generate',
  'image.analysis',
  'image.object-detection',
  'image.image-to-image',
  'image.style-transfer',
  'image.edit',
  'image.depth-map',
  'image.sketch',
  'image.to-world',
  'video.upload',
  'video.analysis',
  'video.reasoning',
  'video.object-detection',
  'video.track-anything',
  'video.extract-frames',
  'video.frame-grid',
  'video.generate',
  'video.image-to-video',
  'video.video-to-video',
  'video.edit',
  'video.lipsync',
  'audio.upload',
  'audio.analysis',
  'audio.separate',
  'audio.to-prompt',
  'audio.tts',
  'audio.music',
  'audio.sfx',
  'audio.manipulate',
  'asset.upload-3d',
  'asset.image-to-3d',
  'asset.text-to-3d',
  'asset.preview-convert',
  'embed.url',
  'embed.editframe',
  'embed.remotion',
  'embed.hyperframes',
  'embed.browser-agent',
  'fal.ffmpeg',
  'batch.cartesian',
  'output.materialize',
];

describe('mediaActionRegistry', () => {
  it('keeps action ids unique and actions executable', () => {
    const ids = MEDIA_ACTIONS.map((action) => action.actionId);
    expect(new Set(ids).size).toBe(ids.length);

    for (const action of MEDIA_ACTIONS) {
      expect(action.actionId).toMatch(/^[a-z0-9.-]+$/);
      expect(action.inputs.every((port) => port.id && port.name && port.datatype)).toBe(true);
      expect(action.outputs.every((port) => port.id && port.name && port.datatype)).toBe(true);
      expect(PREVIEW_TYPES.has(action.outputPreviewType)).toBe(true);
      expect(BATCH_POLICIES.has(action.batchPolicy)).toBe(true);
      expect(typeof action.costEstimate).toBe('number');
      for (const port of action.inputs) {
        expect(port.paramKey ?? port.name).toBeTruthy();
      }
    }
  });

  it('defines the required Fal-primary defaults without changing text to an invented Fal model', () => {
    expect(getDefaultImageModel()).toBe('fal-ai/nano-banana-2');
    expect(getDefaultImageEditModel()).toBe('fal-ai/nano-banana-2/edit');
    expect(getDefaultVideoModel()).toBe('fal-ai/kling-video/o3/standard/text-to-video');
    expect(getDefaultImageToVideoModel()).toBe('fal-ai/kling-video/o3/standard/image-to-video');
    expect(getDefaultAudioModel()).toBe('fal-ai/elevenlabs/tts/turbo-v2.5');
    expect(getDefaultTextModel().startsWith('fal-ai/')).toBe(false);
  });

  it('provides registry defaults for node creation and runtime routing', () => {
    const imageAction = getMediaActionById('image.generate');
    expect(imageAction?.defaultModelId).toBe('fal-ai/nano-banana-2');
    expect(imageAction?.outputs.some((port) => port.datatype === 'image')).toBe(true);

    const defaults = imageAction ? getActionDefaults(imageAction) : {};
    expect(defaults).toMatchObject({
      actionId: 'image.generate',
      model: 'fal-ai/nano-banana-2',
      batchPolicy: 'map',
    });
  });

  it('includes cartesian batch and materialized output actions', () => {
    expect(getMediaActionById('batch.cartesian')?.batchPolicy).toBe('cartesian');
    expect(getMediaActionById('output.materialize')?.nodeKind).toBe('Output');
  });

  it('covers the requested Studio media action taxonomy', () => {
    for (const actionId of REQUIRED_ACTION_IDS) {
      expect(getMediaActionById(actionId), actionId).toBeTruthy();
    }
  });

  it('declares semantic bindings for common generation paths', () => {
    expect(getActionInputBinding('image.generate', 'prompt')).toMatchObject({
      paramKey: 'prompt',
      datatype: 'text',
    });
    expect(getActionInputBinding('image.edit', 'image')).toMatchObject({
      paramKey: 'sourceImageUrl',
      datatype: 'image',
    });
    expect(getActionInputBinding('video.image-to-video', 'image')).toMatchObject({
      paramKey: 'firstFrameImageUrl',
      datatype: 'image',
    });
  });

  it('marks Fal-backed actions with compatible model metadata', () => {
    const imageEdit = getMediaActionById('image.edit');
    const videoEdit = getMediaActionById('video.edit');
    expect(imageEdit?.modelMediaType).toBe('image');
    expect(imageEdit?.modelWorkflowTypes).toContain('image-to-image');
    expect(videoEdit?.modelMediaType).toBe('video');
    expect(videoEdit?.modelWorkflowTypes).toContain('video-to-video');
  });
});
