## Problem

When the user starts a "new template" (`/kanvas/lyrics?mode=new`) after working on another template, the wizard still shows the previous audio file, waveform, selection, transcribed lyrics, and cut markers. The page component never resets its in-memory state when the URL transitions from `?templateId=...` to `?mode=new`. (No localStorage is involved — state lives only in React refs/state.)

## Fix

Add a reset effect in `src/pages/KanvasLyrics.tsx` that fires when `mode === 'new'` and `templateIdParam` is null:

1. Revoke the previous blob URL (`lastUrlRef.current`) and clear it.
2. Clear `sourceFileRef.current`.
3. Pause the audio engine and call `engine.load(null)` to detach the previous source.
4. Reset all wizard state:
   - `setTemplateId(null)`
   - `setAudioAssetId(null)`
   - `setAudioPlaybackUrl(null)`
   - `setAudio(INITIAL_AUDIO)`
   - `setLyrics([])`
   - `setMarkers([])`
   - `setCurrentStep(1)`
   - `setAppState('upload')`
   - `setTranscribeStatus('idle')`
   - `setHydrating(false)`

The effect depends on `[mode, templateIdParam]` so it re-fires on every fresh "new" entry, including when the user navigates from an existing template to a new one without a full page reload.

## Verification

1. Open existing template → upload audio, trim, transcribe → state populated.
2. Click "New Template" (navigates to `?mode=new`) → wizard resets to step 1, dropzone shown, no leftover audio/lyrics/markers, no audio playing in background.
3. Open another existing template → server hydration still works (the new effect bails out when `templateIdParam` is set).

## Files Touched

- `src/pages/KanvasLyrics.tsx` (single new `useEffect`)
