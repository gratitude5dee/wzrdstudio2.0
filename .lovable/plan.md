# Fix: Image generation stuck on "Generating image..."

## Root cause

The new default image model `gmi/gpt-image-2` is being submitted to the GMI **queue** endpoint (`console.gmicloud.ai/.../requestqueue/apikey/requests`). That endpoint never responds for `gpt-image-2`, so:

- The fetch hangs until the edge function hits its 2-minute wall (confirmed in `generate-shot-image` logs: `Submitting queue request` → 2 min of silence → `shutdown`).
- The shot row stays at `image_status='generating'` forever, so the UI shows the spinner indefinitely (Shot 1 in the screenshot).

`gpt-image-2` (and `gpt-image-2-edit`) on GMI Cloud is an **OpenAI-compatible synchronous image API** at `https://api.gmi-serving.com/v1/images/generations`, not a queue model.

## Changes

### 1. Route `gpt-image-2` / `gpt-image-2-edit` to the sync image endpoint
`supabase/functions/_shared/gmi-client.ts`

- Add `executeGmiImageGeneration(model, payload)` that POSTs to `${GMI_LLM_BASE}/images/generations` with `{ model, prompt, size, quality, n, response_format: 'b64_json' }` (or `url` if returned).
- Add `executeGmiImageEdit(model, payload)` that POSTs to `${GMI_LLM_BASE}/images/edits` (multipart) with `image`, `mask`, `prompt`, `size`, `n`.
- Both return `{ success, data: { url?: string, b64_json?: string } }` shaped like the queue extractors expect, so callers can reuse `extractGmiMedia`-style logic with a tiny shim returning `{ primaryUrl }`.

### 2. Dispatcher: pick sync vs queue based on model
`supabase/functions/_shared/gmi-client.ts` + every caller of `executeGmiQueueModel` (`generate-shot-image`, `generate-shot-video`, `kanvas-generate`, etc.)

- Add `isSyncImageGmiModel(model)` returning true for `gpt-image-2`, `gpt-image-2-edit`, `gmi/gpt-image-2`, `gmi/gpt-image-2-edit`.
- New unified `executeGmiModel(model, payload, payloadKeys)` that routes:
  - sync image models → `executeGmiImageGeneration` / `executeGmiImageEdit`
  - everything else → existing `executeGmiQueueModel` + poll loop
- Returns a normalized `{ success, primaryUrl, requestId? }` so `generate-shot-image`'s download/upload step is unchanged.

### 3. Hard timeout on every GMI fetch
`supabase/functions/_shared/gmi-client.ts`

- Add `fetchWithTimeout(url, init, ms)` using `AbortController`.
- Apply 60s timeout to `submitGmiQueueRequest`, `pollGmiQueueStatus`, `fetchGmiQueueModelDetails`, and the new sync image calls. Treat aborts as a normal failure so the caller fails the shot fast instead of hanging until the function dies.

### 4. Recovery for already-stuck shots
`supabase/functions/generate-shot-image/index.ts`

- Wrap the main work in `try/catch/finally`. On any thrown error (including timeout/abort), update the shot row with `image_status='failed'`, `failure_reason=<message>`, `image_progress=0` so the UI can recover instead of spinning forever.
- One-time SQL migration to reset existing stuck rows:
  ```sql
  update public.shots
     set image_status='failed', failure_reason='timeout (recovered)', image_progress=0
   where image_status='generating'
     and updated_at < now() - interval '5 minutes';
  ```

### 5. Pre-selected default models (the user's main ask)
Confirm and harden the new defaults across all surfaces so freshly created projects + the dropdowns in the screenshot land on the right models:

- `src/components/project-setup/ProjectContext.tsx` → `baseImageModel: 'gmi/gpt-image-2'`, `baseVideoModel: 'gmi/seedance-2.0-i2v'` (already done last turn — verify all 3 fallback sites).
- `src/store/projectSettingsStore.ts` → same two defaults (verify).
- `src/components/studio/panels/SettingsPanel.tsx` and `src/components/project-setup/TabNavigation.tsx` → ensure the `Select`'s controlled value uses the new default ids when the project hasn't picked one yet, so the dropdowns visibly show the new defaults pre-selected (not blank).
- Add a one-time DB migration that updates existing projects whose `image_model`/`video_model` are still the old fallbacks (`gmi/seedream-5.0`, `gmi/seedream-5.0-lite`, `gmi/kling-v3-omni`, `gmi/ltx-fast-i2v`) to the new defaults — otherwise existing projects (like the one in the screenshot) keep using the old IDs even after we change the constants.

## Out of scope

- Director's Cut / FFmpeg pipeline (already shipped last turn — leave alone).
- Adding new models to the catalog.

## Validation

1. Open the project in the screenshot, click `Generate Image` on Shot 1 — image returns within ~15s instead of hanging.
2. Edge function logs show `[GMI] Image generation OK` instead of silence + shutdown.
3. Force a failure (revoke key) → shot flips to `failed` with a visible reason in the UI within 60s.
4. New project → image dropdown shows `GPT Image 2`, video dropdown shows `Seedance 2.0 I2V` pre-selected.
