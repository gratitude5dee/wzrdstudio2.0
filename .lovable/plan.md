## Director's Cut export — fix FAL compose payload + fallback

### Root cause (confirmed by FAL docs)

Our `buildFalTracks()` in `supabase/functions/_shared/export-helpers.ts:393` emits a non-FAL schema:

```json
{ "tracks": [{ "id": "...", "type": "image", "keyframes": [{ "timestamp", "duration", "url" }] }] }
```

`fal-ai/ffmpeg-api/compose` expects a flat per-track object plus canvas metadata:

```json
{ "width": 1920, "height": 1080, "fps": 30, "duration_seconds": <total>,
  "tracks": [{ "type": "image"|"video"|"audio"|"text",
               "url": "...", "start": <s>, "end": <s>,
               "x": 0, "y": 0, "width": <w>, "height": <h> }],
  "output_format": "mp4" }
```

So every Director's Cut compose call fails with HTTP 400. The Editframe fallback then can't run because `EDITFRAME_API_KEY` is not configured, so the whole job dies.

### Changes

1. **Rewrite `buildFalTracks()` to FAL's compose schema** (`supabase/functions/_shared/export-helpers.ts`)
   - Convert millisecond timestamps/durations to seconds (`start`, `end`).
   - For visual clips, fill `x: 0, y: 0, width, height` from the resolution we already parse in `runWithFal`.
   - For audio, omit geometry; keep `type: "audio"`, `url`, `start`, `end`.
   - Drop the `id` field; FAL ignores it.

2. **Wrap the compose call with the canvas envelope** (`runWithFal`, around `export-helpers.ts:631`)
   ```ts
   await runFalForVideoUrl(COMPOSE_MODEL, {
     width, height, fps,
     duration_seconds: Math.ceil(timelineDurationMs / 1000),
     tracks: buildFalTracks(visuals, audioAssets, { width, height }),
     output_format: 'mp4',
   }, falKey);
   ```
   Compute `timelineDurationMs` from `Math.max(...end timestamps)`.

3. **Surface FAL response bodies in errors** (`falGetResult`, `runFalForVideoUrl`)
   - Include `await res.text()` in the thrown error so the next failure is debuggable instead of a bare "400".
   - Log the submitted payload (truncated) into `provider_payload.lastFalAttempt`.

4. **Editframe fallback secret**
   - The fallback path is wired but inert without `EDITFRAME_API_KEY`. After the FAL fix lands, ask the user whether they want to enable it; if yes, request the secret and the fallback will be live.
   - Until then, keep the current "fallback unavailable" message but add the actionable hint: "Add EDITFRAME_API_KEY to Supabase secrets to enable Editframe fallback."

5. **Skipped-shot UX (frontend)** — Director's Cut page already receives `provider_payload.shotFailures` for `available_content` jobs but does not surface them. Add a banner listing missing scenes/shots so the user knows what to generate before re-exporting.

### Validation

- Re-run the failing export. Expect FAL to accept the compose payload and return a video URL.
- Confirm `provider_payload.lastFalAttempt` and any future 400 carry the actual error body.
- Trigger an artificial FAL failure (e.g., bad URL) and confirm we now receive a clear "Add EDITFRAME_API_KEY…" message in the UI.

### Out of scope
- Generating the 12 missing shot assets — that's a content task, not a renderer bug.
- Migrating to the official `@fal-ai/client` SDK; we keep the existing direct queue HTTP layer to minimize surface area.
