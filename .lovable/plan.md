## Problem

In step 1 ("Audio"), clicking Play does nothing. The local-first refactor uses `URL.createObjectURL(file)` blob URLs, but the shared `HTMLAudioElement` in `useAudioEngine.ts` is created with `crossOrigin = 'anonymous'`. Setting `crossOrigin` on `blob:` URLs causes silent load failures in Chromium, so `loadedmetadata`/`canplay` never fire, `isReady` stays false, and the Play button stays disabled (or `play()` resolves to a paused state with no audible output). There is also no `error` listener, so failures are invisible in the console.

## Fix

Edit `src/features/kanvas-lyrics/useAudioEngine.ts`:

1. **Stop forcing `crossOrigin` at construction.** Only apply it conditionally inside `load(url)` — set `crossOrigin = 'anonymous'` for remote `http(s)://` URLs (needed for Supabase signed URLs so we can later inspect via WebAudio for waveform), and explicitly clear it for `blob:` URLs.
2. **Add an `error` listener** on the audio element that logs `a.error?.code` and `a.error?.message`, plus toasts a friendly message so future failures aren't silent.
3. **Reset `isReady`/`isPlaying` and stop RAF** inside the error handler so the UI doesn't hang in a half-loaded state.
4. **Guarantee `load()` re-arms `canplay`**: after assigning `a.src`, ensure we treat it as not ready until the events fire (already done — keep behaviour, just cover the new error path).

## Verification

1. Upload an MP3/WAV in step 1 → Play button becomes enabled within ~200 ms, audio plays through speakers, playhead advances smoothly via RAF.
2. Reposition selection by dragging on the waveform → playback restarts at the new `selectionStart`, loops at `selectionStart + selectionDuration`.
3. Confirm Selection → trimmed WAV uploads → step 2 still plays back via the (now signed) Supabase URL with `crossOrigin='anonymous'` correctly applied.
4. Force an error (e.g., load a corrupt file) → red toast appears with the `MediaError` code instead of silent failure.

## Files Touched

- `src/features/kanvas-lyrics/useAudioEngine.ts` (only file changed)

No DB/edge-function changes. No other components affected — `engine.isReady` and `engine.toggle` contract is unchanged.
