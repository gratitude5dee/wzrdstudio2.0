import { describe, expect, it } from 'vitest';

import {
  extractGmiElementId,
  extractGmiMedia,
  translateGmiQueuePayload,
} from '@/lib/gmiCloud';

describe('gmiCloud helpers', () => {
  it('translates Seedream payloads to the documented image format', () => {
    const payload = translateGmiQueuePayload('seedream-5.0-lite', {
      prompt: 'A cinematic neon city',
      image_url: 'https://example.com/ref.png',
      aspect_ratio: '16:9',
      resolution: '4K',
      output_format: 'png',
      max_images: 2,
    });

    expect(payload).toEqual({
      prompt: 'A cinematic neon city',
      image: ['https://example.com/ref.png'],
      size: '3840x2160',
      output_format: 'png',
      max_images: 2,
      watermark: false,
    });
  });

  it('translates LTX Fast I2V payloads with documented field names and defaults', () => {
    const payload = translateGmiQueuePayload('ltx-2-fast-image-to-video', {
      image_url: 'https://example.com/frame.png',
      prompt: 'The scene gently comes to life',
      duration: 7,
      fps: 42,
      resolution: '1080p',
    });

    // Invalid duration/fps/resolution are normalized; fps and generate_audio always present
    expect(payload).toEqual({
      image_uri: 'https://example.com/frame.png',
      prompt: 'The scene gently comes to life',
      duration: 6,
      resolution: '1920x1080',
      fps: 25,
      generate_audio: true,
    });
  });

  it('normalizes LTX durations against the resolution and fps support matrix', () => {
    expect(
      translateGmiQueuePayload('ltx-2-fast-image-to-video', {
        image_url: 'https://example.com/frame.png',
        prompt: 'Large format motion',
        duration: 12,
        resolution: '4K',
        fps: 25,
      })
    ).toMatchObject({
      duration: 10,
      resolution: '3840x2160',
      fps: 25,
    });

    expect(
      translateGmiQueuePayload('gmi/ltx-fast-i2v', {
        image_url: 'https://example.com/frame.png',
        prompt: 'Fast action scene',
        duration: 20,
        resolution: '1920x1080',
        fps: 50,
      })
    ).toMatchObject({
      duration: 10,
      resolution: '1920x1080',
      fps: 50,
    });

    expect(
      translateGmiQueuePayload('ltx-2-fast-image-to-video', {
        image_url: 'https://example.com/frame.png',
        prompt: 'Steady cinematic move',
        duration: 14,
        resolution: '1080p',
        fps: 25,
      })
    ).toMatchObject({
      duration: 14,
      resolution: '1920x1080',
      fps: 25,
    });
  });

  it('parses numeric strings and drops invalid LTX camera motion values', () => {
    const payload = translateGmiQueuePayload('ltx-2-fast-image-to-video', {
      image_url: 'https://example.com/frame.png',
      prompt: 'A calm portrait shot',
      duration: '10',
      fps: '25',
      resolution: '1440p',
      camera_motion: 'orbit',
      generate_audio: 'false',
    });

    expect(payload).toEqual({
      image_uri: 'https://example.com/frame.png',
      prompt: 'A calm portrait shot',
      duration: 10,
      resolution: '2560x1440',
      fps: 25,
      generate_audio: false,
    });
  });

  it('translates LTX Pro A2V payloads to audio_uri/image_uri with 1080p output', () => {
    const payload = translateGmiQueuePayload('ltx-2-pro-audio-to-video', {
      audio_url: 'https://example.com/voice.wav',
      image_url: 'https://example.com/portrait.png',
      prompt: 'Warm lighting and subtle motion',
      resolution: '3840x2160',
    });

    expect(payload).toEqual({
      audio_uri: 'https://example.com/voice.wav',
      prompt: 'Warm lighting and subtle motion',
      image_uri: 'https://example.com/portrait.png',
      resolution: '1920x1080',
    });
  });

  it('translates Seedance 2.0 payloads with normalized duration, resolution, ratio, and audio flags', () => {
    const payload = translateGmiQueuePayload('seedance-2-0-260128', {
      prompt: 'A thunderstorm rolls over a futuristic city skyline',
      duration: 20,
      resolution: '1080p',
      ratio: '21:9',
      generate_audio: false,
      watermark: true,
    });

    expect(payload).toEqual({
      prompt: 'A thunderstorm rolls over a futuristic city skyline',
      duration: 15,
      resolution: '1080p',
      ratio: '21:9',
      watermark: true,
      generate_audio: false,
      web_search: false,
    });
  });

  it('translates Seedance 2.0 image-to-video payloads to first_frame', () => {
    const payload = translateGmiQueuePayload('seedance-2-0-fast-260128', {
      prompt: 'The portrait slowly comes to life',
      image_url: 'https://example.com/frame.png',
    });

    expect(payload).toMatchObject({
      prompt: 'The portrait slowly comes to life',
      first_frame: 'https://example.com/frame.png',
      resolution: '720p',
      ratio: '16:9',
      generate_audio: true,
    });
  });

  it('translates Wan 2.7 I2V payloads to first_frame with prompt extension defaults', () => {
    const payload = translateGmiQueuePayload('wan2.7-i2v', {
      prompt: 'Slow cinematic push in',
      image_url: 'https://example.com/start.png',
      resolution: '720p',
      duration: 1,
    });

    expect(payload).toEqual({
      prompt: 'Slow cinematic push in',
      first_frame: 'https://example.com/start.png',
      resolution: '720P',
      duration: 2,
      prompt_extend: true,
      watermark: false,
    });
  });

  it('translates Wan 2.7 R2V payloads for a single image or video reference', () => {
    expect(
      translateGmiQueuePayload('wan2.7-r2v', {
        prompt: 'Animate the reference character walking through a cafe',
        image_url: 'https://example.com/character.png',
        ratio: '3:4',
      })
    ).toEqual({
      prompt: 'Animate the reference character walking through a cafe',
      reference_image: ['https://example.com/character.png'],
      resolution: '1080P',
      ratio: '3:4',
      duration: 5,
      prompt_extend: true,
      watermark: false,
    });

    expect(
      translateGmiQueuePayload('gmi/wan2.7-r2v', {
        prompt: 'Animate the source performance',
        video_url: 'https://example.com/source.mp4',
        resolution: '720p',
      })
    ).toEqual({
      prompt: 'Animate the source performance',
      reference_video: ['https://example.com/source.mp4'],
      resolution: '720P',
      ratio: '16:9',
      duration: 5,
      prompt_extend: true,
      watermark: false,
    });
  });

  it('translates Kling V3 Omni payloads with image and persistent element references', () => {
    const payload = translateGmiQueuePayload('kling-v3-omni', {
      prompt: '<<<element_1>>> walks into the cafe',
      image_url: 'https://example.com/first-frame.png',
      element_ids: ['el-123'],
      generate_audio: true,
      duration: '8',
      aspect_ratio: '16:9',
    });

    expect(payload).toEqual({
      prompt: '<<<element_1>>> walks into the cafe',
      mode: 'std',
      duration: '8',
      aspect_ratio: '16:9',
      sound: 'on',
      image_list: [{ image_url: 'https://example.com/first-frame.png', type: 'first_frame' }],
      element_list: [{ element_id: 'el-123' }],
    });
  });

  it('extracts GMI queue media URLs, thumbnail URLs, and element IDs', () => {
    const result = {
      outcome: {
        media_urls: [{ id: '0', url: 'https://example.com/video.mp4' }],
        thumbnail_image_url: 'https://example.com/thumb.png',
        element_id: 'element-789',
      },
    };

    const media = extractGmiMedia(result, 'video');

    expect(media.primaryUrl).toBe('https://example.com/video.mp4');
    expect(media.previewUrl).toBe('https://example.com/thumb.png');
    expect(media.outputs).toEqual([{ id: '0', url: 'https://example.com/video.mp4' }]);
    expect(extractGmiElementId(result)).toBe('element-789');
  });
});
