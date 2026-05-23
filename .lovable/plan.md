
## Goal

Remove the Editframe dependency entirely. Render videos via two paths:

1. **Server-side**: FAL `fal-ai/ffmpeg-api/*` (compose / merge-videos / merge-audio-video).
2. **Client-side fallback**: ffmpeg.wasm in the browser (qcut pattern), used when FAL fails or the user prefers local render.

This kills the `EDITFRAME_API_KEY` requirement for good and unblocks Director's Cut + Editor exports.

---

## Part A — Strip Editframe from server

**Files to gut / simplify**

- `supabase/functions/_shared/export-helpers.ts` — remove `getEditframeSetupStatus`, `createEditframeRender`, `createEditframeAsyncRender`, `finalizeEditframeRender`, `loadEditframeApi`, `exportAssetToEditframeAsset`, all `describeEditframeFallbackFailure` paths. Keep only the FAL render path; on FAL failure, return a structured error telling the client to retry locally with WASM.
- `supabase/functions/create-final-asset/index.ts` — remove the `provider === 'editframe'` branches, `getEditframeSetupStatus()` preflight, and the async finalize-by-renderId branch. Only `fal_remote` provider remains.
- `supabase/functions/editframe-webhook/` — delete (no longer needed). Drop its config entry from `supabase/config.toml`.
- `shared/editframeComposition.ts`, `shared/editframeWebhookSignature.ts`, `supabase/functions/_shared/editframeComposition.ts`, `supabase/functions/_shared/editframeWebhookSignature.ts` — delete.
- Tests: `src/lib/editor/__tests__/editframeComposition.test.ts`, `editframeWebhookSignature.test.ts` — delete. Update `exportFixtures.ts` and `exportHelpers.test.ts` to drop editframe assertions.
- `shared/mediaActionRegistry.ts` and `_shared/mediaActionRegistry.ts` — strip editframe entries.
- `safe-logger.ts` — remove editframe redaction keys (purely cosmetic).

**FAL pipeline fixes (the real bug)**

The "Multiple video tracks are not supported" error is from `compose` rejecting >1 video track. Replace the current branched logic with this rule:

- If timeline is **video-only or images-only** → keep `compose` with single combined visual track + audio tracks.
- If timeline is **mixed video + image clips** → pre-flatten by routing each segment through `merge-videos` (images converted to short looped video segments via a tiny `compose` of one image keyframe), then attach audio with `merge-audio-video`.
- Strip stale `start/end` field shape; only emit `id` + `keyframes[]` per FAL's actual schema (we already partially did this).

Helper: add `renderTimelineWithFal()` that picks the right endpoint sequence and returns a single `final_video_url`. Move the existing FAL call wrappers into `_shared/fal-ffmpeg.ts` (already exists) and have `export-helpers.ts` just orchestrate.

---

## Part B — Add client-side WASM ffmpeg fallback (qcut-style)

**New module**: `src/lib/render/wasmRenderer.ts`

- Lazy-load `@ffmpeg/ffmpeg` + `@ffmpeg/util` (multi-thread core when `crossOriginIsolated`, single-thread otherwise).
- API: `renderTimelineWasm({ assets, audioTracks, composition, onProgress }) → Promise<Blob>`.
- Internally:
  1. Fetch each asset URL into ffmpeg FS via `fetchFile`.
  2. Build an ffmpeg filter_complex graph mirroring the timeline (concat demuxer for video segments, image2 + `-loop 1 -t <dur>` for stills, `amix` for audio tracks, `-map` for final).
  3. Run `ffmpeg.exec([...])`, read output `out.mp4`, return Blob.
- Upload Blob to Supabase Storage (`final-exports` bucket) and call `create-final-asset` with `provider: 'wasm_local'` + the storage URL so the job row is finalized consistently.

**Vite config**: add COOP/COEP headers in `vite.config.ts` dev `server.headers` so `SharedArrayBuffer` is available for the multi-thread core. In production, set the same headers via the hosting layer (note for the user; we'll add a comment).

**Dependencies**: `bun add @ffmpeg/ffmpeg @ffmpeg/util` and host the core wasm under `public/ffmpeg/` (copied at build time from the package — small script in `scripts/copy-ffmpeg-core.mjs`, wired to `predev`/`prebuild`).

**UI surfaces**

- `src/hooks/useDirectorCut.ts` — when the FAL render returns `{ status: 'failed', falError }`, automatically call `renderTimelineWasm` and surface progress via the existing diagnostics panel. Replace the "Editframe fallback unavailable" banner with "Rendering locally with WASM ffmpeg…".
- `src/pages/DirectorCutPage.tsx` — add a "Render mode" toggle: **Cloud (FAL)** / **Local (WASM)**. Default Cloud, fall back automatically.
- `src/components/editor/VideoEditorMain.tsx` (and `EditframeWorkbenchCanvas.tsx` → rename to `WasmWorkbenchCanvas.tsx`) — same toggle, same fallback, plus a "Download" button that just saves the WASM Blob locally without touching Supabase when the user picks Local.
- `src/hooks/useExport.ts` — branch on render mode; for WASM, skip the edge function and call `renderTimelineWasm` directly.

---

## Part C — Cleanup & validation

- Drop `EDITFRAME_API_KEY` / `EDITFRAME_WEBHOOK_SECRET` references from docs and any UI hint strings.
- Update `src/lib/editor/__tests__/exportHelpers.test.ts` to cover the three FAL routing branches (video-only, images-only, mixed).
- Add `src/lib/render/__tests__/wasmRenderer.test.ts` smoke test (mock `@ffmpeg/ffmpeg`, assert correct command construction for a 2-clip + 1-audio timeline).
- Manual QA on `/projects/.../directors-cut`:
  - Run cloud render — should produce a final URL when FAL succeeds.
  - Force a FAL failure (toggle to a deliberately bad asset) — should auto-fall-back to WASM and still produce a downloadable mp4.

---

## Technical notes

- ffmpeg.wasm core sizes: ~31 MB (mt) / ~26 MB (st). Lazy-load only when the user clicks Render.
- Cross-origin headers required for mt:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- All asset URLs must be CORS-enabled (Supabase storage already is); for FAL-hosted intermediates we'll proxy via `fal-proxy` if needed.
- Storage bucket `final-exports` already exists per `export-helpers.ts`; reuse it for WASM uploads.

---

## Files touched (summary)

- **Delete**: `supabase/functions/editframe-webhook/`, `shared/editframe*.ts`, `_shared/editframe*.ts`, two editframe test files.
- **Edit**: `_shared/export-helpers.ts`, `_shared/fal-ffmpeg.ts`, `_shared/mediaActionRegistry.ts`, `_shared/safe-logger.ts`, `create-final-asset/index.ts`, `supabase/config.toml`, `useDirectorCut.ts`, `useExport.ts`, `DirectorCutPage.tsx`, `VideoEditorMain.tsx`, `vite.config.ts`, plus tests.
- **Add**: `src/lib/render/wasmRenderer.ts`, `scripts/copy-ffmpeg-core.mjs`, `public/ffmpeg/*` (build artifact), `WasmWorkbenchCanvas.tsx` (rename of Editframe one).
