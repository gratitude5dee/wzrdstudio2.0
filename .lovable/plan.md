## Plan

Fix the Kanvas Lyrics audio pipeline so starting a fresh template no longer clears newly selected audio, and so playback/waveform stay available through the wizard.

### What I’ll change

1. **Prevent the “new template” reset from wiping a file immediately after upload**
   - The current reset effect runs any time `/kanvas/lyrics?mode=new` is active.
   - After selecting an audio file, the page is still on that route, so the reset can re-run and clear `audioPlaybackUrl`, `sourceFileRef`, waveform peaks, and engine source.
   - I’ll gate the reset so it only runs when entering a new-template session, not after local audio has already been selected.

2. **Load audio into the engine immediately when a file is selected**
   - After creating the `blob:` URL, explicitly load it into the audio engine in the upload handler instead of relying only on the later effect.
   - This makes playback readiness deterministic and avoids timing issues with state/effect ordering.

3. **Re-point playback to the uploaded trimmed clip after confirm**
   - `uploadTemplateAudio()` returns the hosted clip URL, but the page currently stores the asset id without updating `audioPlaybackUrl`.
   - I’ll set `audioPlaybackUrl` to the uploaded URL after confirm so Lyrics, Cut Markers, and Preview steps play the trimmed hosted clip.
   - I’ll only revoke the previous local object URL after the hosted URL is active, so playback doesn’t lose its source mid-flow.

4. **Make waveform display robust**
   - Ensure waveform peaks are retained when confirmation resets the clip to a trimmed duration.
   - If decode fails or returns empty peaks, continue showing generated fallback bars rather than an empty-looking waveform.

5. **Improve visible failure feedback**
   - If the audio engine rejects play or fails to load, surface a concise toast and keep state consistent so the play button doesn’t appear silently broken.

### Files in scope

- `src/pages/KanvasLyrics.tsx`
- `src/features/kanvas-lyrics/useAudioEngine.ts`
- Possibly `src/features/kanvas-lyrics/decodeWaveform.ts` if decode fallback needs a guard

### Expected result

- Starting “New Template” opens a clean wizard.
- Selecting audio shows the waveform reliably.
- Pressing play in the Audio panel works for the selected local file.
- Confirming the selection uploads the trimmed clip and subsequent Lyrics / Cut Markers / Preview playback continues to work using the hosted clip.