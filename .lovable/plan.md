## Problems Observed

From the live network log + code review of the lyrics wizard:

1. **Upload** — A 50MB+ `.wav` returned 413 from Storage with no friendly error; the user only saw a silent failure. Mp3 uploads succeed but there is no visible progress/feedback during the upload + draft-create round-trip.
2. **Playback** — Pressing play in Step 1 (Audio) plays the full song. The engine's "loop guard" calls `pause()` when the playhead crosses `loopEnd`, so the clip does not actually loop — it just stops. `currentTime` resets to 0 but `isPlaying` flips to false, which contradicts the "preview your clip" intent.
3. **Clipping visualization** — The waveform in Step 1 has no playhead; only the orange selection rectangle is visible. The position display shows `audio.selectionStart` (the trim handle), not the live playhead, so the user cannot see playback progress within their selected window. Click-to-seek inside the selection is also not wired.
4. **Visualize step / replay** — Inherits the same non-looping behaviour; replay restarts but stops at clip end.

## Plan

### 1. Client-side upload validation + feedback (`src/features/kanvas-lyrics/service.ts`, `AudioPanel.tsx`, `KanvasLyrics.tsx`)
- Add a 50 MB pre-check in `uploadTemplateAudio` and throw a clear `Audio file is too large (max 50 MB).` error before hitting Storage.
- Validate mime type up-front (mpeg/wav/m4a/flac/aac/ogg) and reject with a friendly toast.
- In `KanvasLyrics.handleAudioSelected`, show a `toast.loading('Uploading audio…')` keyed by id, replaced by `toast.success` on completion or `toast.error` on failure. Reset wizard state on failure so the dropzone reappears.
- Update the dropzone hint text to read `MP3, WAV, M4A, FLAC up to 50 MB`.

### 2. True clip looping in `useAudioEngine` (`src/features/kanvas-lyrics/useAudioEngine.ts`)
- Add a `loop` flag (default `true`) to `setLoop(startSec, endSec, opts?)`.
- In the `timeupdate` handler, when `t >= loop.end`:
  - If looping: set `currentTime = loop.start`, keep `isPlaying = true`, do **not** pause.
  - Otherwise: keep current behaviour (pause + reset).
- Remove the redundant `setIsPlaying(false)` inside the loop branch.
- The `ended` handler stays as a safety net.

### 3. Live playhead + click-to-seek in Step 1 (`AudioPanel.tsx`, `KanvasLyrics.tsx`, `WaveformView.tsx`)
- Pass `playheadTime` (clip-relative seconds) and `selectionDuration` from `KanvasLyrics` into `AudioPanel`.
- In `AudioPanel`, compute absolute playhead seconds = `selectionStart + playheadTime` and convert to percent of `totalDuration` for the waveform.
- Render the playhead in `WaveformView` (existing prop) by passing `showPlayhead` + `playheadPercent`.
- Wire `onSeekPercent` so a click inside the selection window seeks the engine; clicks outside the selection move the selection start to that point (existing behaviour) instead of seeking.
- Update the Position display to show `formatTime(selectionStart + playheadTime)` while playing, and the static `selectionStart` while paused.

### 4. Visualize step parity (`VisualizePanel.tsx`)
- Pass `loop: false` when calling `setLoop` in the Visualize panel so the preview plays once end-to-end (matches the "Replay" intent), then enable a clear "Replay" button (already present). No new logic, just call the new opts.

### 5. Minor cleanup
- Remove the obsolete `100 MB` reference anywhere it still exists in copy.
- Add a one-line comment on `setLoop` documenting the loop semantics.

## Files Touched
- `src/features/kanvas-lyrics/useAudioEngine.ts`
- `src/features/kanvas-lyrics/service.ts`
- `src/components/kanvas-lyrics/AudioPanel.tsx`
- `src/components/kanvas-lyrics/VisualizePanel.tsx`
- `src/pages/KanvasLyrics.tsx`

No DB migration needed — the 50 MB bucket limit was applied in the previous step.

## Acceptance
- Uploading a >50 MB file shows a friendly toast immediately, no 413 in the console.
- Uploading a valid file shows a loading toast, then success.
- Pressing Play on Step 1 loops continuously within the selected window; the white playhead advances across the orange selection bar; the time readout ticks up and resets at the selection end.
- Clicking inside the selection seeks; dragging the orange box still moves the selection.
- Visualize step plays the clip once, stops at end, Replay restarts.
