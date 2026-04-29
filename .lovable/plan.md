## Goal

Add 9 new GMI Cloud models to the registry and surface them in the frontend selectors.

| # | ID (catalog) | Endpoint (provider sends to GMI) | Media | Surface |
|---|---|---|---|---|
| 1 | `gmi/deepseek-v4-pro` | `deepseek-ai/DeepSeek-V4-Pro` | text/llm | Studio Text |
| 2 | `gmi/openai-gpt-5.5` | `openai/gpt-5.5` | text/llm (vision) | Studio Text |
| 3 | `gmi/glm-5` | `zai-org/GLM-5-FP8` | text/llm | Studio Text |
| 4 | `gmi/glm-5.1` | `zai-org/GLM-5.1-FP8` | text/llm | Studio Text |
| 5 | `gmi/gpt-image-2` | `gpt-image-2` | image t2i + edit | Studio Image, Kanvas Image + Edit |
| 6 | `gmi/happyhorse-1.0-t2v` | `happyhorse1.0-t2v` | video t2v (audio) | Studio Video, Kanvas Video |
| 7 | `gmi/happyhorse-1.0-i2v` | `happyhorse1.0-i2v` | video i2v | Studio Video, Kanvas Video |
| 8 | `gmi/wan-2.7-i2v` | `wan2.7-i2v` | video i2v | Studio Video, Kanvas Video |
| 9 | `gmi/wan-2.7-r2v` | `wan2.7-r2v` | video reference→video | Studio Video, Kanvas Video |
| 10 | `gmi/seedance-2.0-fast` | `seedance-2-0-fast-260128` | video t2v + i2v | Studio Video, Kanvas Video |

(10 models — GLM-5 and GLM-5.1 are both listed in the docs.)

## Architecture context

- Live source of truth = Postgres `ai_model_catalog` table. The `model-catalog` edge function reads it and the Studio + Kanvas pickers consume that response.
- `supabase/seeds/ai-model-catalog.seed.json` is the snapshot used by `scripts/upsert_ai_model_catalog.ts` (re-seed tool).
- `shared/generated/gmi-model-catalog.ts` is the edge-runtime catalog (used by `gmi-client.ts` for endpoint resolution, payload normalization, alias lookup).
- LLMs route through `executeGmiChatCompletion` (chat completions endpoint) and image/video models route through `executeGmiQueueModel` (request queue endpoint). Both handlers are already generic — no client changes needed; we only have to register the new models with correct `endpointId`, `transportType`, `payloadKeys`, and supports/controls.

## Implementation steps

### 1. Database migration (makes models live in the UI)

Create one SQL migration that `INSERT … ON CONFLICT (id) DO UPDATE` into `public.ai_model_catalog` for the 10 new rows, with full column population matching existing patterns:

- LLMs: `transport_type='chat_completion'`, `media_type='text'`, `workflow_type='text-to-text'`, `studio_surfaces=['studio:text']`, `kanvas_modes=[]`, `category='llm'`, `supports=['prompt','messages','max_tokens','temperature']` (+ `tools`, `image_url` for GPT-5.5).
- `gpt-image-2`: `transport_type='request_queue'`, `media_type='image'`, `workflow_type='text-to-image'`, `studio_surfaces=['studio:image','kanvas:image','kanvas:edit']`, `kanvas_modes=['text-to-image','image-to-image']`, controls for `size` (1024x1024/1024x1536/1536x1024), `quality` (low/medium/high/auto), `output_format` (png/jpeg), `n` (1-10).
- Video models: `transport_type='request_queue'`, `media_type='video'`, `studio_surfaces=['studio:video','kanvas:video']`, controls for `resolution` (720P/1080P), `ratio`, `duration` (2-15s), `seed`, `prompt_extend`, `watermark`, plus model-specific (`generate_audio` for seedance/happyhorse t2v, `first_frame`/`last_frame` for i2v variants, `reference_video`/`reference_image` for wan2.7-r2v).
- All rows: `provider='gmi-cloud'`, `enabled=true`, `is_default=false`, `default_rank=1000`, sensible `sort_rank` (LLMs ~85, image ~250, video ~150–170 to interleave with existing ones), credits derived from pricing (round to nearest credit), `time_label` estimates, `pricing` jsonb mirroring `pricingText`.
- Add `aliases` containing the bare endpoint id (e.g. `['deepseek-ai/DeepSeek-V4-Pro']`) so server code that receives the raw GMI id resolves correctly.

Migration also runs `NOTIFY pgrst, 'reload schema';` per project memory rule.

### 2. Seed JSON parity

Append the same 10 entries to `supabase/seeds/ai-model-catalog.seed.json` so future reseeds (`scripts/upsert_ai_model_catalog.ts`) preserve them. Same shape as existing entries (camelCase keys per the seed file convention).

### 3. Edge-runtime generated catalog

Append matching entries to `shared/generated/gmi-model-catalog.ts` (the `GENERATED_GMI_MODEL_CATALOG` array). This is what `shared/gmi-model-catalog.ts` uses for `resolveSharedGmiEndpointId`, `normalizeSharedGmiModelId`, and Kanvas grouping inside edge functions. Without it, edge functions invoked by id `gmi/gpt-image-2` would fail to map to endpoint `gpt-image-2`.

### 4. Verify routing — no code changes expected

- LLMs: hit `executeGmiChatCompletion(endpointId, messages, …)` — already generic.
- Queue models: hit `executeGmiQueueModel(endpointId, payload, payloadKeys)` which posts `{model: endpointId, payload}` to the request-queue endpoint. `payloadKeys` from the catalog row drives `translateGmiQueuePayload` filtering, so the per-model payload schema must list the exact GMI field names (`first_frame`, `last_frame`, `reference_video`, `reference_image`, `generate_audio`, `prompt_extend`, etc.).
- Polling already works for any `request_id` returned by the queue.

### 5. Defaults / discoverability

- Do not change existing `is_default` rows — new models appear in the regular sorted list.
- For Kanvas Image, `gpt-image-2` will join the existing image grid; the existing default (`gmi/seedream-5.0-lite`) stays.

### 6. QA

- After migration: open Studio Text picker — DeepSeek V4 Pro, GPT-5.5, GLM-5, GLM-5.1 visible. Select GPT-5.5 and confirm a chat round-trip succeeds.
- Open Kanvas Image — `GPT Image 2` appears; submit a small prompt and confirm queue submission + polling returns a media URL.
- Open Kanvas Video — Happyhorse t2v/i2v, Wan 2.7 i2v/r2v, Seedance 2.0 Fast all visible; run one quick text-to-video at 2s/720P to confirm queue + polling.
- Confirm the `model-catalog` edge function response (curl or Network tab) includes the new rows.

## Files touched

- `supabase/migrations/<timestamp>_add_gmi_models_v4_gpt55_glm5_gptimage2_video.sql` (new)
- `supabase/seeds/ai-model-catalog.seed.json` (append 10)
- `shared/generated/gmi-model-catalog.ts` (append 10 to `GENERATED_GMI_MODEL_CATALOG`)

No frontend code changes — pickers/marketplaces read entirely from the `ai_model_catalog` table response.

## Risks / notes

- Pricing is a per-model approximation (DeepSeek V4 Pro $1.392/$2.784 per 1M, GPT-5.5 unspecified — store raw text only, set credits=0 for LLMs to match existing pattern). Image/video credits computed off published per-image / per-second pricing.
- GPT-5.5 reasoning + `responses` endpoint variant is out of scope; the chat-completions path covers the picker selection. Adding a separate "responses" entry can be a follow-up.
- The `wan2.7-r2v` reference-asset payload is more complex (arrays for `reference_video`/`reference_image`); we expose them as supports/payloadKeys but no UI control widget — frontend just allows prompt + asset URLs through the existing reference uploader (already used by Kling/Wan models).
- Edge function deploys are automatic on save; no extra deploy step.
