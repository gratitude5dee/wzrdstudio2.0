# Editor QCut/OpenCut Migration Plan

See `docs/editor-completion-audit.md` for the current prompt-to-artifact checklist, verification evidence, and remaining live-validation gap. See `docs/director-cut-live-validation.md` for the final live export runbook.

## Source Reference Anchors

- QCut base reference: `/Users/gratitud3/Downloads/wzrdstudio/qcut-master/qcut/docs/technical/remotion-timeline-rendering.md` describes the timeline-to-Remotion export model, transform support, layer ordering, audio merge, and final FFmpeg encoding handoff that informed the `/editor` Remotion manifest and worker path.
- QCut media reference: `/Users/gratitud3/Downloads/wzrdstudio/qcut-master/qcut/docs/technical/media-panel-reference.md` describes library, media, AI video, effects, filters, transitions, and Remotion tabs that informed the project editor panel boundaries.
- OpenCut actions reference: `/Users/gratitud3/Downloads/wzrdstudio/OpenCut-main/docs/actions.md` defines an action-trigger layer for keyboard shortcuts, UI buttons, and context menus; the local implementation maps that idea into pure `timelineCommands.ts` primitives and the existing keyboard/context integrations.
- OpenCut keyframes reference: `/Users/gratitud3/Downloads/wzrdstudio/OpenCut-main/docs/keyframes.md` describes a split data-model/registry/UI keyframe system; the local implementation persists keyframes in the normalized editor timeline document and forwards them into Remotion manifests.
- OpenCut effects renderer reference: `/Users/gratitud3/Downloads/wzrdstudio/OpenCut-main/docs/effects-renderer.md` describes typed effect definitions and renderer pass resolution; the local implementation preserves effect definitions for Remotion and reports FAL warnings when the remote compose backend cannot apply them.

## Current Slice

The `/editor/:projectId` page now has a QCut/OpenCut-style persistence seam: visual clips, audio tracks, and composition settings are saved as one normalized timeline document in the existing `timelines.composition_data` column. This avoids depending on the missing `timeline_clips` and `compositions` tables while preserving the editor's current Zustand workflow.

The export action now targets the existing Director's Cut edge function instead of the missing `export-video` function. Director's Cut can hydrate `timeline_assets` from the editor timeline document, so the remote FFmpeg pipeline receives timeline-backed visual and audio assets without requiring a new database migration.

## Architecture Contract

- `src/lib/editor/timelineDocument.ts` is the source of truth for timeline serialization, normalization, and duration derivation.
- `src/services/videoEditorService.ts` owns reads and writes for editor timeline state and keeps saves queued per project to avoid rapid-edit write races.
- `src/hooks/useRealtimeTimelineSync.ts` listens to `timelines` row changes, not clip-table rows.
- `src/hooks/useExport.ts` creates and polls Director's Cut MP4 jobs.
- `remotion/Root.tsx` exposes `VideoEditorComposition` through the same `EditorComposition` used by `/editor` preview, so a Remotion/FFmpeg renderer can consume serialized editor props with transform, effect, transition, keyframe, trim, and audio behavior intact.
- `src/lib/editor/remotionRenderManifest.ts` builds the typed Remotion render manifest for that handoff, and `npm run remotion:render:editor -- --props <manifest.json> --out <file.mp4>` runs the local/worker renderer using Remotion CLI.
- Director's Cut can now enqueue a `remotion_worker` export by passing `settings.renderBackend = "remotion_worker"`. The edge function stores a self-contained `provider_payload.remotionManifest`, and `npm run director-cut:remotion-worker -- --once` claims queued jobs, renders via Remotion, uploads to `final-exports`, and completes the existing `export_jobs` row.
- Worker operations can opt into stale-job recovery with `npm run director-cut:remotion-worker -- --once --requeue-stale --stale-timeout-ms 1800000 --max-requeues 2`. The worker preflights the local render script and executable Remotion CLI before polling or claiming jobs, then requeues stale processing jobs with retry telemetry until the retry cap and fails them explicitly instead of leaving them stuck in `processing`.
- Live validation readiness is checked by `npm run director-cut:check-env`, which reports only set/missing status for client, FAL, and Remotion worker environment variables.
- `supabase/functions/director-cut/index.ts` is responsible for converting the latest editor timeline document into `timeline_assets` rows when an export starts.
- Clip effects live on `Clip.effects`; keyframes live in `EditorTimelineDocument.keyframes` and are persisted with the timeline document.
- Visual trim handles persist `trimStart`/`trimEnd` metadata, and Director's Cut preprocesses trimmed video clips through FAL `trim-video` before compose/merge.
- Media-library thumbnails, preview URLs, and cached media metadata stay attached to timeline clips/audio tracks and are forwarded into Director's Cut `timeline_assets.metadata`. The remote renderer can reuse cached duration metadata instead of treating missing video duration as a hard compose failure.
- `src/lib/editor/timelineCommands.ts` provides OpenCut-style pure command primitives for split, delete/ripple delete, duplicate, and grouped move operations so toolbar, keyboard, context menu, and drag controls can commit one history entry and one persistence pass per edit.
- The current FAL Compose backend applies timeline ordering, timing, trim preprocessing, and audio placement. It preserves transforms, transitions, effects, and keyframes as metadata and reports render warnings because the backend schema does not expose spatial/filter controls. The Remotion worker path is the styled render path for those features.
- `src/lib/editor/renderCapabilities.ts` mirrors that limitation on the client so the export dialog can warn before a remote render job is started.
- Director's Cut timeline-to-asset mapping lives in `supabase/functions/director-cut/timeline-assets.ts`, making editor sync rows and persisted export-asset mapping testable without invoking the Edge Runtime.

## Guardrails

- Keep using the existing `timelines`, `timeline_assets`, and `export_jobs` tables until product requirements justify new timeline tables.
- Prefer typed document migrations in `timelineDocument.ts` over ad hoc JSON handling in components or hooks.
- Preserve project ownership checks in edge functions before syncing or exporting timeline assets.
- Do not introduce Seedance generation into editor export paths; Seedance belongs in generation workflows, while Director's Cut handles final rendering.

## Next Implementation Phases

1. Add an environment-specific worker deployment target for `director-cut:remotion-worker` using the stale-job recovery flags in the worker command.
2. Expand export tests around Director's Cut job creation, status polling, and sync failure cases.
3. Run a live Supabase/FAL and Remotion-worker export with audio, trim handles, cached media metadata, and styled clips to verify provider telemetry and final output.
