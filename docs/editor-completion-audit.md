# Editor / Director's Cut Completion Audit

Date: 2026-05-14
Status: not complete

## Objective Restatement

The active objective is to adapt `worldstudio` so `/editor` uses the local QCut/OpenCut references as implementation guidance, becomes a full project editor, and can render Director's Cut output with image/video/FFmpeg-grade architecture. The export path must respect Supabase/Postgres constraints, keep generation systems such as Seedance out of final rendering, preserve cinematic render quality where the renderer supports it, and avoid high-risk schema or workflow breakage.

## Prompt-To-Artifact Checklist

| Requirement | Current artifact / evidence | Status |
| --- | --- | --- |
| Work in `https://github.com/gratitude5dee/worldstudio.git` | Current working repo is `/Users/gratitud3/Downloads/worldstudio/worldstudio-push-main`; `git status --short` shows the active editor/export worktree. | Verified locally |
| Use QCut as the base implementation reference for `/editor` | Local reference anchors are recorded in `docs/editor-qcut-opencut-migration.md`: QCut Remotion timeline rendering and media panel docs informed the normalized timeline document, media panel boundaries, Remotion manifest, and worker export path. `/editor` now persists clips, audio, keyframes, and composition in `src/lib/editor/timelineDocument.ts`; editor services and store consume that document. | Implemented |
| Plan and implement OpenCut-style editor operations | Local reference anchors are recorded in `docs/editor-qcut-opencut-migration.md`: OpenCut actions, keyframes, and effects renderer docs informed the command primitives, persisted keyframes, and effect handoff. `src/lib/editor/timelineCommands.ts` implements split, delete/ripple delete, duplicate, grouped move, nudge, and command-style updates; keyboard/context-menu/timeline integrations call these commands. | Implemented |
| Enable a full editor per project | Project-scoped timeline persistence is wired through `src/services/videoEditorService.ts`, `src/hooks/useRealtimeTimelineSync.ts`, `src/hooks/useFinalProjectAssets.ts`, and `src/store/videoEditorStore.ts`. | Implemented locally |
| Render Director's Cut output from the editor timeline | `src/hooks/useExport.ts` invokes `director-cut`; `supabase/functions/director-cut/index.ts` syncs editor timelines into `timeline_assets`; saved editor timelines remain authoritative even when no visual URL is exportable or the timeline is audio-only, and create fails clearly unless a visual export asset exists. FAL remote compose handles timing, trims, audio, and storage upload. | Implemented, live validation pending |
| Preserve trims, cached metadata, and audio | `supabase/functions/director-cut/timeline-assets.ts` forwards trim, duration, thumbnail, preview, media metadata, and audio role metadata, while skipping `blob:`, `file:`, `data:`, and relative URLs that remote renderers cannot fetch; `supabase/functions/_shared/export-helpers.ts` preprocesses trimmed videos and builds audio-aware compose tracks. | Implemented |
| Support styled editor renders | `remotion/Root.tsx` exposes `VideoEditorComposition`; `src/lib/editor/remotionRenderManifest.ts` builds typed manifests; `scripts/render-editor-composition.mjs` renders them; `remotion.config.ts` fixes the Remotion alias boundary. | Implemented and smoke-rendered |
| Connect styled renders to Director's Cut | `settings.renderBackend = "remotion_worker"` queues a `remotion_worker` export with `provider_payload.remotionManifest`; `src/hooks/useExport.ts` preserves the selected renderer from the export dialog; `scripts/director-cut-remotion-worker.mjs` renders, uploads, and completes `export_jobs`. | Implemented, live validation pending |
| Add operational recovery for worker jobs | `director-cut:remotion-worker` supports `--requeue-stale`, `--stale-timeout-ms`, and `--max-requeues`; stale jobs are requeued with telemetry or failed after the cap. The worker now preflights the local render script and executable Remotion CLI before polling or claiming live jobs. Fake-Supabase and runtime tests cover the update paths and missing-local-runtime failures. | Implemented |
| Make the live-validation blocker repeatable | `scripts/check-director-cut-env.mjs` and `npm run director-cut:check-env` check required client, FAL, Remotion worker, and CLI runner env vars without printing secret values. The checker can derive non-secret Supabase URL hints from `supabase/config.toml`. | Implemented |
| Make live-validation env setup explicit | `.env.example` lists the public Supabase URL, required blank secret variables, and disabled-by-default local smoke flags; `.gitignore` keeps real `.env` and `.env.*` files ignored while allowing the template to be committed. `scripts/director-cut-env-files.mjs` lets the Director's Cut CLIs read `.env.example`, `.env`, `.env.local`, and then shell overrides, so a filled `.env.local` is enough for local validation commands. | Implemented |
| Make the live timeline fixture repeatable | `scripts/seed-director-cut-live-fixture.mjs` and `npm run director-cut:seed-live-fixture` can write a representative saved editor timeline with a trimmed video clip, audio track, cached metadata, effects, transition, and keyframe for an existing project owner. It rejects non-HTTP(S) media URLs and malformed duration controls before writing. | Implemented, live run pending |
| Make live export creation repeatable | `scripts/run-director-cut-live-export.mjs` and `npm run director-cut:run-live-export` can invoke the `director-cut` edge function for fast FAL or styled Remotion-worker exports and optionally poll status using a project-owner session token. The runner validates renderer, quality, `WIDTHxHEIGHT` resolution, positive fps, and positive polling controls before contacting Supabase. Waited runs exit nonzero if they fail or time out before `completed`. | Implemented, live run pending |
| Preserve the final live validation sequence | `docs/director-cut-live-validation.md` documents the preflight, fast FAL export, styled Remotion worker export, recovery check, and completion criteria. | Implemented |
| Capture concrete live export evidence | `scripts/inspect-director-cut-live.mjs` and `npm run director-cut:inspect-live` inspect real `export_jobs`, hydrated `timeline_assets`, scoped output paths, and `final-exports` storage downloads for the FAL and Remotion jobs. The inspector requires at least one completed FAL job and at least one completed Remotion-worker job, and it requires every inspected completed FAL/Remotion job to carry the expected completion telemetry so one good job cannot mask another weak job. | Implemented, live run pending |
| Make Remotion smoke checks reproducible | `scripts/fixtures/editor-remotion-smoke-manifest.json` is a committed styled image/keyframe manifest fixture accepted by `scripts/render-editor-composition.mjs` and referenced by the live-validation runbook. | Implemented |
| Make local editor try-out possible before commit/push | `src/lib/devAuthBypass.ts` centralizes the dev-only auth bypass behind `import.meta.env.DEV && VITE_BYPASS_AUTH_FOR_TESTS === "true"`; `AuthProvider`, `EditorPage`, `VideoEditorProvider`, `VideoEditor`, `AppHeader`, billing/credits hooks, and editor autosave skip live Supabase-only flows under that flag. The editor can be opened locally at `/projects/local-editor/editor` with mock assets and without committing or pushing. | Implemented locally |
| Prevent impossible remote exports before job creation | `src/hooks/useExport.ts` validates that the project is saved and the editor has at least one visual clip with a public HTTP(S) URL before invoking `director-cut`; `src/components/editor/toolbar/ExportDialog.tsx` surfaces the same blocker and disables Start Export; `src/components/editor/toolbar/ExportDialog.test.tsx` covers both the helper logic and the rendered dialog path for local-only clips and the Styled/Remotion backend button; `src/lib/editor/renderCapabilities.ts` shares the URL check with tests. | Implemented |
| Keep Supabase/Postgres changes conservative | Work uses existing `timelines`, `timeline_assets`, `export_jobs`, and `final-exports`; no new database migration was added for the editor/export path. | Satisfied |
| Keep Seedance out of export rendering | No Seedance generation APIs are introduced into Director's Cut or `/editor` export; Seedance remains a generation concern. | Satisfied |
| Surface renderer limitations | `src/lib/editor/renderCapabilities.ts` and `supabase/functions/_shared/export-helpers.ts` report FAL limitations for transforms, transitions, effects, and keyframes; the export dialog surfaces the warning only for the Fast/FAL renderer. | Implemented |

## Verification Evidence

- Focused tests: `npm run test -- scripts/director-cut-env-files.test.mjs scripts/check-director-cut-env.test.mjs scripts/seed-director-cut-live-fixture.test.mjs scripts/run-director-cut-live-export.test.mjs scripts/inspect-director-cut-live.test.mjs scripts/director-cut-remotion-worker.test.mjs scripts/render-editor-composition.test.mjs supabase/functions/director-cut/remotion-manifest.test.ts supabase/functions/director-cut/job-payloads.test.ts supabase/functions/director-cut/timeline-assets.test.ts src/services/__tests__/videoEditorService.test.ts src/hooks/__tests__/useExport.test.tsx src/components/editor/toolbar/ExportDialog.test.tsx src/components/editor/VideoEditor.test.tsx src/pages/EditorPage.test.tsx src/lib/editor/remotionRenderManifest.test.ts src/lib/editor/renderCapabilities.test.ts remotion/Root.test.tsx src/components/__tests__/ProtectedRoute.test.tsx`
  - Result: 19 files passed, 89 tests passed.
- Typecheck: `npx tsc --noEmit`
  - Result: passed.
- Lint: expanded `npx eslint` over the touched editor/export scripts, Remotion files, Director's Cut helpers, export hook/dialog, timeline helpers, and local dev-auth bypass files.
  - Result: passed with only existing fast-refresh warnings in provider files.
- Repo-wide lint: `npm run lint`
  - Result: failed on an existing project-wide backlog (`827` problems) across unrelated canvas, project setup, Supabase function, MCP, setup, and config files. The branch-specific touched-file lint above has zero errors.
- Production build: `npm run build`
  - Result: passed with existing Vite/vendor/chunk warnings.
- Remotion render smoke: `npm run remotion:render:editor -- --props scripts/fixtures/editor-remotion-smoke-manifest.json --out /private/tmp/wzrd-editor-styled-smoke.mp4 --concurrency 1 --crf 35`
  - Result: produced `/private/tmp/wzrd-editor-styled-smoke.mp4` from the committed styled image/keyframe fixture.
- Worker help: `npm run director-cut:remotion-worker -- --help`
  - Result: shows queue, render, and stale recovery flags.
- Live fixture seed help: `npm run director-cut:seed-live-fixture -- --help`
  - Result: shows project/user/media inputs and dry-run mode.
- Live export runner help: `npm run director-cut:run-live-export -- --help`
  - Result: shows fast/styled renderer selection, user token inputs, and polling flags.
- Live inspector help: `npm run director-cut:inspect-live -- --help`
  - Result: shows project/job inspection options and storage-check behavior.
- Env preflight: `npm run director-cut:check-env` and `npm run director-cut:check-env -- --mode runner --json`
  - Result: both exit blocked until the required Supabase/FAL/session variables are set, without printing secret values. The CLIs auto-load `.env.example`, so public Supabase URL variables are present while blank secret placeholders remain missing.
- Workspace hygiene: `git diff --check`
  - Result: passed.
- Local try-out server: `VITE_BYPASS_AUTH_FOR_TESTS=true VITE_USE_MOCK_ASSETS=true npm run dev -- --host 127.0.0.1 --port 5176`
  - Result: Vite served `http://127.0.0.1:5176/`.
- Local browser smoke: headless Playwright opened `http://127.0.0.1:5176/projects/local-editor/editor`
  - Result: editor chrome rendered; no authentication wall; no project-fetch toast; no edge-function toast; no `local-editor` UUID Supabase asset-load errors. The page still reports the existing external `https://cdn.gpteng.co/gptengineer.js` helper reading `lov` and headless WebGL fallback console errors from `LoadingScreen`, neither of which blocked the editor UI.

## Missing Or Weak Evidence

The goal is not complete because live export validation has not run. The current shell is missing:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FAL_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_ACCESS_TOKEN` for the CLI live export runner

Without those credentials, these requirements remain unverified:

- Creating a real Director's Cut FAL export from a saved editor timeline.
- Creating a real `remotion_worker` job through the edge function.
- Running the worker against Supabase, uploading the MP4 to `final-exports`, and confirming the completed `export_jobs.output_url`.
- Verifying final output against a real project containing audio, trims, cached metadata, and styled clips.
- Running `npm run director-cut:inspect-live -- --project-id <project_id> --job-id <fal_job_id> --job-id <remotion_job_id>` to capture concrete pass/fail evidence from real rows and storage objects.

The exact live validation sequence is documented in `docs/director-cut-live-validation.md`.

## Completion Decision

Do not mark the objective complete until the live Supabase/FAL/Remotion-worker validation passes against a real project and the resulting `export_jobs` rows and storage outputs are inspected.
