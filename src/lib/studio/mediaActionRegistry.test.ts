import { describe, expect, it } from 'vitest';

import {
  MEDIA_ACTIONS,
  getActionDefaults,
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
});
