## Add GMI Cloud models to the studio catalog

The frontend selectors in **Project Setup** and **Timeline → Settings** read from `src/lib/studio-model-constants.ts`. Add entries for the 9 GMI Cloud models below so users can pick them, with credit costs derived from GMI's per-second / per-image pricing (1 credit ≈ $0.01 to match existing tariffs like `seedance-2.0-i2v` = 30 credits ≈ $0.30 for a 5s clip).

### 1. Image models — append to `gmiImageGenerationModels` (`src/lib/studio-model-constants.ts:487-534`)

| ID | Name | Pricing | Credits |
|---|---|---|---|
| `gmi/gpt-image-2-generate` | GPT Image 2 | $0.06/image (medium) | 6 |
| `gmi/gpt-image-2-edit` | GPT Image 2 Edit | $0.06/image (medium) | 6 |
| `gmi/gemini-3-pro-image-preview` | Gemini 3 Pro Image | $0.134/image | 14 |
| `gmi/luma-uni-1.1` | Luma Uni 1.1 | $0.001/image | 1 |

GPT-Image-2-Edit and Luma Uni 1.1 also expose `image-to-image` (pass `image` URL); I'll create separate edit-mode entries with `workflowType: 'image-to-image'` and `supports: ['prompt','image','size','quality']`.

### 2. Video models — append to the GMI video block (`src/lib/studio-model-constants.ts:1693-1805`)

| ID | Name | Pricing | Credits (5s) | Credits (8s) |
|---|---|---|---|---|
| `gmi/happyhorse-1.0-i2v` | HappyHorse 1.0 I2V | $0.28/s | 140 (5s) | — |
| `gmi/wan-2.7-i2v` | Wan 2.7 I2V | $0.15/s | 75 (5s) | — |
| `gmi/wan-2.7-r2v` | Wan 2.7 R2V | $0.15/s | 75 (5s) | — |
| `gmi/veo-3.1-generate-001` | Veo 3.1 | $0.40/s | — | 320 (8s) |
| `gmi/veo-3.1-lite-generate-001` | Veo 3.1 Lite | $0.05/s (720p+audio) | — | 40 (8s) |

Each entry sets `provider: 'gmi-cloud'`, `category: 'video-generation'`, `mediaType: 'video'`, `workflowType: 'image-to-video'` (or `text-to-video` for Veo 3.1 when no `image`), and `supports`/`defaults` matching the GMI payload schema (`prompt`, `first_frame`/`image`/`reference_image`/`reference_video`, `last_frame`/`lastFrame`, `resolution`, `duration`/`durationSeconds`, `ratio`/`aspectRatio`, `seed`, `watermark`, `generate_audio`, `negative_prompt`, `personGeneration`).

### 3. Backend routing — `supabase/functions/_shared/gmi-types.ts`

The `translateGmiQueuePayload` switch (line 422) needs cases so each model is sent with the correct field naming GMI expects:

- **`gmi/happyhorse-1.0-i2v`**, **`gmi/wan-2.7-i2v`** → reuse `translateWanI2vPayload` (same shape: `prompt`, `first_frame`, `last_frame`, `resolution`, `duration`, `prompt_extend`, `watermark`, `seed`).
- **`gmi/wan-2.7-r2v`** → reuse `translateWanR2vPayload` (`reference_video[]`, `reference_image[]`, `ratio`, `duration`).
- **`gmi/veo-3.1-generate-001`**, **`gmi/veo-3.1-lite-generate-001`** → new `translateVeo31Payload` that maps internal `image_url`→`image`, `last_frame`→`lastFrame`, `duration`→`durationSeconds`, `aspect_ratio`→`aspectRatio`, `generate_audio`→`generateAudio`, `negative_prompt`→`negativePrompt`, plus `personGeneration` and `resolution`.
- **`gmi/gpt-image-2-generate`** → new branch passing `prompt`, `size`, `quality`, `output_format`, `n`.
- **`gmi/gpt-image-2-edit`** → new branch passing `prompt`, `image`, `mask`, `size`, `quality`, `n`.
- **`gmi/gemini-3-pro-image-preview`** → new branch passing `prompt`, `image[]`, `image_size`, `aspect_ratio`, `image_output_format` (and pass-through for `contents` multi-turn).
- **`gmi/luma-uni-1.1`** → new branch passing `prompt`, `aspect_ratio`, optional `image`.

The endpoint slug GMI expects is the part after `gmi/`. Verify `resolveSharedGmiEndpointId` (in `shared/gmi-model-catalog.ts`) covers these — most already exist in `shared/generated/gmi-model-catalog.ts` with matching IDs (`gmi/happyhorse-1.0-i2v`, `gmi/wan-2.7-i2v`, `gmi/wan-2.7-r2v`, `gmi/veo-3-1-lite-generate-001`, `gmi/gemini-3-pro-image-preview`, `gmi/gpt-image-2`). For the IDs I'm adding that don't match the generated file (e.g. `gmi/veo-3.1-generate-001` vs `gmi/veo-3-1-generate-preview`, `gmi/gpt-image-2-generate`/`gmi/gpt-image-2-edit` vs `gmi/gpt-image-2`, `gmi/luma-uni-1.1` not in catalog), add an alias map in `gmi-types.ts` from internal ID → GMI endpoint slug so the queue receives the slug GMI documents:

```
'gmi/veo-3.1-generate-001'      → 'veo-3.1-generate-001'
'gmi/veo-3.1-lite-generate-001' → 'veo-3.1-lite-generate-001'
'gmi/gpt-image-2-generate'      → 'gpt-image-2-generate'
'gmi/gpt-image-2-edit'          → 'gpt-image-2-edit'
'gmi/luma-uni-1.1'              → 'luma-uni-1.1'
'gmi/happyhorse-1.0-i2v'        → 'happyhorse1.0-i2v'
'gmi/wan-2.7-i2v'               → 'wan2.7-i2v'
'gmi/wan-2.7-r2v'               → 'wan2.7-r2v'
'gmi/gemini-3-pro-image-preview'→ 'gemini-3-pro-image-preview'
```

### 4. Server-side credit hold — `supabase/functions/_shared/credits.ts`

Add an entry per new model ID matching the credits values from §1/§2 so `credits_reserve` deducts the correct amount.

### 5. No changes needed to

- `ProjectContext.tsx`, `TabNavigation.tsx`, `SettingsPanel.tsx` (presets stay on Seedream/LTX as previously chosen — the user only asked to *add* options, not switch defaults again).
- DB schema — additions are purely catalog/routing.

### Open question

Several models have variable pricing (Veo 3.1 Lite 720p vs 1080p, GPT Image 2 quality tiers). I'll use the **medium / 720p+audio** tier for the catalog credit cost, since that matches GMI's headline price quoted in your message. If you want the dropdown to expose quality/resolution as user-selectable controls (e.g. `quality: low/medium/high` for GPT Image 2) with credit cost adjusting accordingly, say so and I'll add multi-tier variants instead of one default entry.