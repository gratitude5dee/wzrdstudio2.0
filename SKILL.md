# MogStudio — Unified Generation Interface

This document describes the unified generation service layer used by MogStudio to route AI generation requests across **image**, **video**, **audio**, and **text** models. All generation flows — project-setup, studio node processing, and editor — are wired through this service.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Input Schema](#input-schema)
3. [Output Schema](#output-schema)
4. [Available Models](#available-models)
   - [Image Models](#image-models)
   - [Video Models](#video-models)
   - [Audio Models](#audio-models)
   - [Text Models](#text-models)
5. [Credit Costs](#credit-costs)
6. [Usage Examples](#usage-examples)
7. [Routing & Providers](#routing--providers)
8. [Error Handling](#error-handling)

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                     Client Code                           │
│  (Project Setup · Studio Nodes · Editor · Storyboard)     │
└──────────────────────┬────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │ unifiedGenerationService│   src/services/unifiedGenerationService.ts
         │   .generate(input)      │
         └────────────┬────────────┘
                      │  routes by model ID
        ┌─────────────┼───────────────────┐
        ▼             ▼                   ▼
   fal-stream    gemini-text         elevenlabs-*
  (fal.ai proxy)  (Groq/Gemini)     (TTS/SFX/Music)
        │             │                   │
        ▼             ▼                   ▼
  Supabase Edge Functions (cloud)
```

**Key files:**

| File | Purpose |
|------|---------|
| `src/services/unifiedGenerationService.ts` | Core service — input validation, routing, result normalization |
| `src/lib/studio-model-constants.ts` | Model catalog — IDs, names, credits, defaults, supported params |
| `src/lib/constants/credits.ts` | Credit cost helpers and lookup maps |
| `src/lib/falModelNormalization.ts` | Model alias resolution and canonical input building |
| `src/services/generationService.ts` | Legacy generation wrapper (delegates to unified service) |

---

## Input Schema

Every generation request uses the `GenerationInput` interface:

```typescript
interface GenerationInput {
  /** Model ID from the catalog or a provider-specific ID */
  model: string;
  /** Primary prompt / instruction text */
  prompt: string;
  /** Additional model-specific parameters */
  parameters?: Record<string, unknown>;
  /** Reference assets (input images, videos, audio) */
  referenceAssets?: ReferenceAsset[];
  /** Output configuration */
  outputConfig?: OutputConfig;
  /** Tracking metadata */
  metadata?: GenerationMetadata;
}

interface ReferenceAsset {
  url: string;
  type: 'image' | 'video' | 'audio' | 'text';
  role?: string;  // e.g., 'input_image', 'style_reference'
}

interface OutputConfig {
  format?: string;           // 'png', 'mp4', 'mp3', etc.
  count?: number;            // Number of outputs
  storageBucket?: string;    // Supabase Storage bucket
  storagePathPrefix?: string;
  autoStore?: boolean;       // Auto-upload to Supabase Storage (default: true)
}

interface GenerationMetadata {
  source?: 'project-setup' | 'studio' | 'editor' | 'storyboard' | 'timeline';
  projectId?: string;
  entityId?: string;         // Node/shot/clip ID
  custom?: Record<string, unknown>;
}
```

### Input Schemas by Model Type

#### Image Generation Input

Required fields: `model`, `prompt`

Common parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `image_size` | `string` | e.g. `'landscape_16_9'`, `'square_hd'`, `'portrait_4_3'` |
| `aspect_ratio` | `string` | e.g. `'16:9'`, `'auto'` |
| `num_images` | `number` | Number of images to generate (default: 1) |
| `num_inference_steps` | `number` | Quality steps (model-dependent) |
| `guidance_scale` | `number` | Prompt adherence strength |
| `output_format` | `string` | `'png'`, `'jpg'`, `'webp'` |
| `resolution` | `string` | e.g. `'2K'` (Nano Banana Pro) |
| `safety_tolerance` | `string` | Safety filter level |

#### Image Editing Input

Required fields: `model`, `prompt`, at least one reference image

Additional parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `image_urls` | `string[]` | Input image(s) to edit |
| `image_url` | `string` | Single input image |
| `horizontal_angle` | `number` | Camera angle (multiple-angles models) |
| `vertical_angle` | `number` | Camera angle (multiple-angles models) |
| `zoom` | `number` | Zoom level (multiple-angles models) |

#### Video Generation Input

Required fields: `model`, `prompt`

Common parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `duration` | `string` | Duration e.g. `'5'`, `'8'` |
| `duration_seconds` | `number` | Duration in seconds |
| `aspect_ratio` | `string` | e.g. `'16:9'` |
| `generate_audio` | `boolean` | Include audio track |
| `fps` | `number` | Frames per second (default: 24) |
| `image_url` | `string` | Input image (image-to-video) |
| `start_image_url` | `string` | Start frame (first-last-frame models) |
| `end_image_url` | `string` | End frame (first-last-frame models) |

#### Video Editing / Utility Input

Additional parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `video_url` | `string` | Source video for editing |
| `video_urls` | `string[]` | Multiple videos (merge, interleave) |
| `audio_urls` | `string[]` | Audio tracks (merge audio+video) |
| `start_time` | `number` | Trim start |
| `end_time` | `number` | Trim end |
| `width` | `number` | Scale width |
| `height` | `number` | Scale height |
| `frame_position` | `string` | `'first'`, `'middle'`, `'last'` |
| `nth` | `number` | Extract every Nth frame |
| `elements` | `array` | Element references (Kling reference models) |
| `keep_audio` | `boolean` | Preserve audio track in edit |

#### Audio Input

Required fields: `model`, `prompt` (or `audio_url` for processing)

Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `audio_url` | `string` | Source audio for processing |
| `audio_urls` | `string[]` | Multiple audio tracks (merge) |
| `impulse_url` | `string` | Impulse response file |
| `voiceId` | `string` | ElevenLabs voice ID (TTS) |
| `duration` | `number` | Duration in seconds (SFX/Music) |

#### Text Generation Input

Required fields: `model`, `prompt`

Text models use the prompt directly. No additional parameters required by default.

---

## Output Schema

All generation calls return a `GenerationResult`:

```typescript
interface GenerationResult {
  /** URL of the generated asset (Supabase Storage or temporary provider URL) */
  url: string;
  /** Generation metadata */
  metadata: GenerationResultMetadata;
  /** Status: 'pending' | 'running' | 'completed' | 'failed' */
  status: GenerationStatus;
}

interface GenerationResultMetadata {
  generationId: string;       // Unique generation ID
  resolvedModel: string;      // Actual model used (may differ due to alias/fallback)
  requestedModel: string;     // Originally requested model
  fallbackUsed: boolean;      // Whether a fallback model was substituted
  fallbackReason?: string;    // Reason for fallback
  mediaType: 'image' | 'video' | 'audio' | 'text' | 'unknown';
  credits?: number;           // Credits consumed
  durationSeconds?: number;   // For video/audio
  raw?: unknown;              // Raw provider response
  storageUrl?: string;        // Supabase Storage URL (if auto-stored)
  width?: number;             // For images/video
  height?: number;            // For images/video
}
```

**For text models**, the generated text is in `result.metadata.raw.text` and `result.url` is an empty string.

---

## Available Models

### Image Models

#### Generation Models

| Model ID | Name | Credits | Time | Badge | Workflow | Supported Params |
|----------|------|---------|------|-------|----------|-----------------|
| `fal-ai/flux/schnell` | FLUX Schnell | 3 | ~3s | Fast | text-to-image | prompt, image_size, num_images |
| `fal-ai/flux/dev` | FLUX Dev | 5 | ~8s | Quality | text-to-image | prompt, image_size, num_images, guidance_scale, num_inference_steps |
| `fal-ai/flux-pro/v1.1-ultra` | FLUX Pro Ultra | 8 | ~10s | Premium | text-to-image | prompt, aspect_ratio |
| `fal-ai/nano-banana-pro` | Nano Banana Pro | 7 | ~8s | Quality | text-to-image | prompt, num_images, aspect_ratio, resolution, output_format, safety_tolerance |
| `fal-ai/nano-banana-2` | Nano Banana 2 | 4 | ~4s | Fast | text-to-image | prompt, num_images, aspect_ratio, output_format, safety_tolerance |
| `fal-ai/qwen-image-2/text-to-image` | Qwen Image 2 | 5 | ~7s | — | text-to-image | prompt, num_images, aspect_ratio, output_format |
| `fal-ai/qwen-image-2/pro/text-to-image` | Qwen Image 2 Pro | 7 | ~10s | Premium | text-to-image | prompt, num_images, aspect_ratio, output_format |
| `fal-ai/qwen-image-2512` | Qwen Image 2512 | 6 | ~8s | — | text-to-image | prompt, num_images |
| `fal-ai/seedream/v5/lite/text-to-image` | Seedream 5 Lite | 5 | ~8s | — | text-to-image | prompt, num_images, aspect_ratio |
| `fal-ai/ideogram/v3` | Ideogram V3 | 5 | ~8s | — | text-to-image | prompt, aspect_ratio |

#### Advanced / Editing Models

| Model ID | Name | Credits | Time | Workflow | Supported Params |
|----------|------|---------|------|----------|-----------------|
| `fal-ai/nano-banana-pro/edit` | Nano Banana Pro Edit | 8 | ~10s | image-edit | prompt, image_urls, num_images, aspect_ratio, output_format |
| `fal-ai/nano-banana-2/edit` | Nano Banana 2 Edit | 5 | ~6s | image-edit | prompt, image_urls, num_images, aspect_ratio, output_format |
| `fal-ai/qwen-image-2/edit` | Qwen Image 2 Edit | 6 | ~9s | image-edit | prompt, image_urls, output_format |
| `fal-ai/qwen-image-2/pro/edit` | Qwen Image 2 Pro Edit | 8 | ~12s | image-edit | prompt, image_urls, output_format |
| `fal-ai/qwen-image-edit-2509` | Qwen Image Edit 2509 | 7 | ~10s | image-edit | prompt, image_urls |
| `fal-ai/qwen-image-layered` | Qwen Image Layered | 6 | ~8s | image-analysis | image_url |
| `fal-ai/qwen-image-edit-2511-multiple-angles` | Qwen Multiple Angles 2511 | 7 | ~10s | image-edit | image_urls, horizontal_angle, vertical_angle, zoom |
| `fal-ai/qwen-image-edit-plus-lora-gallery/multiple-angles` | Qwen LoRA Multiple Angles | 7 | ~10s | image-edit | image_urls, horizontal_angle, vertical_angle, zoom |
| `fal-ai/seedream/v5/lite/edit` | Seedream 5 Lite Edit | 6 | ~9s | image-edit | prompt, image_urls |
| `fal-ai/seedream/v4.5/edit` | Seedream 4.5 Edit | 6 | ~9s | image-edit | prompt, image_urls, aspect_ratio |

### Video Models

#### Generation Models

| Model ID | Name | Credits | Time | Badge | Workflow | Supported Params |
|----------|------|---------|------|-------|----------|-----------------|
| `fal-ai/kling-video/o3/standard/text-to-video` | Kling O3 Standard T2V | 20 | ~45s | Fast | text-to-video | prompt, duration, aspect_ratio, generate_audio |
| `fal-ai/kling-video/o3/pro/text-to-video` | Kling O3 Pro T2V | 30 | ~90s | Premium | text-to-video | prompt, duration, aspect_ratio, generate_audio |
| `fal-ai/kling-video/o3/standard/image-to-video` | Kling O3 Standard I2V | 24 | ~60s | — | image-to-video | prompt, image_url, duration, generate_audio |
| `fal-ai/kling-video/o3/pro/image-to-video` | Kling O3 Pro I2V | 32 | ~100s | Quality | image-to-video | prompt, image_url, duration, generate_audio |
| `fal-ai/kling-video/v3/pro/image-to-video` | Kling 3.0 Pro I2V | 30 | ~90s | Quality | image-to-video | prompt, image_url, duration_seconds, fps, generate_audio |
| `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | Kling 2.5 Turbo Pro I2V | 22 | ~55s | Fast | image-to-video | prompt, image_url, duration_seconds, fps |
| `fal-ai/kling-video/o1/image-to-video` | Kling O1 FLFV I2V | 28 | ~75s | — | image-to-video | prompt, start_image_url, end_image_url |
| `fal-ai/sora-2/text-to-video` | Sora 2 | 35 | ~120s | — | text-to-video | prompt, duration_seconds |
| `fal-ai/sora-2/text-to-video/pro` | Sora 2 Pro | 50 | ~150s | Premium | text-to-video | prompt, duration_seconds |
| `fal-ai/bytedance/seedance/v1/lite/text-to-video` | Seedance Lite T2V | 18 | ~45s | Fast | text-to-video | prompt, duration_seconds |
| `fal-ai/bytedance/seedance/v1/lite/image-to-video` | Seedance Lite I2V | 20 | ~50s | — | image-to-video | image_url, duration_seconds |
| `fal-ai/bytedance/seedance/v1/pro/text-to-video` | Seedance Pro T2V | 30 | ~80s | Premium | text-to-video | prompt, duration_seconds |
| `fal-ai/bytedance/seedance/v1/pro/image-to-video` | Seedance Pro I2V | 32 | ~90s | Premium | image-to-video | image_url, duration_seconds |
| `fal-ai/ltx-2-19b/text-to-video` | LTX 2 19B T2V | 24 | ~70s | — | text-to-video | prompt, duration_seconds |
| `fal-ai/ltx-video` | LTX Video | 16 | ~40s | Fast | text-to-video | prompt |
| `fal-ai/magi` | MAGI T2V | 20 | ~50s | — | text-to-video | prompt, aspect_ratio, duration |
| `fal-ai/magi/image-to-video` | MAGI I2V | 22 | ~60s | — | image-to-video | prompt, image_url, aspect_ratio, duration |

#### Advanced / Editing / Utility Models

| Model ID | Name | Credits | Time | Workflow | Supported Params |
|----------|------|---------|------|----------|-----------------|
| `fal-ai/kling-video/o3/standard/reference-to-video` | Kling O3 Standard Reference | 28 | ~80s | reference-to-video | prompt, start_image_url, image_urls, elements |
| `fal-ai/kling-video/o3/pro/reference-to-video` | Kling O3 Pro Reference | 38 | ~120s | reference-to-video | prompt, start_image_url, image_urls, elements, duration, aspect_ratio |
| `fal-ai/kling-video/o3/standard/video-to-video/edit` | Kling O3 Standard V2V Edit | 28 | ~90s | video-edit | prompt, video_url, image_urls, elements |
| `fal-ai/kling-video/o3/pro/video-to-video/edit` | Kling O3 Pro V2V Edit | 40 | ~140s | video-edit | prompt, video_url, image_urls, elements, keep_audio |
| `fal-ai/kling-video/o3/pro/video-to-video/reference` | Kling O3 Pro V2V Reference | 38 | ~130s | video-reference | prompt, video_url, image_urls, elements |
| `fal-ai/kling-video/o1/reference-to-video` | Kling O1 Reference I2V | 32 | ~100s | reference-to-video | prompt, reference_image_url, start_image_url |
| `fal-ai/kling-video/o1/video-to-video/edit` | Kling O1 V2V Edit | 30 | ~100s | video-edit | prompt, video_url |
| `fal-ai/sora-2/video-to-video/remix` | Sora 2 Remix | 36 | ~110s | video-edit | prompt, video_url, image_urls |
| `fal-ai/ltx-2-19b/distilled/extend-video` | LTX Extend Video | 22 | ~70s | video-edit | prompt, video_url |
| `fal-ai/ffmpeg-api/compose` | FFmpeg Compose | 12 | ~20s | video-compose | videos, images, audio, timeline |
| `fal-ai/ffmpeg-api/merge-videos` | FFmpeg Merge Videos | 10 | ~18s | video-to-video | video_urls |
| `fal-ai/ffmpeg-api/merge-audio-video` | FFmpeg Merge Audio+Video | 10 | ~18s | video-to-video | video_urls, audio_urls |
| `fal-ai/ffmpeg-api/extract-frame` | FFmpeg Extract Frame | 6 | ~8s | video-to-image | video_url, frame_position |
| `fal-ai/workflow-utilities/trim-video` | Trim Video | 8 | ~10s | video-to-video | video_url, start_time, end_time |
| `fal-ai/workflow-utilities/scale-video` | Scale Video | 8 | ~10s | video-to-video | video_url, width, height |
| `fal-ai/workflow-utilities/reverse-video` | Reverse Video | 8 | ~10s | video-to-video | video_url |
| `fal-ai/workflow-utilities/extract-nth-frame` | Extract Nth Frame | 7 | ~9s | video-to-image | video_url, nth |
| `fal-ai/workflow-utilities/blend-video` | Blend Video | 10 | ~15s | video-to-video | video_url_a, video_url_b |
| `fal-ai/workflow-utilities/interleave-video` | Interleave Video | 10 | ~15s | video-to-video | video_urls |
| `fal-ai/ffmpeg-api/metadata` | FFmpeg Metadata | 4 | ~4s | analysis | url |

### Audio Models

| Model ID | Name | Credits | Time | Workflow | Supported Params |
|----------|------|---------|------|----------|-----------------|
| `fal-ai/ffmpeg-api/merge-audios` | FFmpeg Merge Audios | 8 | ~12s | audio-to-audio | audio_urls |
| `fal-ai/ffmpeg-api/loudnorm` | FFmpeg Loudnorm | 6 | ~10s | analysis | audio_url |
| `fal-ai/ffmpeg-api/waveform` | FFmpeg Waveform | 4 | ~5s | analysis | audio_url |
| `fal-ai/workflow-utilities/audio-compressor` | Audio Compressor | 6 | ~10s | audio-to-audio | audio_url |
| `fal-ai/workflow-utilities/impulse-response` | Impulse Response | 6 | ~10s | audio-to-audio | audio_url, impulse_url |

> **Note:** ElevenLabs audio models (TTS, SFX, Music) are also available via special model IDs `elevenlabs-tts`, `elevenlabs-sfx`, and `elevenlabs-music`. These route to dedicated Supabase Edge Functions.

### Text Models

| Model ID | Name | Credits | Time | Badge | Provider | Workflow |
|----------|------|---------|------|-------|----------|----------|
| `google/gemini-2.5-flash` | Gemini 2.5 Flash | 1 | ~2s | Fast | lovable-ai | text-to-text |
| `google/gemini-2.5-pro` | Gemini 2.5 Pro | 5 | ~8s | Premium | lovable-ai | text-to-text |
| `openai/gpt-5-mini` | GPT-5 Mini | 3 | ~4s | — | lovable-ai | text-to-text |
| `openai/gpt-5` | GPT-5 | 8 | ~10s | Premium | lovable-ai | text-to-text |

> **Storyline models** (Groq-hosted, used in project-setup storyline generation):
> | Model ID | Name | Credits |
> |----------|------|---------|
> | `llama-3.3-70b-versatile` | Llama 3.3 70B Versatile | 1 |
> | `llama-3.1-8b-instant` | Llama 3.1 8B Instant | 1 |

---

## Credit Costs

Credits are the internal billing unit. Every model has a fixed credit cost defined in `src/lib/studio-model-constants.ts`. The `src/lib/constants/credits.ts` module re-exports helpers and pre-built lookup maps.

### Credit Cost Summary

| Category | Range | Cheapest | Most Expensive |
|----------|-------|----------|----------------|
| **Image Generation** | 3–8 | FLUX Schnell (3) | FLUX Pro Ultra (8) |
| **Image Editing** | 5–8 | Nano Banana 2 Edit (5) | Nano Banana Pro Edit / Qwen Image 2 Pro Edit (8) |
| **Video Generation** | 16–50 | LTX Video (16) | Sora 2 Pro (50) |
| **Video Editing** | 22–40 | LTX Extend Video (22) | Kling O3 Pro V2V Edit (40) |
| **Video Utility** | 4–12 | FFmpeg Metadata (4) | FFmpeg Compose (12) |
| **Audio** | 4–8 | FFmpeg Waveform (4) | FFmpeg Merge Audios (8) |
| **Text** | 1–8 | Gemini 2.5 Flash (1) | GPT-5 (8) |
| **Storyline (Groq)** | 1 | All storyline models (1) | — |

### Credit Helpers

```typescript
import { getModelCredits, formatModelLabel, formatModelLabelById } from '@/lib/constants/credits';

getModelCredits('fal-ai/flux/schnell');         // → 3
formatModelLabelById('fal-ai/flux/schnell');     // → "FLUX Schnell (3 credits)"
```

### Special Credits

| Action | Credits | Source |
|--------|---------|--------|
| Director's Cut (final compose) | 12 | `DIRECTORS_CUT_CREDITS` in credits.ts |

---

## Usage Examples

### Image Generation

```typescript
import { unifiedGenerationService } from '@/services/unifiedGenerationService';

// Generate an image with FLUX Schnell (fast, 3 credits)
const result = await unifiedGenerationService.generateImage(
  'A cinematic wide shot of a futuristic city at sunset',
  {
    model: 'fal-ai/flux/schnell',
    parameters: { image_size: 'landscape_16_9', num_images: 1 },
    projectId: 'my-project-id',
    source: 'studio',
    autoStore: true,
  }
);

console.log(result.url);    // Supabase Storage URL
console.log(result.status); // 'completed'
```

### Video Generation

```typescript
// Generate a text-to-video with Kling O3 Standard (20 credits)
const result = await unifiedGenerationService.generateVideo(
  'A drone flyover of a tropical island, golden hour lighting',
  {
    model: 'fal-ai/kling-video/o3/standard/text-to-video',
    parameters: { duration: '5', aspect_ratio: '16:9', generate_audio: true },
    projectId: 'my-project-id',
    source: 'project-setup',
  }
);

console.log(result.url);                       // Video URL
console.log(result.metadata.credits);          // 20
console.log(result.metadata.durationSeconds);  // Duration if available
```

### Image-to-Video Generation

```typescript
// Convert an image to video with Kling 3.0 Pro I2V (30 credits)
const result = await unifiedGenerationService.generate({
  model: 'fal-ai/kling-video/v3/pro/image-to-video',
  prompt: 'The camera slowly zooms into the scene as leaves blow in the wind',
  referenceAssets: [
    { url: 'https://storage.example.com/scene.png', type: 'image', role: 'input_image' }
  ],
  parameters: { duration_seconds: 5, fps: 24, generate_audio: true },
  metadata: { source: 'editor', projectId: 'my-project-id' },
});
```

### Audio Generation (ElevenLabs)

```typescript
// Generate a sound effect (uses elevenlabs-sfx edge function)
const sfxResult = await unifiedGenerationService.generateAudio(
  'Thunder cracking followed by heavy rain on a tin roof',
  {
    model: 'elevenlabs-sfx',
    parameters: { duration: 10 },
    source: 'editor',
  }
);

// Text-to-speech
const ttsResult = await unifiedGenerationService.generateAudio(
  'Welcome to MogStudio, your AI filmmaking platform.',
  {
    model: 'elevenlabs-tts',
    parameters: { voiceId: 'JBFqnCBsd6RMkjVDRZzb' },
    source: 'project-setup',
  }
);
```

### Text Generation

```typescript
// Generate text with Gemini 2.5 Flash (1 credit)
const result = await unifiedGenerationService.generateText(
  'Write a 3-sentence storyline for a sci-fi short film about time travel.',
  {
    model: 'google/gemini-2.5-flash',
    source: 'project-setup',
  }
);

// Text is in the raw metadata
const generatedText = (result.metadata.raw as { text: string }).text;
```

### Edge Function Invocation

```typescript
// Call a dedicated Supabase Edge Function
const result = await unifiedGenerationService.invokeEdgeFunction(
  'generate-shot-image',
  {
    prompt: 'A close-up of a detective examining evidence',
    shotIndex: 3,
    projectId: 'my-project-id',
  }
);
```

### Progress Tracking

```typescript
const result = await unifiedGenerationService.generate(
  {
    model: 'fal-ai/sora-2/text-to-video',
    prompt: 'An astronaut walking on Mars',
    parameters: { duration_seconds: 5 },
  },
  (progress) => {
    console.log(`${progress.percent}% — ${progress.message}`);
    // 0% — Starting generation...
    // 5% — Queued...
    // 35% — Generating...
    // 100% — Complete
  }
);
```

---

## Routing & Providers

The unified service automatically routes requests based on model ID:

| Route | Trigger | Backend |
|-------|---------|---------|
| `fal-stream` | Default for all `fal-ai/*` models | Supabase Edge Function → fal.ai |
| `gemini-text` | `google/gemini-*` or `openai/gpt-*` text models | `gemini-text-generation` Edge Function |
| `groq-text` | `groq/*` or `llama-*` models | `groq-chat` Edge Function |
| `elevenlabs-tts` | `elevenlabs-tts` | `elevenlabs-tts` Edge Function |
| `elevenlabs-sfx` | `elevenlabs-sfx` | `elevenlabs-sfx` Edge Function |
| `elevenlabs-music` | `elevenlabs-music` | `elevenlabs-music` Edge Function |
| `edge-function` | When `parameters._edgeFunction` is set | Named Edge Function |

### Model Aliases

Legacy and shorthand model IDs are automatically resolved to canonical IDs:

| Alias | Resolves To |
|-------|-------------|
| `flux-schnell` | `fal-ai/flux/schnell` |
| `flux-dev` | `fal-ai/flux/dev` |
| `flux-pro` | `fal-ai/flux-pro/v1.1-ultra` |
| `kling-2-1` | `fal-ai/kling-video/o3/standard/text-to-video` |
| `kling-pro-16` | `fal-ai/kling-video/o3/pro/text-to-video` |
| `veo3-fast` | `fal-ai/kling-video/o3/standard/text-to-video` |
| `luma/dream-machine` | `fal-ai/kling-video/v3/pro/image-to-video` |
| `hailuo` | `fal-ai/kling-video/o3/pro/image-to-video` |

See `src/lib/falModelNormalization.ts` for the full alias map.

---

## Error Handling

The service uses typed errors:

```typescript
import {
  GenerationError,
  InsufficientCreditsError,
} from '@/services/unifiedGenerationService';

try {
  const result = await unifiedGenerationService.generate(input);
  if (result.status === 'failed') {
    console.error('Generation failed:', result.metadata.raw);
  }
} catch (error) {
  if (error instanceof InsufficientCreditsError) {
    // User doesn't have enough credits
    console.log(`Need ${error.required} credits, have ${error.available}`);
    // Automatically routes to billing top-up page
  } else if (error instanceof GenerationError) {
    console.error(`[${error.code}] ${error.message}`);
  }
}
```

**Error codes:**
| Code | Description |
|------|-------------|
| `insufficient_credits` | Not enough credits for the requested model |
| `stream_error` | HTTP error from fal-stream |
| `no_body` | No response body from provider |
| `no_result` | Stream completed without result |
| `provider_error` | Provider returned an error |
| `text_error` | Text generation failed |
| `groq_error` | Groq API error |
| `audio_error` | Audio generation failed |
| `edge_function_error` | Edge function invocation failed |
| `unknown_route` | Unrecognized generation route |
