Root cause found: the deployed function is still reading `endpoint_id = gpt-image-2` from the live `ai_model_catalog` table, so it submits the undocumented model ID to GMI. The logs confirm `model: gpt-image-2` and the DB query confirms the live row has not been updated to `gpt-image-2-generate`. The function also waits/polls for the whole image generation inside one Edge Function invocation, which is causing aborts/timeouts.

Plan:

1. Update the live model catalog
   - Add a database migration that updates `public.ai_model_catalog` for `gmi/gpt-image-2`:
     - `endpoint_id` → `gpt-image-2-generate`
     - defaults/control sizes → documented sizes such as `1920x1080`
     - raw API example → documented `gpt-image-2-generate` request
   - Run `NOTIFY pgrst, 'reload schema';` after the migration.

2. Fix edge-function fallback behavior
   - In `generate-shot-image`, keep the alias protection so older settings resolving to `gpt-image-2` submit `gpt-image-2-generate`.
   - Adjust the GMI fallback list so GPT Image 2 failures do not immediately fall into unrelated GMI models with incompatible payload assumptions.
   - Ensure the request payload for GPT Image 2 only includes documented fields: `prompt`, `size`, `quality`, `output_format`, `n`.

3. Stop returning 500 after a generation is successfully queued
   - Refactor the GMI path so `generate-shot-image` submits the GMI queue request, updates the shot to `generating` with the provider `request_id`, and returns `success: true` immediately.
   - This avoids the Supabase Edge Function long-running timeout/abort while the image model generates.

4. Add a small poller endpoint for completion
   - Add or reuse an Edge Function path to poll GMI request status by stored request id.
   - On success, download/upload the image to `workflow-media`, create the existing project asset/lineage/job records, commit credits, update the shot to `completed`, and enqueue storyboard evaluation.
   - On failure/timeout, release credits and mark the shot failed with the real provider error.

5. Wire frontend retry/status handling minimally
   - Keep the current realtime subscriptions as the source of UI updates.
   - If needed, trigger the poller from the page while shots are in `generating`, so the UI completes without the original function staying open.

6. Validate
   - Deploy the touched Edge Function(s).
   - Query the catalog row to confirm `endpoint_id = gpt-image-2-generate`.
   - Check fresh Edge Function logs to confirm requests now submit `model=gpt-image-2-generate` and no longer abort while waiting for full generation.