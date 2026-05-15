# Director's Cut Live Validation Runbook

This runbook is the final gate for the `/editor` Director's Cut work. Run it only in an environment with real Supabase and FAL credentials. Do not paste secret values into logs or chat.

## 1. Preflight

Copy `.env.example` to `.env.local` for local browser testing, then fill in the blank values.
Do not commit `.env.local` or any real secret values.

The CLI validation scripts read `.env.example`, `.env`, `.env.local`, and then the current shell. Shell variables win over file values.

```bash
cp -n .env.example .env.local
# Fill in .env.local.
```

```bash
npm run director-cut:check-env
```

Expected result:

- `status=ready`
- `VITE_SUPABASE_URL=set`
- `VITE_SUPABASE_ANON_KEY=set`
- `SUPABASE_URL=set`
- `SUPABASE_SERVICE_ROLE_KEY=set`
- `FAL_KEY=set`
- `SUPABASE_ACCESS_TOKEN=set`

If the preflight reports `status=blocked`, stop and set the missing variables before running exports.

When `SUPABASE_URL` or `VITE_SUPABASE_URL` are missing, the preflight may print a public URL hint derived from `supabase/config.toml`. It does not infer or print secret keys.

For the CLI export runner, provide a project-owner session token through `SUPABASE_ACCESS_TOKEN` or `--access-token`. The browser export dialog does not need this extra shell variable because it uses the signed-in Supabase session.

To preflight only the CLI export runner variables:

```bash
npm run director-cut:check-env -- --mode runner
```

## 2. Local Smoke Baseline

```bash
npm run test -- scripts/director-cut-env-files.test.mjs scripts/check-director-cut-env.test.mjs scripts/seed-director-cut-live-fixture.test.mjs scripts/run-director-cut-live-export.test.mjs scripts/inspect-director-cut-live.test.mjs scripts/director-cut-remotion-worker.test.mjs scripts/render-editor-composition.test.mjs supabase/functions/director-cut/remotion-manifest.test.ts supabase/functions/director-cut/job-payloads.test.ts supabase/functions/director-cut/timeline-assets.test.ts src/services/__tests__/videoEditorService.test.ts src/hooks/__tests__/useExport.test.tsx src/components/editor/toolbar/ExportDialog.test.tsx src/components/editor/VideoEditor.test.tsx src/pages/EditorPage.test.tsx src/lib/editor/remotionRenderManifest.test.ts src/lib/editor/renderCapabilities.test.ts remotion/Root.test.tsx src/components/__tests__/ProtectedRoute.test.tsx
npx tsc --noEmit
npm run build
npm run remotion:render:editor -- --props scripts/fixtures/editor-remotion-smoke-manifest.json --out /private/tmp/wzrd-editor-styled-smoke.mp4 --concurrency 1 --crf 35
```

Expected result:

- Focused tests pass (`19` files, `89` tests in the current audit run).
- Typecheck passes.
- Build passes with only existing Vite/vendor/chunk warnings.
- Remotion produces `/private/tmp/wzrd-editor-styled-smoke.mp4`.

To let a reviewer try the editor locally before commit/push, run the dev server with the dev-only auth bypass and mock assets:

```bash
VITE_BYPASS_AUTH_FOR_TESTS=true VITE_USE_MOCK_ASSETS=true npm run dev -- --host 127.0.0.1 --port 5176
```

Then open:

```text
http://127.0.0.1:5176/projects/local-editor/editor
```

Expected result:

- The editor shell renders without an authentication wall.
- Project setup and billing fetches do not call live Supabase edge functions in this local bypass mode.
- Editor autosave does not attempt live timeline writes.
- This mode is dev-only and should not be used as live export validation evidence.

## 3. Test Project Fixture

Use or create a real project with a saved `/editor/:projectId` timeline containing:

- At least one visual clip.
- One video clip with `trimStart` or `trimEnd`.
- One audio track.
- Cached media metadata with duration.
- At least one styled clip using a transform, transition, effect, or keyframe.

Save the editor timeline before exporting so `timelines.composition_data` is current.

If you already have a real project id, owner user id, and short public media URLs, you can seed the required saved editor timeline shape from the CLI:

```bash
npm run director-cut:seed-live-fixture -- --project-id <project_id> --user-id <user_id> --video-url <public_mp4_url> --audio-url <public_audio_url>
```

Use `--dry-run --json` first to inspect the exact `timelines` payload without writing. The script refuses to write if `<user_id>` does not match `projects.user_id`.
The media URLs must be public `http` or `https` URLs because the FAL render path cannot fetch local, `blob:`, or `file:` URLs. The duration flags fail fast if they are not positive numbers.

## 4. Fast FAL Export

In the editor export dialog:

- Format: `MP4`
- Quality: `High`
- Renderer: `Fast`

Or run the equivalent edge function flow from the CLI with a project-owner session JWT:

```bash
npm run director-cut:run-live-export -- --project-id <project_id> --renderer fast --wait
```

The CLI runner fails before contacting Supabase if renderer, quality, resolution, fps, or polling controls are malformed.

With `--wait`, the CLI exits nonzero if the job fails or does not reach `completed` before the polling limit.

Expected result:

- The export creates an `export_jobs` row with `provider = fal_remote`.
- The job reaches `status = completed`.
- `output_url` is set.
- `provider_payload.renderWarnings` is present when styled clips are in the timeline.
- `provider_payload.audioIncluded` and `provider_payload.audioTrackCount` reflect the audio tracks.
- The output URL downloads or plays an MP4.

Inspect the job row and confirm `timeline_assets` rows were hydrated from the editor timeline, including trim and metadata fields.

## 5. Styled Remotion Worker Export

Start the worker in the same environment:

```bash
npm run director-cut:remotion-worker -- --requeue-stale --stale-timeout-ms 1800000 --max-requeues 2
```

The worker preflights the local render script and executable `node_modules/.bin/remotion` before polling or claiming jobs. If either is missing or not executable, fix the deployment/runtime image before creating the styled export.

In the editor export dialog:

- Format: `MP4`
- Quality: `High`
- Renderer: `Styled`

Or create and poll the styled export from the CLI while the worker runs:

```bash
npm run director-cut:run-live-export -- --project-id <project_id> --renderer styled --wait
```

Keep the Remotion worker running while this command waits. The CLI exits nonzero if the job remains queued/processing past the polling limit.

Expected result:

- The export creates an `export_jobs` row with `provider = remotion_worker`.
- `provider_payload.remotionManifest` exists and contains `inputProps`, `entryPoint`, and `compositionId`.
- The worker claims the job, renders the MP4, uploads to `final-exports`, and sets `status = completed`.
- `output_url` is set.
- `provider_payload.outputPath` is under `<user_id>/<project_id>/<job_id>/`.
- `provider_payload.renderWarnings` is empty for the Remotion path.
- The output URL downloads or plays an MP4 with transforms/effects/keyframes visible.

## 6. Failure And Recovery Check

Stop the worker while a `remotion_worker` job is processing, then restart it with stale recovery after the timeout window in a controlled staging environment.

Expected result:

- The stale job is requeued with `provider_payload.remotionWorkerRequeueCount`.
- After exceeding `--max-requeues`, the job is marked `failed` with a clear `error_message`.
- No stuck `processing` rows remain after recovery.

## 7. Evidence Capture

After the fast and styled exports complete, run the live inspector with the real project id and both completed job ids:

```bash
npm run director-cut:inspect-live -- --project-id <project_id> --job-id <fal_job_id> --job-id <remotion_job_id>
```

Expected result:

- `jobs_match_inspected_project=ok`
- At least one inspected `fal_remote` job and at least one inspected `remotion_worker` job are completed.
- `timeline_assets_hydrated_from_editor=ok`
- `timeline_has_trimmed_video=ok`
- `timeline_has_audio=ok`
- `timeline_has_cached_metadata=ok`
- `timeline_has_styled_clip=ok`
- `fal_export_completed=ok`
- `fal_export_audio_payload=ok`
- `fal_export_styled_warning_payload=ok`
- `remotion_export_completed=ok`
- `remotion_manifest_present=ok`
- `remotion_export_no_render_warnings=ok`
- `storage_outputs_verified=ok`
- `storage_paths_scoped_to_jobs=ok`
- `status=ready`

For audit records, capture JSON without exposing secrets:

```bash
npm run director-cut:inspect-live -- --project-id <project_id> --job-id <fal_job_id> --job-id <remotion_job_id> --json
```

Do not use `--skip-storage-check` for completion signoff. That flag is only for debugging environments where service-role storage downloads are not available.

## 8. Completion Criteria

The active editor/export objective can be marked complete only after all of the following are true:

- Fast FAL export completes from a real saved editor timeline.
- Styled Remotion worker export completes from the same class of timeline.
- Both outputs are playable MP4 files.
- `export_jobs`, `timeline_assets`, and `final-exports` storage paths are inspected.
- `npm run director-cut:inspect-live` returns `status=ready`.
- The results are recorded in `docs/editor-completion-audit.md`.
