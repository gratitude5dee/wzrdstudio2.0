## Goal

Two changes:

1. Make **GMI GPT Image 2** and **GMI Seedance 2.0 I2V** the actual pre-selected defaults everywhere (settings panel, project setup, store, credit fallbacks).
2. Round out the Director's Cut stitching pipeline to use the full **fal-ai/ffmpeg-api** suite (merge-videos, compose, merge-audio-video, merge-audios, loudnorm, extract-frame, metadata, waveform) instead of only `merge-videos` + `compose`.

---

## Part 1 — Default model presets

Currently five places still hard-code old fallbacks (`gmi/seedream-5.0(-lite)`, `gmi/kling-v3-omni`, `gmi/ltx-fast-i2v`). Replace each with the new defaults:

| File | Lines | Change |
|---|---|---|
| `src/components/project-setup/ProjectContext.tsx` | 84–85, 135–136, 373–374 | `baseImageModel` → `'gmi/gpt-image-2'`, `baseVideoModel` → `'gmi/seedance-2.0-i2v'` (initial state, create payload, hydrate fallback) |
| `src/store/projectSettingsStore.ts` | 102–103, 130–131 | Same two replacements (load + create defaults) |
| `src/components/studio/panels/SettingsPanel.tsx` | 304, 313 | `selectedId` fallback → new defaults |
| `src/components/project-setup/TabNavigation.tsx` | 214, 237 | `value` fallback → new defaults |
| `src/lib/constants/credits.ts` | 94, 103 | `getModelById` fallback ids → new defaults |

No DB migration needed — `base_image_model` / `base_video_model` columns are nullable; existing projects keep their saved values. New projects get the new defaults.

---

## Part 2 — Director's Cut: full fal ffmpeg suite

Current state (`supabase/functions/_shared/export-helpers.ts`):
- Picks `direct_video` for single video, `merge-videos` for all-video sequences, `compose` for mixed/audio cases.
- Submits via raw `queue.fal.run` POST + manual polling.

Add a shared helper module `supabase/functions/_shared/fal-ffmpeg.ts` that wraps all 8 endpoints with one consistent submit+poll signature, then plug it into the Director's Cut renderer:

```
supabase/functions/_shared/fal-ffmpeg.ts
  - mergeVideos({ video_urls, output_format? })
  - compose({ width, height, fps, duration_seconds, tracks, output_format? })
  - mergeAudioVideo({ video_url, audio_url, keep_video_audio?, output_format? })
  - mergeAudios({ audio_urls, output_format? })
  - loudnorm({ audio_url, target_i?, target_tp?, target_lra?, output_format? })
  - extractFrame({ video_url, position?|timestamp_seconds?, output_format? })
  - metadata({ file_url })
  - waveform({ audio_url, sample_rate?, channels?, points? })
```

All wrappers reuse the existing `falQueueSubmit` + `falPollUntilDone` + `extractVideoUrl` helpers (move them into `fal-ffmpeg.ts` and re-export from `export-helpers.ts` to avoid duplication).

Pipeline upgrades inside `processAssetsRemote` / `renderWithFal`:

1. **Audio normalization pre-pass** — if any voiceover/music track is present, run each audio URL through `loudnorm` (target_i = -16 LUFS, target_tp = -1.5, target_lra = 11) before composing, and substitute the normalized URL into the compose tracks. Skip on failure (best-effort).
2. **Multi-audio mix** — if multiple `voiceover`/`music` audio tracks need to play simultaneously, pre-mix them with `mergeAudios` so `compose` only has to handle one audio stream.
3. **Renderer selection** stays the same (direct → merge-videos → compose), but now compose receives normalized audio. When the only output needed is "video + single audio" (no overlays), prefer the lighter `mergeAudioVideo` over `compose`.
4. **Thumbnail capture** — after the final video is rendered, call `extractFrame` (`position: "middle"`, `output_format: "png"`) and store the URL on `final_project_assets.metadata.thumbnail_url` so Director's Cut history can show a poster frame.
5. **Metadata stamping** — call `metadata` on the final video and store `{ duration_ms, width, height, fps, codec }` into `final_project_assets.metadata.media_info` for downstream UI (eliminates guesswork from `DEFAULT_VIDEO_DURATION_MS`).
6. **Waveform** — optional, gated behind `settings.includeWaveform === true`; not wired to UI in this pass but exposed via the helper for future use.

Diagnostics (`renderDiagnostics`) gain three new fields: `loudnormApplied`, `audioPreMixed`, `posterFrameUrl`. Surfaced through the existing `provider_payload` so `useDirectorCut` debug summary can show them with no schema change.

No new env vars (uses existing `FAL_KEY`). No DB migration (all new info lives inside existing JSONB `metadata` columns).

---

## Technical notes

- Single point of change for the renderer keeps the Editframe fallback path untouched.
- `loudnorm` step is wrapped in `Promise.allSettled` so a single audio failure doesn't block the cut.
- Polling timeout (`MAX_POLL = 180`, `POLL_MS = 3s` → ~9 min) reused as-is; metadata/extract-frame typically return in <10s so no tuning needed.
- Tests: extend `src/hooks/__tests__/useDirectorCut.test.tsx` only if the debug summary shape changes consumer code; the hook itself stays API-compatible.

---

## Out of scope

- No UI for waveform display, poster frame override, or loudnorm target controls (helpers are ready when you want them).
- No changes to GMI image/video generation pipelines — only the post-production stitching layer.
