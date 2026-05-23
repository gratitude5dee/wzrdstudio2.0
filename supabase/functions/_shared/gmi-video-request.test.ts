import type { CatalogModel } from './ai-model-catalog.ts';
import { buildGmiVideoQueueRequest } from './gmi-video-request.ts';
import { translateGmiQueuePayload } from './gmi-types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEquals(actual: unknown, expected: unknown, message: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}.\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}

const ltxModel: Pick<
  CatalogModel,
  'id' | 'endpointId' | 'provider' | 'mediaType' | 'workflowType' | 'payloadKeys'
> = {
  id: 'gmi/ltx-fast-i2v',
  endpointId: 'ltx-2-fast-image-to-video',
  provider: 'gmi-cloud',
  mediaType: 'video',
  workflowType: 'image-to-video',
  payloadKeys: ['image_uri', 'prompt', 'duration', 'resolution', 'fps', 'generate_audio', 'camera_motion'],
};

const seedanceImageModel: Pick<
  CatalogModel,
  'id' | 'endpointId' | 'provider' | 'mediaType' | 'workflowType' | 'payloadKeys'
> = {
  id: 'gmi/seedance-2.0-i2v',
  endpointId: 'seedance-2-0-260128',
  provider: 'gmi-cloud',
  mediaType: 'video',
  workflowType: 'image-to-video',
  payloadKeys: ['prompt', 'first_frame', 'duration', 'resolution', 'ratio', 'seed', 'watermark', 'generate_audio'],
};

const wanReferenceModel: Pick<
  CatalogModel,
  'id' | 'endpointId' | 'provider' | 'mediaType' | 'workflowType' | 'payloadKeys'
> = {
  id: 'gmi/wan2.7-r2v',
  endpointId: 'wan2.7-r2v',
  provider: 'gmi-cloud',
  mediaType: 'video',
  workflowType: 'reference-to-video',
  payloadKeys: ['prompt', 'reference_image', 'reference_video', 'resolution', 'ratio', 'duration', 'prompt_extend', 'watermark', 'seed'],
};

Deno.test('edge-side LTX translation normalizes duration to the nearest lower supported value', () => {
  const fiveSecondPayload = translateGmiQueuePayload('ltx-2-fast-image-to-video', {
    image_url: 'https://example.com/frame.png',
    prompt: 'Subtle portrait motion',
    duration: 5,
  });
  assertEquals(fiveSecondPayload.duration, 6, '5-second requests should normalize up to the minimum supported duration');

  const fourKPayload = translateGmiQueuePayload('ltx-2-fast-image-to-video', {
    image_url: 'https://example.com/frame.png',
    prompt: 'Epic landscape reveal',
    duration: 12,
    resolution: '4K',
    fps: 25,
  });
  assertEquals(fourKPayload.duration, 10, '4K requests should clamp to the largest allowed duration at that resolution');
  assertEquals(fourKPayload.resolution, '3840x2160', '4K aliases should normalize to the canonical resolution');

  const fastFpsPayload = translateGmiQueuePayload('ltx-2-fast-image-to-video', {
    image_url: 'https://example.com/frame.png',
    prompt: 'Fast motion pass',
    duration: 20,
    resolution: '1920x1080',
    fps: 50,
  });
  assertEquals(fastFpsPayload.duration, 10, '50 fps requests should normalize to supported durations only');
  assertEquals(fastFpsPayload.fps, 50, 'Supported FPS values should be preserved');

  const validPayload = translateGmiQueuePayload('ltx-2-fast-image-to-video', {
    image_url: 'https://example.com/frame.png',
    prompt: 'Locked-off cinematic move',
    duration: 14,
    resolution: '1080p',
    fps: 25,
  });
  assertEquals(validPayload.duration, 14, 'Supported durations should pass through unchanged');
  assertEquals(validPayload.resolution, '1920x1080', '1080p aliases should normalize to the canonical resolution');
});

Deno.test('edge-side LTX translation parses numeric strings and drops invalid camera motion', () => {
  const payload = translateGmiQueuePayload('gmi/ltx-fast-i2v', {
    image_url: 'https://example.com/frame.png',
    prompt: 'A studio portrait',
    duration: '10',
    fps: '25',
    resolution: '1440p',
    generate_audio: 'false',
    camera_motion: 'orbit',
  });

  assertDeepEquals(payload, {
    image_uri: 'https://example.com/frame.png',
    prompt: 'A studio portrait',
    duration: 10,
    resolution: '2560x1440',
    fps: 25,
    generate_audio: false,
  }, 'String inputs should coerce to valid LTX values');
  assert(!('camera_motion' in payload), 'Invalid camera motion should be omitted');
});

Deno.test('image-to-video queue requests resolve the studio model to the endpoint model and normalized payload', () => {
  const request = buildGmiVideoQueueRequest(ltxModel, {
    imageUrl: 'https://example.com/frame.png',
    prompt: 'Dynamic walk cycle',
    duration: '20',
    resolution: '1080p',
    fps: '50',
    camera_motion: 'dolly_in',
  });

  assertEquals(request.modelId, 'gmi/ltx-fast-i2v', 'The catalog model id should be preserved for observability');
  assertEquals(request.endpointModelId, 'ltx-2-fast-image-to-video', 'The queue request should submit to the canonical endpoint id');
  assertDeepEquals(request.payload, {
    image_uri: 'https://example.com/frame.png',
    prompt: 'Dynamic walk cycle',
    duration: 10,
    resolution: '1920x1080',
    fps: 50,
    generate_audio: true,
    camera_motion: 'dolly_in',
  }, 'The queue payload should use normalized LTX settings');
  assertDeepEquals(request.normalizedSettings, {
    duration: 10,
    resolution: '1920x1080',
    fps: 50,
    generate_audio: true,
    camera_motion: 'dolly_in',
  }, 'The normalized settings should match the submitted payload');
});

Deno.test('Seedance queue requests translate image references into first_frame payloads', () => {
  const request = buildGmiVideoQueueRequest(seedanceImageModel, {
    imageUrl: 'https://example.com/frame.png',
    prompt: 'The portrait gently animates',
    duration: 8,
    resolution: '1080p',
    ratio: '9:16',
    generate_audio: false,
  });

  assertEquals(request.endpointModelId, 'seedance-2-0-260128', 'Seedance should target the canonical endpoint id');
  assertDeepEquals(request.payload, {
    image_url: 'https://example.com/frame.png',
    prompt: 'The portrait gently animates',
    duration: 8,
    resolution: '1080p',
    generate_audio: false,
    ratio: '9:16',
  }, 'The builder should preserve workflow-aware payload inputs before translation');

  const translated = translateGmiQueuePayload(request.endpointModelId, request.payload);
  assertDeepEquals(translated, {
    prompt: 'The portrait gently animates',
    first_frame: 'https://example.com/frame.png',
    duration: 8,
    resolution: '1080p',
    ratio: '9:16',
    watermark: false,
    generate_audio: false,
    web_search: false,
  }, 'Seedance translation should normalize to the documented first_frame payload');
});

Deno.test('Reference-to-video queue requests support a single image or video reference asset', () => {
  const imageReferenceRequest = buildGmiVideoQueueRequest(wanReferenceModel, {
    imageUrl: 'https://example.com/reference.png',
    prompt: 'Animate the reference character entering frame',
    ratio: '3:4',
  });

  const translatedImageReference = translateGmiQueuePayload(
    imageReferenceRequest.endpointModelId,
    imageReferenceRequest.payload,
  );
  assertDeepEquals(translatedImageReference, {
    prompt: 'Animate the reference character entering frame',
    reference_image: ['https://example.com/reference.png'],
    resolution: '1080P',
    ratio: '3:4',
    duration: 5,
    prompt_extend: true,
    watermark: false,
  }, 'Wan R2V should map a single image reference to reference_image[0]');

  const videoReferenceRequest = buildGmiVideoQueueRequest(wanReferenceModel, {
    videoUrl: 'https://example.com/reference.mp4',
    prompt: 'Animate the reference performance',
    resolution: '720p',
  });
  const translatedVideoReference = translateGmiQueuePayload(
    videoReferenceRequest.endpointModelId,
    videoReferenceRequest.payload,
  );
  assertDeepEquals(translatedVideoReference, {
    prompt: 'Animate the reference performance',
    reference_video: ['https://example.com/reference.mp4'],
    resolution: '720P',
    ratio: '16:9',
    duration: 5,
    prompt_extend: true,
    watermark: false,
  }, 'Wan R2V should map a single video reference to reference_video[0]');
});
