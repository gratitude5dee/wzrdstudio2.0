# App Audit

Date: 2026-05-03

## Critical

- Editor persistence was incomplete. `/editor` depended on in-memory clips while `timeline_clips`, `compositions`, and durable keyframes were missing. Fixed in this branch with Supabase tables, RLS, indexes, generated types, and service mappings.
- Editor export could run as a long synchronous browser-triggered render and had no webhook recovery path. Fixed in this branch by routing Editframe export through async `export_jobs`, signed webhooks, and manual reconcile.
- Browser-visible render secrets would be unacceptable for Editframe. Current implementation keeps `EDITFRAME_API_KEY` and `EDITFRAME_WEBHOOK_SECRET` inside Supabase Edge Functions and surfaces setup errors in the UI.

## High

- Audio schema was mismatched across editor UI and DB. Fixed with `volume`, `is_muted`, `track_index`, `fade_in_ms`, `fade_out_ms`, and metadata persistence.
- Text clips were UI-only and could not survive reload/export. Fixed by making text a first-class `timeline_clips.clip_type` and serializing it through the shared Editframe composition builder.
- Duplicate editor shortcut hooks were competing for the same keys. Fixed in the editor entry point by using `useEditorShortcuts` as the single active keyboard layer and routing Cmd/Ctrl+E to export.
- `AssetDropZone` loaded media through a `useState` mount side effect. Fixed by moving it to `useEffect`.
- Undo/redo controls were hardcoded disabled. Fixed by wiring them to store history.

## Medium

- Production logs are noisy in Edge Functions and some include prompts/provider payload structure. Backlog: add structured redaction helpers and log levels before expanding external provider usage.
- Studio/WZRD still has a large provider surface and should get contract tests around all model/action validator failures. Backlog: test invalid Codex blueprint repair and model catalog drift.
- Director's Cut and editor export now share the serializer path, but fal/Editframe payload parity should be monitored with golden fixtures. Backlog: add snapshot fixtures for mixed video/image/text/audio exports.
- Route-level test coverage is uneven for authenticated deep links. Backlog: add smoke tests for `/projects/:projectId/editor`, `/timeline`, `/studio`, and unauthenticated redirects.
- Browser smoke of `/projects/test-project/editor` without a valid authenticated project loads the app shell but produces expected Supabase 401s and existing React Three Fiber fallback console errors from `LoadingScreen`. Backlog: make unauthenticated deep links short-circuit before project data fetches and simplify the global loading screen fallback so it does not emit WebGL console noise.
- Large editor chunks are expected after adding Editframe, but should be code-split further. Backlog: lazy-load editor-only dependencies outside the primary app bundle.

## Verification Focus

- Schema/RLS: project-owned rows only for compositions, clips, keyframes, audio, webhook events, and export jobs.
- Editor UX: asset click/drop, trim, transform, text editing, audio fades, transition/effect controls, undo/redo, and reload persistence.
- Export: setup failure card, async processing state, webhook completion, failed render state, and reconcile for missed webhook delivery.
