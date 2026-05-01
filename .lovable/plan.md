I found two likely root causes in the Kanvas Lyrics flow:

1. Existing templates are hydrated into a confirmed/draft state but the Audio panel hides the waveform once `confirmed` is true, so the stored `waveformPeaks` can exist but never render in the Audio section.
2. Playback for saved/uploaded template audio relies on the public asset URL and applies `crossOrigin`, which can fail silently depending on storage/CORS behavior. The backend already stores `metadata.storage_path`, so the client can use a signed storage URL instead.

Plan:

1. Fix template hydration state in `src/pages/KanvasLyrics.tsx`
   - Treat draft/audio-ready templates as editable audio step state, not as a hidden confirmed panel.
   - Keep `waveformPeaks` from the server in `audio.peaks` and keep the waveform visible for loaded templates.
   - Set the correct `currentStep`/`appState` so the Audio section shows the waveform and controls immediately after loading a template.

2. Resolve playback URLs more robustly
   - Add a helper that takes a `project_assets` row and prefers `metadata.storage_bucket` + `metadata.storage_path` to generate a signed URL with Supabase Storage.
   - Fall back to the stored `asset.url` only if signing fails or metadata is unavailable.
   - Use the same resolver after direct upload/register and during template hydration.

3. Harden `useAudioEngine.ts`
   - Make `load(url)` reset the media element deterministically before assigning a new URL.
   - Avoid applying `crossOrigin` for Supabase signed/private URLs to prevent CORS-related media load failures.
   - Surface a clear toast/log when metadata cannot load or `play()` is rejected, instead of leaving the UI disabled or appearing dead.
   - Set readiness from `loadedmetadata/canplaythrough` and duration fallback so controls become available when audio is playable.

4. Preserve waveform during local-to-hosted transition
   - When confirming selection, keep the decoded `audio.peaks` in state after the URL changes from `blob:` to hosted/signed URL.
   - If no peaks are present for any reason, let `WaveformView` show its fallback bars instead of rendering an empty/blank-looking waveform.

5. Add regression coverage
   - Update `KanvasLyrics.test.tsx` mocks to cover template hydration with stored waveform peaks.
   - Add assertions that loading an existing template renders the waveform/trimmer controls and does not clear audio state.

After approval, I’ll implement these changes and keep the scope focused on restoring waveform visibility and playback in the Audio section.