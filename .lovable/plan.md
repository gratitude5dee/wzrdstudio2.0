## Goal

Make audio trim + waveform + playback feel instant by keeping the full song **client-side only** during the wizard, then upload **just the trimmed clip** when the user confirms their selection.

## Architecture change

```
BEFORE: pick file → upload full song → wait → playback from remote URL
AFTER:  pick file → instant local Blob URL → trim & scrub locally
                                          ↓
                              Confirm Selection clicked
                                          ↓
                          slice clip with OfflineAudioContext
                                          ↓
                         upload tiny trimmed clip → transcribe
```

## Phase 1 — Local-first wizard

- On file pick: create `URL.createObjectURL(file)`, decode peaks, load engine — no network calls.
- Keep the local Blob URL alive for the entire wizard (Audio → Lyrics → Markers → Visualize).
- Store the raw `File` in a ref so we can slice it on confirm.
- Show a small "Not yet uploaded" pill in the Audio panel until confirmed.

## Phase 2 — Tighter audio engine

- Replace `timeupdate` with `requestAnimationFrame` while playing for smooth playhead and accurate loop boundaries.
- Clamp `selectionStart` whenever duration changes so `start + duration ≤ totalDuration`.
- Clamp `seek()` to the active clip window.
- Stop RAF cleanly on pause/unmount.

## Phase 3 — Clip-and-upload on Confirm Selection

- New `src/features/kanvas-lyrics/clipAudio.ts`:
  - Decode source `File` once with `OfflineAudioContext`
  - Render the `[selectionStart, selectionStart + selectionDuration]` window
  - Encode the result as 16-bit PCM WAV (small, universally supported, no codec libs needed)
  - Return a `Blob` + `durationMs`
- Update `handleAudioConfirm`:
  1. Slice the clip locally
  2. Upload only the clip via the existing `uploadTemplateAudio` path (rename file to `*-clip.wav`)
  3. Create draft template with `selectionStartMs: 0`, `selectionDurationMs` = chosen duration, `totalDurationMs` = clip duration
  4. Mark `audio_ready` and kick off transcription (Gemini 3.1 Flash on GMI Cloud transcribes the clip directly — fast & cheap)
- Show progress on the Confirm button (`Slicing… → Uploading… → Transcribing…`).

## Phase 4 — Hydration of saved templates

- The stored asset IS the trimmed clip, so `selectionStart = 0`, `totalDuration = clipDuration`.
- For private assets, generate a signed URL via `storage_bucket` + `storage_path` from the asset metadata instead of relying on the public URL.
- Use stored peaks if present, otherwise re-decode peaks from the signed URL.

## Phase 5 — Waveform polish

- Apply `zoom` viewport in `WaveformView` (currently displayed but unused).
- Live RAF playhead in Audio / Markers / Visualize panels.

## Files

- `src/features/kanvas-lyrics/useAudioEngine.ts` — RAF loop, clamped seek, accurate loop boundaries
- `src/features/kanvas-lyrics/clipAudio.ts` (**new**) — `OfflineAudioContext` slice + WAV encode
- `src/features/kanvas-lyrics/service.ts` — add `resolveAudioPlaybackUrl(asset)` helper using signed URLs for private assets
- `src/pages/KanvasLyrics.tsx` — defer upload to confirm; keep local Blob URL throughout wizard; new confirm progress states
- `src/components/kanvas-lyrics/AudioPanel.tsx` — confirm button progress states; "not yet uploaded" pill
- `src/components/kanvas-lyrics/WaveformView.tsx` — zoom viewport support

## Trade-off accepted

Backend stores only the trimmed clip — full song is not retained. Re-trimming a saved template into a different window is not supported (user would re-upload). This is the chosen behavior.

## No DB / edge-function schema changes

The existing `kanvas-lyrics-audio-register`, `kanvas-lyrics-template`, and `kanvas-lyrics-transcribe` functions all work with the trimmed clip as-is. Gemini 3.1 Flash on GMI Cloud will transcribe the small clip directly.