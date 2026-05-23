# CODEX SPEC — WorldStudio Editor Parity

> **For Codex:** implement this spec in `/root/fanagent` task-by-task. Preserve existing FanAgent v2 generation, library, calendar, TikTok publishing, and lyric-template flows. This document is normative for the WorldStudio editor parity work. If existing code conflicts with this spec, keep backwards compatibility and add the migration/refactor path described here.

**Authoring stance:** senior principal architect, 30+ years production systems experience.

**Date:** 2026-05-22

**Target repo:** `fanagent` — Vite + React 19 + TypeScript, Supabase Postgres/Storage/Edge Functions/Cron, FullCalendar, existing lyric-video generation pipeline.

**Primary goal:** turn FanAgent from a generation launcher plus library/calendar into a practical browser-based short-form video editor with WorldStudio parity: project documents, media bin, timeline, preview canvas, lyric/text editing, autosave/revisions, undo/redo, keyboard shortcuts, render-job orchestration, and integration back into the existing video library and scheduling system.

**Non-goal:** do not build full Premiere/After Effects parity. Build a robust short-form social video editor optimized for 15/30/45/60/75/90 second lyric/fan videos.

---

## 0. Executive Decision Summary

Build a first-class editor project system instead of overloading `kanvas_lyric_templates.render_defaults`, `video_library_items.metadata`, or `generation_items.segments`.

The new editor must:

1. Add persistent editor tables: `video_editor_projects`, `video_editor_revisions`, `video_editor_assets`, `video_editor_render_jobs`, and optional `video_editor_project_events`.
2. Add a canonical, versioned `EditorProjectSnapshot` JSON schema shared by preview, persistence, tests, and render orchestration.
3. Add `/editor/:projectId` as the first-class editor route.
4. Add creation entrypoints:
   - open a saved lyric template in the editor;
   - open a finalized library item in the editor;
   - create a blank editor project;
   - duplicate/remix an existing editor project.
5. Preserve existing flows:
   - `/` Autopilot generation;
   - `/lyrics`, `/lyrics/new`, `/lyrics/:templateId` template wizard;
   - `/lyrics/:templateId/remix` generation launcher;
   - `/library`, `/library/:audioClipId` library review;
   - `/calendar` / Studio scheduling.
6. Add a modular React editor workspace:
   - media bin;
   - timeline;
   - preview canvas;
   - inspector/properties panel;
   - layer/track panel;
   - transport bar;
   - render/export panel.
7. Implement command-based editing with undo/redo and debounced autosave.
8. Implement a render-job API and DB model. Supabase Edge Functions orchestrate render jobs; long CPU/GPU render work must run through an external worker/provider path, not inside Edge Functions.
9. Exported editor projects must register a `media_assets` row and may optionally create or update a `video_library_items` row so the output can flow into existing schedule/publish machinery.
10. Ship with reducer/unit tests, Edge Function tests, and at least one Playwright E2E editing smoke path.

---

## 1. Existing Architecture to Preserve

### 1.1 Current routes

Current app route reality:

- `/` — `App.tsx`, default Autopilot, with query-state studio modes.
- `/calendar` — currently redirects to `/?mode=studio&view=calendar`.
- `/library` — `LibraryLanding`.
- `/library/:audioClipId` — `LibraryDetail`.
- `/clips` — `ClipsPage`.
- `/settings/accounts` — `AccountsPage`.
- `/lyrics` — `LyricsHome`.
- `/lyrics/new` — `LyricsWizard`.
- `/lyrics/:templateId` — `LyricsWizard`.
- `/lyrics/:templateId/remix` — `RemixEditor`.
- `/lyrics/:templateId/jobs` — `RemixJobs`.

Add:

- `/editor/new` — creates a blank project then redirects to `/editor/:projectId`.
- `/editor/:projectId` — WorldStudio editor workspace.
- `/editor/:projectId/render/:renderJobId` — optional render-status deep link; may be implemented as route state inside `/editor/:projectId`.

Do not remove existing routes in the first implementation. Add bridges first, deprecate later only after tests prove no regression.

### 1.2 Current generation and library primitives

Preserve and reuse:

- `audio_clips` — user-facing trimmed audio clip.
- `kanvas_lyric_templates` — lyric blocks, cut markers, waveform peaks, source/trimmed audio, render defaults.
- `generation_batches` / `generation_items` — queue and generation work units.
- `video_library_items` — finalized videos between generation and scheduling.
- `media_assets` — durable media registry.
- `source_candidates` / `source_candidate_uses` — source browsing, dedupe, provenance ledger.
- `render_attempts` — existing generation/render attempt history.
- `posts` / `publish_attempts` — scheduling and TikTok publishing.

Existing Edge Functions to preserve:

- `fanpage-campaign`, `create-generation-batch`, `fanpage-generate-due`.
- `audio-clip-register`, `audio-clip-transcribe`.
- `kanvas-lyrics-template`, `kanvas-lyrics-transcribe`, `kanvas-lyrics-audio-register`.
- `source-candidate-search`, `source-candidate-replace`.
- `stitch-segments`, `render-karaoke`, `library-finalize`.
- `library-schedule`, `library-bulk-schedule`, `update-post-schedule`.
- `publish-tiktok-due`, `fanpage-publish-due`.

### 1.3 Current gaps this spec closes

The current app has excellent primitives but not a true editor:

- `RemixEditor.tsx` is mostly a generation launcher, not a timeline/canvas editor.
- There is no persistent editor project model.
- There is no timeline/layer/composition schema.
- There is no media-bin import UI across `media_assets`, `video_library_items`, `source_candidates`, and uploads.
- There is no multi-track timeline, trim/split/move, or command-based undo/redo.
- Preview and final rendering do not share one composition schema.
- Render jobs have no project/revision context.
- Studio create flow and Autopilot create flow overlap; this spec uses Autopilot/Lyrics as canonical inputs and adds editor bridges.

---

## 2. Product Requirements

### 2.1 User personas

1. Creator/operator
   - Uploads music, reviews lyrics, generates many videos, schedules posts.
   - Needs fast fixes: move a caption, swap a clip, trim a segment, export.

2. Creative editor
   - Starts from a generated library item and makes it better.
   - Needs timeline, canvas positioning, text style, overlays, keyboard shortcuts.

3. Power user / agency
   - Reuses templates, imports stock/library assets, exports variants, schedules batches.
   - Needs revisions, duplicate project, provenance, stable render jobs.

### 2.2 MVP editor capabilities

The first shippable WorldStudio parity milestone must support:

- Create project from a `kanvas_lyric_templates.id`.
- Create project from a `video_library_items.id`.
- Create blank project.
- Load/save project snapshots.
- Autosave current project.
- Timeline with at least:
  - one video track;
  - one audio track;
  - one lyrics/text track;
  - markers track.
- Add/import assets into media bin.
- Drag asset to timeline.
- Move clip on timeline.
- Trim clip start/end.
- Split selected clip at playhead.
- Delete selected clip.
- Undo/redo for all above operations.
- Preview active clips at playhead in a 9:16 canvas.
- Render active lyric/text overlays in preview.
- Play/pause/seek with audio sync for primary audio.
- Edit selected text/lyrics style in inspector.
- Save and reload without losing project state.
- Create render job from current revision.
- Show render progress/status.
- On successful render, create `media_assets` output and expose action: “Add to Library” or “Schedule”.

### 2.3 Non-MVP but schema-compatible capabilities

Keep schema and module boundaries ready for:

- Collaboration/presence.
- CRDT/operation-log syncing.
- Keyframed animation editor.
- Advanced effects/transitions.
- Proxy generation.
- Remotion Player and Remotion render worker.
- Caption word-level karaoke highlight in final render.
- Template marketplace/presets.
- Batch variant generation from one editor project.

---

## 3. Information Architecture and Routes

### 3.1 New route map

Add to `src/lib/routes.ts`:

```ts
export const appRoutes = {
  // existing keys preserved
  editorNew: "/editor/new",
  editorProject: (id: string) => `/editor/${id}`,
  editorFromTemplate: (templateId: string) => `/editor/new?templateId=${encodeURIComponent(templateId)}`,
  editorFromLibraryItem: (libraryItemId: string) => `/editor/new?libraryItemId=${encodeURIComponent(libraryItemId)}`,
};
```

Update router registration in `src/main.tsx`:

- `/editor/new` -> `EditorCreateRedirectPage`.
- `/editor/:projectId` -> `WorldStudioEditorPage`.

### 3.2 Entrypoints

Add “Open in Editor” CTAs:

1. `LyricsHome` template cards.
2. `LyricsWizard` saved/final screen.
3. `RemixEditor` header and launch panel.
4. `LibraryTile` menu.
5. `LibraryDetail` bulk action bar.
6. `StudioPostReview` when selected post has `library_item_id`.

CTA behavior:

- For a lyric template: invoke `video-editor-project` with `action: 'createFromLyricTemplate'`, then navigate to `/editor/:projectId`.
- For a library item: invoke `video-editor-project` with `action: 'createFromLibraryItem'`, then navigate.
- If a project already exists for source and user chooses “Open existing”, navigate to the latest project instead of duplicating.
- If user chooses “Duplicate/remix”, create a new project with `source_type='editor_project'` and `source_id=<oldProjectId>`.

### 3.3 Editor page layout

`WorldStudioEditorPage` layout:

- Top bar:
  - Back button.
  - Project title editable inline.
  - Aspect ratio selector.
  - Save state: `Saving…`, `Saved`, `Offline`, `Conflict`.
  - Undo/redo buttons.
  - Export button.
- Left panel:
  - Media bin tab.
  - Layers/tracks tab.
  - Templates/presets tab later.
- Center:
  - Preview canvas.
  - Transport controls.
  - Timeline.
- Right panel:
  - Inspector for selected clip/track/project.
  - Render/export status panel when active.

CSS must be responsive enough for desktop/laptop first. Mobile editing can show read-only or simplified controls; do not block mobile route load.

---

## 4. Data Model

### 4.1 Migration file

Create a new migration:

`supabase/migrations/YYYYMMDDHHMMSS_worldstudio_editor_parity.sql`

Use the current timestamp naming convention. Migration must be idempotent where feasible.

### 4.2 `video_editor_projects`

```sql
create table if not exists public.video_editor_projects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  title text not null default 'Untitled edit',
  source_type text not null default 'blank'
    check (source_type in ('blank','lyric_template','generation_item','library_item','editor_project')),
  source_id uuid,
  aspect_ratio text not null default '9:16'
    check (aspect_ratio in ('9:16','1:1','16:9')),
  width int not null default 1080,
  height int not null default 1920,
  fps int not null default 30 check (fps in (24,25,30,50,60)),
  duration_ms int not null default 15000 check (duration_ms > 0 and duration_ms <= 600000),
  status text not null default 'draft'
    check (status in ('draft','rendering','rendered','failed','archived')),
  thumbnail_url text,
  current_revision_id uuid,
  editing_client_id text,
  editing_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_editor_projects_account_updated
  on public.video_editor_projects(account_id, updated_at desc);
create index if not exists idx_video_editor_projects_source
  on public.video_editor_projects(source_type, source_id);
```

After `video_editor_revisions` exists, add the FK:

```sql
do $$ begin
  alter table public.video_editor_projects
    add constraint video_editor_projects_current_revision_fk
    foreign key (current_revision_id) references public.video_editor_revisions(id) on delete set null;
exception when duplicate_object then null;
end $$;
```

### 4.3 `video_editor_revisions`

```sql
create table if not exists public.video_editor_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_editor_projects(id) on delete cascade,
  revision_number int not null,
  snapshot jsonb not null,
  autosave boolean not null default true,
  comment text,
  created_by_client_id text,
  created_at timestamptz not null default now(),
  unique(project_id, revision_number)
);

create index if not exists idx_video_editor_revisions_project_created
  on public.video_editor_revisions(project_id, created_at desc);
```

### 4.4 `video_editor_assets`

```sql
create table if not exists public.video_editor_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_editor_projects(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  project_asset_id uuid references public.project_assets(id) on delete set null,
  library_item_id uuid references public.video_library_items(id) on delete set null,
  source_candidate_id uuid references public.source_candidates(id) on delete set null,
  kind text not null check (kind in ('video','image','audio','text','lyrics','subtitle','shape','effect')),
  name text not null default 'Untitled asset',
  duration_ms int,
  width int,
  height int,
  public_url text,
  storage_bucket text,
  storage_path text,
  waveform_peaks jsonb,
  thumbnail_url text,
  provenance jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_editor_assets_project
  on public.video_editor_assets(project_id, created_at desc);
```

### 4.5 `video_editor_render_jobs`

```sql
create table if not exists public.video_editor_render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_editor_projects(id) on delete cascade,
  revision_id uuid not null references public.video_editor_revisions(id) on delete restrict,
  account_id uuid references public.accounts(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued','rendering','succeeded','failed','cancelled')),
  provider text not null default 'fal_ffmpeg'
    check (provider in ('fal_ffmpeg','remotion','mock')),
  progress numeric not null default 0 check (progress >= 0 and progress <= 1),
  output_asset_id uuid references public.media_assets(id) on delete set null,
  output_library_item_id uuid references public.video_library_items(id) on delete set null,
  output_url text,
  error_code text,
  error_message text,
  render_settings jsonb not null default '{}'::jsonb,
  idempotency_key text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, idempotency_key)
);

create index if not exists idx_video_editor_render_jobs_project_created
  on public.video_editor_render_jobs(project_id, created_at desc);
create index if not exists idx_video_editor_render_jobs_status
  on public.video_editor_render_jobs(status, created_at);
```

### 4.6 Optional `video_editor_project_events`

MVP may create the table but does not need full collaboration.

```sql
create table if not exists public.video_editor_project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_editor_projects(id) on delete cascade,
  client_id text not null,
  event_type text not null,
  operation jsonb not null,
  revision_base int,
  created_at timestamptz not null default now()
);

create index if not exists idx_video_editor_project_events_project_created
  on public.video_editor_project_events(project_id, created_at desc);
```

### 4.7 RLS and realtime

All new tables must:

```sql
alter table public.video_editor_projects enable row level security;
alter table public.video_editor_revisions enable row level security;
alter table public.video_editor_assets enable row level security;
alter table public.video_editor_render_jobs enable row level security;
alter table public.video_editor_project_events enable row level security;
```

Use the same broad read policy currently used by this codebase for MVP:

```sql
do $$ begin
  create policy "video_editor_projects_read" on public.video_editor_projects
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
```

Repeat for all new tables. Inserts/updates/deletes are service-role only through Edge Functions unless the app already uses direct Supabase writes for similar resources. Prefer service-role Edge Function writes for editor projects to keep validation centralized.

Enable realtime for:

- `video_editor_projects`.
- `video_editor_render_jobs`.

Set replica identity full if using postgres_changes diffs:

```sql
alter table public.video_editor_projects replica identity full;
alter table public.video_editor_render_jobs replica identity full;
```

Add to publication idempotently.

---

## 5. Canonical Editor Snapshot Schema

Create:

- `src/lib/editor/schema.ts`
- `supabase/functions/_shared/editor/schema.ts` if Edge Functions need runtime validation.

### 5.1 TypeScript schema

```ts
export type EditorAspectRatio = "9:16" | "1:1" | "16:9";
export type EditorTrackKind = "video" | "audio" | "text" | "lyrics" | "overlay" | "effect" | "markers";
export type EditorClipKind = "video" | "image" | "audio" | "text" | "lyrics" | "caption" | "shape";

export type EditorProjectSnapshot = {
  schemaVersion: 1;
  project: {
    id: string;
    title: string;
    aspectRatio: EditorAspectRatio;
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    background: string;
  };
  tracks: EditorTrack[];
  clips: EditorClip[];
  assets: EditorAssetRef[];
  markers: EditorMarker[];
  renderSettings: EditorRenderSettings;
};

export type EditorTrack = {
  id: string;
  name: string;
  kind: EditorTrackKind;
  order: number;
  locked: boolean;
  muted: boolean;
  hidden: boolean;
  height?: number;
};

export type EditorAssetRef = {
  id: string;
  kind: "video" | "image" | "audio" | "text" | "lyrics" | "subtitle" | "shape" | "effect";
  name: string;
  mediaAssetId?: string | null;
  projectAssetId?: string | null;
  libraryItemId?: string | null;
  sourceCandidateId?: string | null;
  publicUrl?: string | null;
  signedUrl?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  thumbnailUrl?: string | null;
  waveformPeaks?: number[] | null;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type EditorClip = {
  id: string;
  trackId: string;
  assetId?: string | null;
  kind: EditorClipKind;
  startMs: number;
  durationMs: number;
  sourceStartMs: number;
  sourceEndMs?: number | null;
  zIndex: number;
  transform: EditorTransform;
  crop?: EditorCrop | null;
  style?: EditorClipStyle;
  animation?: EditorKeyframe[];
  text?: EditorTextPayload | null;
  lyrics?: EditorLyricsPayload | null;
  effects?: EditorEffectRef[];
  metadata?: Record<string, unknown>;
};

export type EditorTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
};

export type EditorCrop = { x: number; y: number; width: number; height: number };

export type EditorClipStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  backgroundColor?: string;
  borderRadius?: number;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  preset?: "default" | "bold-impact" | "minimal" | "neon" | string;
};

export type EditorTextPayload = {
  text: string;
  contentEditable?: boolean;
};

export type EditorLyricsPayload = {
  mode: "block" | "word" | "karaoke";
  blocks: Array<{
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    words: Array<{ id: string; text: string; startMs: number; endMs: number }>;
  }>;
  offsetMs: number;
};

export type EditorMarker = {
  id: string;
  timeMs: number;
  kind: "cut" | "beat" | "lyric" | "chapter";
  label?: string;
};

export type EditorKeyframe = {
  timeMs: number;
  property: string;
  value: unknown;
  easing?: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
};

export type EditorEffectRef = {
  id: string;
  kind: string;
  params: Record<string, unknown>;
};

export type EditorRenderSettings = {
  format: "mp4";
  codec: "h264";
  audioCodec: "aac";
  width: number;
  height: number;
  fps: number;
  bitrate?: string;
  includeCaptions: boolean;
  quality: "draft" | "standard" | "high";
};
```

### 5.2 Snapshot invariants

Validation must enforce:

- `schemaVersion === 1`.
- `project.durationMs > 0` and `<= 600000`.
- Every clip references an existing track.
- Every clip with `assetId` references an existing asset.
- `startMs >= 0`.
- `durationMs >= 100` except markers/effects if explicitly allowed later.
- `sourceStartMs >= 0`.
- `startMs + durationMs <= project.durationMs + 1000` (allow a tiny tolerance only during drag; persisted snapshots should clamp).
- Track orders are unique integers.
- Clip IDs, track IDs, asset IDs, marker IDs are unique.
- Hidden/muted/locked fields are booleans.
- Render settings match project aspect ratio dimensions unless intentionally overridden.

### 5.3 Snapshot migration

Create `src/lib/editor/migrations.ts`:

- `normalizeEditorSnapshot(input): EditorProjectSnapshot`.
- `migrateEditorSnapshot(input): EditorProjectSnapshot`.

Even with only schema v1, include the migration boundary now.

---

## 6. Edge Function API Contract

All new functions must use the app’s envelope shape:

```json
{
  "success": true,
  "code": "OK",
  "message": "...",
  "data": {},
  "error": null,
  "errorDetail": null
}
```

### 6.1 New function: `video-editor-project`

Path:

`supabase/functions/video-editor-project/index.ts`

Actions:

#### `createBlank`

Request:

```json
{
  "action": "createBlank",
  "accountId": "optional uuid",
  "title": "Untitled edit",
  "aspectRatio": "9:16",
  "durationMs": 15000
}
```

Response data:

```json
{ "project": { "id": "..." }, "revision": { "id": "..." }, "snapshot": {} }
```

#### `createFromLyricTemplate`

Request:

```json
{
  "action": "createFromLyricTemplate",
  "templateId": "uuid",
  "accountId": "optional uuid",
  "openExisting": true
}
```

Behavior:

- Load `kanvas_lyric_templates` by id.
- Resolve trimmed/source audio media asset.
- Build initial editor snapshot:
  - one audio track with trimmed audio asset;
  - one lyrics track with lyric blocks;
  - one markers track from cut markers;
  - default project duration from `selection_duration_ms`;
  - text style from `render_defaults`.
- Create `video_editor_assets` rows for audio and lyrics pseudo-asset.
- Create project and revision.
- Return project/revision/snapshot.

#### `createFromLibraryItem`

Request:

```json
{
  "action": "createFromLibraryItem",
  "libraryItemId": "uuid",
  "openExisting": true
}
```

Behavior:

- Load `video_library_items` plus `media_assets` final asset.
- Build initial editor snapshot:
  - one video track containing final MP4 as video clip;
  - optional audio track if audio provenance exists;
  - optional lyrics/text clips from `segments`/`provenance`/metadata if available;
  - markers from segment boundaries.
- Create project and revision.

#### `duplicate`

Request:

```json
{ "action": "duplicate", "projectId": "uuid", "title": "Copy of ..." }
```

Behavior:

- Load latest revision.
- Create a new project with `source_type='editor_project'` and `source_id=<oldProjectId>`.
- Copy asset references.
- Create revision 1.

#### `get`

Request:

```json
{ "action": "get", "projectId": "uuid" }
```

Return:

- project;
- latest revision;
- assets;
- active render jobs;
- snapshot with signed URLs resolved for private storage where needed.

#### `saveRevision`

Request:

```json
{
  "action": "saveRevision",
  "projectId": "uuid",
  "snapshot": {},
  "autosave": true,
  "clientId": "browser-tab-id",
  "baseRevisionNumber": 3,
  "comment": "optional"
}
```

Behavior:

- Validate snapshot.
- If `baseRevisionNumber` is older than current and another client owns lock, return conflict envelope with code `EDITOR_REVISION_CONFLICT`.
- Otherwise append revision number `current + 1`.
- Update project `current_revision_id`, metadata, duration/aspect/dimensions, `updated_at`.
- Return new revision.

#### `updateProject`

Request supports title, aspect ratio, status archive, and editing lock refresh.

### 6.2 New function: `video-editor-asset`

Path:

`supabase/functions/video-editor-asset/index.ts`

Actions:

- `registerUpload` — create upload target or register already-uploaded media as editor asset.
- `importMediaAsset` — link existing `media_assets` into project.
- `importLibraryItem` — link a `video_library_items` final asset.
- `importSourceCandidate` — link/cache a `source_candidates` candidate.
- `listProjectAssets` — project media bin.
- `deleteAsset` — soft-delete or unlink if unused.

MVP may avoid direct upload signed URLs if existing upload utilities are reused, but asset rows must be centralized.

### 6.3 New function: `video-editor-render`

Path:

`supabase/functions/video-editor-render/index.ts`

Actions:

#### `create`

Request:

```json
{
  "action": "create",
  "projectId": "uuid",
  "revisionId": "optional uuid; defaults current",
  "provider": "fal_ffmpeg|remotion|mock",
  "renderSettings": {
    "quality": "standard",
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "includeCaptions": true
  },
  "idempotencyKey": "uuid"
}
```

Behavior:

1. Load project and revision.
2. Validate snapshot and render settings.
3. Resolve private assets to signed URLs for worker/provider.
4. Create `video_editor_render_jobs` row status `queued`.
5. If `provider='mock'`, immediately mark succeeded and optionally create a stub output for tests.
6. Otherwise enqueue/call render provider.
7. Return render job.

#### `status`

Request:

```json
{ "action": "status", "renderJobId": "uuid" }
```

#### `cancel`

Request:

```json
{ "action": "cancel", "renderJobId": "uuid" }
```

#### `callback`

Internal/service-only callback from worker/provider:

```json
{
  "action": "callback",
  "renderJobId": "uuid",
  "status": "rendering|succeeded|failed",
  "progress": 0.75,
  "output": {
    "storageBucket": "renders",
    "storagePath": "...",
    "publicUrl": "...",
    "durationMs": 15000,
    "width": 1080,
    "height": 1920
  },
  "errorCode": "optional",
  "errorMessage": "optional"
}
```

On success:

- Create `media_assets` row with `kind='rendered_video'`, `source='worldstudio_editor'`, duration/dimensions in metadata.
- Set `video_editor_render_jobs.output_asset_id` and `output_url`.
- Update project status `rendered`.
- Return output asset.

### 6.4 Render worker rule

Do not perform long-running CPU rendering inside Supabase Edge Functions.

Allowed Edge Function responsibilities:

- validate;
- create DB job;
- sign URLs;
- call an external render provider/worker;
- receive callback;
- update DB.

Rendering may initially be `mock` for tests and `fal_ffmpeg` for simple linear compositions. Remotion worker may be added behind the same API later.

---

## 7. Frontend Module Architecture

Create new modules:

```txt
src/pages/editor/
  EditorCreateRedirectPage.tsx
  WorldStudioEditorPage.tsx

src/components/editor/
  EditorShell.tsx
  EditorTopBar.tsx
  EditorMediaBin.tsx
  EditorTimeline.tsx
  EditorTimelineTrack.tsx
  EditorTimelineClip.tsx
  EditorPreviewCanvas.tsx
  EditorTransport.tsx
  EditorInspector.tsx
  EditorLayersPanel.tsx
  EditorRenderPanel.tsx
  EditorShortcutHelp.tsx

src/lib/editor/
  api.ts
  schema.ts
  migrations.ts
  store.ts
  commands.ts
  selectors.ts
  timelineMath.ts
  importers.ts
  renderPayload.ts
  shortcuts.ts
  ids.ts
```

### 7.1 Store

Use `useReducer` or Zustand. Prefer a pure reducer core so tests are easy.

Required store slices:

- project metadata;
- assets;
- tracks;
- clips;
- markers;
- selection;
- playback;
- viewport/zoom/scroll;
- history undo/redo;
- persistence dirty/saving/saved/conflict;
- render jobs.

### 7.2 Commands

All mutating editor actions must be commands.

Create `src/lib/editor/commands.ts` with command creators:

- `addTrack`.
- `removeTrack`.
- `addAsset`.
- `addClip`.
- `removeClip`.
- `moveClip`.
- `trimClipStart`.
- `trimClipEnd`.
- `splitClipAtTime`.
- `duplicateClips`.
- `updateClipTransform`.
- `updateClipStyle`.
- `updateClipText`.
- `updateLyricsBlock`.
- `addMarker`.
- `removeMarker`.
- `setProjectSettings`.

Each command must expose enough information for undo.

High-frequency interactions must coalesce:

- Drag move: preview updates during drag, one command committed on drag end.
- Trim handle: preview updates during drag, one command committed on drag end.
- Slider/property: coalesce within 300ms or on blur.

### 7.3 Selectors

Create selectors:

- `selectActiveClipsAtTime(snapshot, timeMs)`.
- `selectTracksOrdered(snapshot)`.
- `selectClipsForTrack(snapshot, trackId)`.
- `selectSelectedClips(state)`.
- `selectPrimaryAudioClip(state)`.
- `selectLayerStackAtTime(state, timeMs)`.
- `selectSnapPoints(state, options)`.

Selectors must be pure and unit-tested.

### 7.4 Timeline math

Create `timelineMath.ts`:

- `msToPx(ms, zoomPxPerMs)`.
- `pxToMs(px, zoomPxPerMs)`.
- `frameToMs(frame, fps)`.
- `msToFrame(ms, fps)`.
- `clampClipToProject(clip, durationMs)`.
- `splitClip(clip, timeMs)`.
- `trimClipStart(clip, newStartMs)`.
- `trimClipEnd(clip, newEndMs)`.
- `snapTime(timeMs, snapPoints, thresholdMs)`.

Use integer milliseconds in persisted state.

---

## 8. Editor Timeline Requirements

### 8.1 Visual timeline

Must include:

- Time ruler with seconds and frame ticks at high zoom.
- Playhead line draggable by mouse/pointer.
- Horizontal scroll and zoom controls.
- Track headers with name, kind, lock/mute/hide.
- Clip blocks with label, duration, thumbnail/waveform/text preview.
- Marker lane showing imported cut/beat/lyric markers.

### 8.2 Interactions

Required:

- Click clip to select.
- Shift-click multi-select.
- Delete selected clips.
- Drag selected clip(s) horizontally.
- Move clip between compatible tracks.
- Drag left/right trim handles.
- Split selected clip at playhead.
- Snap to playhead, clip edges, marker positions, lyric block boundaries.
- Lock track prevents changes.
- Hidden track excludes clips from preview/render.
- Muted audio track excludes clips from preview/render.

### 8.3 Constraints

- Clip `durationMs` cannot fall below 100ms.
- Clip cannot start before 0.
- Clip should not extend beyond project duration unless user is resizing project; persisted save clamps or extends project duration explicitly.
- Audio clips can only be on audio tracks.
- Text/lyrics clips can be on text/lyrics/overlay tracks.
- Video/image/shape clips can be on video/overlay tracks.

---

## 9. Preview Canvas Requirements

### 9.1 Preview behavior

The preview canvas must render the project at the selected aspect ratio:

- 9:16 default, 1080x1920 logical coordinate system.
- 1:1, 1080x1080.
- 16:9, 1920x1080.

At a given `currentTimeMs`, show all active visual clips sorted by track order + `zIndex`.

For MVP:

- Render text/lyrics/shape/image as DOM.
- Render one primary video element at a time reliably.
- If multiple videos overlap, render the highest visible video and overlays; document multi-video compositing as non-MVP unless easy.
- Audio playback uses the primary audio clip or template audio.

### 9.2 Safe-area overlays

Add toggles:

- TikTok safe zones.
- Center guides.
- Rule-of-thirds grid.
- Frame boundary.

Default on for TikTok safe-zone guide in 9:16 projects.

### 9.3 Transform controls

For selected visual/text clips:

- Drag to move.
- Resize from corners.
- Rotate later, but schema must support it.
- Inspector numeric controls for x/y/scale/rotation/opacity.

### 9.4 Preview/export consistency

The preview renderer and render/export payload must consume the same `EditorProjectSnapshot` schema. Do not create one-off preview-only state that cannot render.

---

## 10. Text and Lyrics Requirements

### 10.1 Import from lyric template

From `kanvas_lyric_templates`:

- `lyric_blocks` -> `EditorLyricsPayload.blocks`.
- `cut_markers` -> `EditorMarker[]` kind `cut`.
- `render_defaults` -> initial lyrics clip style.
- `selection_duration_ms` -> project duration.
- `trimmed_audio_asset_id` or source audio -> audio asset and audio clip.

### 10.2 Lyrics timeline

Show lyrics as either:

- one lyrics clip spanning the audio duration, containing structured blocks; or
- block-level caption clips.

MVP recommendation: one lyrics clip with nested blocks. Add block editing UI in inspector and preview active block at playhead.

### 10.3 Styling

Required style controls:

- Preset: `default`, `bold-impact`, `minimal`, `neon`.
- Font family.
- Font size.
- Weight.
- Fill color.
- Stroke color/width.
- Shadow blur/color.
- Background pill color.
- Text align.
- Position preset: bottom safe, center, top.

### 10.4 Editing

MVP editing:

- Edit active lyric block text.
- Preserve word timings where possible.
- If text changes drastically, keep block timing and mark `metadata.timingNeedsReview=true`.
- Move/resize lyrics clip on canvas.
- Update style live.

Later:

- Split/merge lyric blocks.
- Drag word boundaries.
- Word-level karaoke highlight.

---

## 11. Media Bin Requirements

### 11.1 Sources

Media bin must import from:

- uploads;
- existing `media_assets`;
- `video_library_items`;
- `source_candidates`;
- `audio_clips`;
- `project_assets`;
- lyric template assets.

### 11.2 Display fields

Each asset card shows:

- thumbnail or icon;
- name;
- kind;
- duration;
- dimensions;
- provenance/license/attribution when available;
- used count in timeline.

### 11.3 Drag/drop

Dragging asset to timeline creates a clip on a compatible track:

- audio -> audio track;
- video/image -> video/overlay track;
- text/lyrics -> text/lyrics track.

Default clip duration:

- video/audio: min(asset duration, project remaining duration).
- image/text/shape: 3000ms or selected range duration.
- lyrics: project duration or source lyric duration.

---

## 12. Autosave, Revisions, and Conflict Handling

### 12.1 Autosave

Autosave after commands with a debounce of 750ms.

Save state:

- `idle`.
- `dirty`.
- `saving`.
- `saved` with timestamp.
- `failed` with retry button.
- `conflict`.

Autosave sends full normalized snapshot to `video-editor-project action='saveRevision'`.

### 12.2 Revision policy

- Create revision 1 at project creation.
- Autosave appends revisions but should avoid unbounded growth.
- MVP can append every debounced save; add cleanup later.
- Manual save (`Cmd/Ctrl+S`) creates a revision with `autosave=false` and optional comment.

### 12.3 Editing lock

MVP uses a soft lock:

- Browser tab has `clientId` stored in session storage.
- On open, call `updateProject` to set `editing_client_id` and `editing_expires_at = now() + interval '2 minutes'`.
- Refresh lock every 30 seconds while active.
- If another client owns active lock, show read-only warning and allow “Take over”.

No CRDT for MVP.

---

## 13. Keyboard Shortcuts

Implement centralized shortcut registry in `src/lib/editor/shortcuts.ts`.

Required shortcuts:

- Space: play/pause.
- Left/Right: seek one frame or small step.
- Shift+Left/Right: seek larger step.
- Home/End: start/end.
- Cmd/Ctrl+Z: undo.
- Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y: redo.
- Cmd/Ctrl+S: save.
- Delete/Backspace: delete selected.
- S or Cmd/Ctrl+B: split at playhead.
- V: select tool.
- M: add marker.
- Cmd/Ctrl+C/X/V: copy/cut/paste clips when implemented; for MVP may only copy/paste within editor state.
- Cmd/Ctrl+D: duplicate selected clips.
- `+` / `-`: zoom timeline.
- Cmd/Ctrl+0: fit timeline.
- `[` and `]`: trim selected start/end to playhead.
- Escape: clear selection or close active popover.
- Enter: edit selected text/lyrics.
- Cmd/Ctrl+E: open export panel.

Do not trigger global shortcuts while focus is inside input, textarea, select, or contenteditable except Escape and Cmd/Ctrl+S.

Add a shortcut help modal.

---

## 14. Render and Export Architecture

### 14.1 Render providers

MVP provider modes:

1. `mock` — test/dev mode; creates successful job without expensive render.
2. `fal_ffmpeg` — simple timeline compositions that can be represented by ffmpeg concat/overlay/captions.
3. `remotion` — future/optional worker path; schema and API must not block it.

### 14.2 Render payload

Create `src/lib/editor/renderPayload.ts` that converts `EditorProjectSnapshot` into a provider-neutral render plan:

```ts
export type EditorRenderPlan = {
  projectId: string;
  revisionId: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  assets: Array<{ id: string; kind: string; url: string; durationMs?: number }>;
  tracks: EditorTrack[];
  clips: EditorClip[];
  captions: Array<{ startMs: number; endMs: number; text: string; style: EditorClipStyle }>;
  output: { format: "mp4"; codec: "h264"; audioCodec: "aac" };
};
```

### 14.3 Export UX

Export panel:

- Quality: draft / standard / high.
- Aspect/dimensions read-only by default.
- Include captions toggle.
- Render button.
- Job progress.
- On success:
  - Play output.
  - Download.
  - Add to Library.
  - Schedule.
  - Copy URL.

### 14.4 Add to Library

When a render succeeds, allow creating a `video_library_items` row if no output item exists.

Request can be part of `video-editor-render callback` or a separate action:

`video-editor-render action='addOutputToLibrary'`:

```json
{
  "renderJobId": "uuid",
  "audioClipId": "optional uuid",
  "caption": "optional",
  "hashtags": ["#fyp"]
}
```

Behavior:

- Create `video_library_items` with:
  - `status='ready'`;
  - `final_asset_id=output_asset_id`;
  - `duration_sec` from render settings;
  - `provenance` referencing editor project/revision/source;
  - `metadata.worldstudio_project_id` and `metadata.worldstudio_revision_id`.
- If source library item exists and user chooses update derivative, do not overwrite original; create derivative item unless explicit replacement is implemented with confirmation.

---

## 15. Performance Requirements

Targets:

- Editor route interactive within 3 seconds on a typical laptop with an existing 60s project.
- Timeline move/trim perceived latency under 50ms.
- Playhead updates use `requestAnimationFrame` and do not autosave every frame.
- Autosave does not block the UI thread.
- 60s project with 5–10 tracks and 100–300 lyric blocks remains usable.

Implementation rules:

- Lazy-load editor route modules.
- Memoize timeline clips and track rows.
- Use refs/transforms during drag; commit command on pointer up.
- Virtualize timeline rows/clips later if necessary.
- Revoke object URLs on unmount/delete.
- Do not decode all video assets simultaneously.
- Preload only nearby active media.
- Store waveform peaks rather than recalculating each load.
- Avoid writing giant revision snapshots on every mousemove.

---

## 16. Accessibility Requirements

The editor must be keyboard-accessible enough for MVP:

- Buttons have accessible names.
- Timeline clips are focusable.
- Selected/error states do not rely only on color.
- Track controls have labels.
- Trim handles have aria-labels and keyboard alternatives.
- Preview exposes current time and active caption text in text form.
- Render progress uses `aria-live="polite"`.
- Errors use `aria-live="assertive"` where appropriate.
- Dialogs trap focus and restore focus on close.
- Shortcut help is reachable by keyboard.
- Respect `prefers-reduced-motion` for animated UI.

Keyboard timeline minimum:

- Tab to clip.
- Enter selects/opens inspector.
- Arrow keys move selected clip by one frame or grid unit.
- Shift+Arrow moves by larger step.
- Delete removes selected.
- Escape clears selection.

---

## 17. Security and Rights Requirements

### 17.1 Storage access

- Private storage URLs must be signed server-side.
- Do not expose service-role keys to React.
- Media imported from `source_candidates` must preserve license/provenance/attribution.
- Output media must record provenance in `media_assets.metadata` and `video_library_items.provenance`.

### 17.2 Validation

Edge Functions validate:

- Project ownership/access assumptions matching current app policy.
- Snapshot schema and size limits.
- Asset references belong to project or are importable.
- Render job references current or explicit revision.
- Render callback is authenticated with an internal secret or provider signature.

### 17.3 Snapshot size

Reject snapshots above a safe limit, initially 2 MB, with error code `EDITOR_SNAPSHOT_TOO_LARGE`.

---

## 18. Testing Requirements

### 18.1 Unit tests

Create tests under `tests/editor-*.test.ts`.

Required coverage:

- `timelineMath` conversions and snapping.
- `splitClipAtTime`.
- `trimClipStart` / `trimClipEnd`.
- `moveClip` constraints.
- `selectActiveClipsAtTime`.
- Track ordering/layer stack ordering.
- Undo/redo command inversion.
- Snapshot validation and migration.
- Lyric template import into snapshot.
- Library item import into snapshot.
- Render plan generation.

### 18.2 Component tests

If current test setup supports React component tests, add:

- Timeline renders tracks and clips.
- Drag/trim commits command.
- Preview shows active text at playhead.
- Inspector changes update selected clip style.
- Shortcut dispatch calls command.

If component test setup is heavy, cover with E2E and pure reducer tests first.

### 18.3 Edge Function tests

Add or extend Deno-compatible tests where existing patterns exist:

- `video-editor-project createBlank` creates project + revision.
- `createFromLyricTemplate` imports audio, lyrics, markers.
- `saveRevision` rejects invalid snapshots.
- `saveRevision` detects stale/conflicting revision.
- `video-editor-render create` creates queued job.
- `video-editor-render callback` is idempotent.
- `mock` render succeeds and creates output metadata.

### 18.4 Playwright E2E

Add `tests-e2e/editor.spec.ts`:

1. Create/open project from lyric template fixture.
2. Verify editor route loads.
3. Play/pause preview.
4. Move a text/lyrics clip.
5. Split primary clip at playhead.
6. Undo and redo.
7. Save/reload and verify state persists.
8. Start mock render and verify status reaches succeeded.
9. Verify output action appears.

### 18.5 Regression tests

Existing tests must continue passing:

- library tests;
- schedule tests;
- lyrics tests;
- studio/calendar tests;
- generation envelope tests.

Do not break Autopilot or existing generation launch.

---

## 19. Implementation Plan for Codex

> Use small commits. Do not mix schema, API, UI, and tests in one giant change if avoidable.

### Phase 1 — Schema and API foundation

1. Add migration for editor tables, RLS, indexes, realtime publication.
2. Add `src/lib/editor/schema.ts`, `migrations.ts`, `timelineMath.ts`, `selectors.ts`.
3. Add pure snapshot validation utilities.
4. Add `supabase/functions/video-editor-project/index.ts` with `createBlank`, `get`, `saveRevision`.
5. Add `src/lib/editor/api.ts` wrappers.
6. Unit-test schema/math/selectors.

Acceptance:

- `npm test -- editor` passes for pure utilities.
- Edge function can create blank project and save revision.

### Phase 2 — Importers and route shell

1. Add `importers.ts` for lyric template -> snapshot.
2. Add library item -> snapshot importer.
3. Extend `video-editor-project` with `createFromLyricTemplate`, `createFromLibraryItem`, `duplicate`.
4. Add `/editor/new` and `/editor/:projectId` routes.
5. Add basic `EditorShell` with top bar and JSON-backed load/save smoke view.
6. Add “Open in Editor” CTAs in lyrics and library surfaces.

Acceptance:

- User can open a lyric template in `/editor/:projectId`.
- Reload retains snapshot.
- Existing routes still work.

### Phase 3 — Store, commands, undo/redo

1. Implement reducer/store.
2. Implement commands and history stack.
3. Implement selection and playback state.
4. Add autosave debounce and save-state UI.
5. Add shortcut registry for undo/redo/save/play/delete/split.

Acceptance:

- Commands are unit-tested.
- Undo/redo works for add/move/trim/split/delete.
- Autosave appends revisions and reloads current state.

### Phase 4 — Timeline MVP

1. Build timeline ruler, tracks, clips, playhead.
2. Implement click/select/multiselect.
3. Implement move and trim interactions.
4. Implement split at playhead.
5. Implement markers lane.
6. Implement zoom/scroll.

Acceptance:

- Timeline supports audio/video/lyrics tracks.
- Imported cut markers appear.
- Clip edits update snapshot and can be undone.

### Phase 5 — Preview canvas and inspector

1. Build `EditorPreviewCanvas` from active clips selector.
2. Add transport controls and audio sync.
3. Render active lyrics/text overlays.
4. Add safe-area guides.
5. Add transform controls and inspector numeric fields.
6. Add text/lyrics style inspector.

Acceptance:

- Playhead preview reflects timeline state.
- Text/lyrics position/style changes persist.
- Safe-area guides toggle.

### Phase 6 — Media bin

1. Add `video-editor-asset` function or extend project API to import assets.
2. Build media bin list for project assets.
3. Import existing `media_assets`, `video_library_items`, `source_candidates`.
4. Support upload registration if practical.
5. Drag asset to timeline.

Acceptance:

- User can import a library item/media asset and place it on timeline.

### Phase 7 — Render/export

1. Add `video-editor-render` function.
2. Add `renderPayload.ts`.
3. Implement `mock` provider for deterministic tests.
4. Implement `fal_ffmpeg` provider only for simple compositions if feasible; otherwise queue job with clear `NOT_IMPLEMENTED_FOR_PROVIDER` for unsupported complexity.
5. Add render panel and realtime/polling status.
6. On success, create output `media_assets` and optional library item.

Acceptance:

- E2E can start mock render and see success.
- Successful render output can be added to library.

### Phase 8 — Hardening

1. Accessibility pass.
2. Performance profiling and memoization.
3. Add E2E editor smoke.
4. Add docs to README.
5. Update existing high-level `goal/spec.md` only if needed to reference this dedicated spec.

---

## 20. File-by-File Change Map

Expected new files:

```txt
CODEX_SPEC_worldstudio_editor_parity.md
src/pages/editor/EditorCreateRedirectPage.tsx
src/pages/editor/WorldStudioEditorPage.tsx
src/components/editor/EditorShell.tsx
src/components/editor/EditorTopBar.tsx
src/components/editor/EditorMediaBin.tsx
src/components/editor/EditorTimeline.tsx
src/components/editor/EditorTimelineTrack.tsx
src/components/editor/EditorTimelineClip.tsx
src/components/editor/EditorPreviewCanvas.tsx
src/components/editor/EditorTransport.tsx
src/components/editor/EditorInspector.tsx
src/components/editor/EditorLayersPanel.tsx
src/components/editor/EditorRenderPanel.tsx
src/components/editor/EditorShortcutHelp.tsx
src/lib/editor/api.ts
src/lib/editor/schema.ts
src/lib/editor/migrations.ts
src/lib/editor/store.ts
src/lib/editor/commands.ts
src/lib/editor/selectors.ts
src/lib/editor/timelineMath.ts
src/lib/editor/importers.ts
src/lib/editor/renderPayload.ts
src/lib/editor/shortcuts.ts
src/lib/editor/ids.ts
supabase/functions/video-editor-project/index.ts
supabase/functions/video-editor-asset/index.ts
supabase/functions/video-editor-render/index.ts
supabase/functions/_shared/editor/schema.ts
supabase/functions/_shared/editor/render-plan.ts
supabase/migrations/<timestamp>_worldstudio_editor_parity.sql
tests/editor-timeline.test.ts
tests/editor-commands.test.ts
tests/editor-importers.test.ts
tests/editor-render-plan.test.ts
tests-e2e/editor.spec.ts
```

Expected modified files:

```txt
src/main.tsx
src/lib/routes.ts
src/pages/lyrics/LyricsHome.tsx
src/pages/lyrics/LyricsWizard.tsx
src/pages/lyrics/RemixEditor.tsx
src/pages/library/LibraryDetail.tsx
src/components/library/LibraryTile.tsx
src/components/library/LibraryGrid.tsx
src/components/studio/StudioPostReview.tsx
README.md
package.json only if a small dependency is justified
```

Dependency rule:

- Prefer no new dependencies for MVP.
- If adding state helpers, justify why React reducer is insufficient.
- If adding Immer/Zustand, keep API isolated in `src/lib/editor/store.ts`.

---

## 21. Acceptance Criteria

The feature is complete when all are true:

1. `/editor/new` creates a blank project and redirects to `/editor/:projectId`.
2. A saved lyric template can be opened in editor with audio, lyrics, and cut markers imported.
3. A library item can be opened in editor with final video imported as a timeline clip.
4. Project snapshot persists to Supabase and reloads correctly.
5. Timeline supports select, move, trim, split, delete.
6. Undo/redo works for timeline operations.
7. Preview canvas shows active clips and lyrics/text at playhead.
8. Inspector edits text/lyrics style and transform.
9. Keyboard shortcuts cover play/pause, undo/redo, save, delete, split, zoom, export.
10. Autosave state is visible and non-blocking.
11. Render panel can create a mock render job and show status.
12. Successful render registers an output asset and can be added to the library or at minimum exposes the output asset id/url.
13. Existing Autopilot, lyrics wizard, library, calendar, and scheduling tests still pass.
14. New editor unit tests and E2E smoke pass.
15. All new tables have RLS and indexes.
16. No service-role secret is exposed to frontend.
17. No long-running CPU rendering occurs inside Edge Functions.

---

## 22. Quality Bar

Architectural quality expectations:

- One canonical snapshot schema.
- Pure command/reducer logic testable without DOM.
- Edge Functions own validation and persistence.
- UI state and server state are separated.
- Render/export consumes the same schema as preview.
- Backwards compatibility with existing FanAgent v2 flows.
- Clear provenance for every imported and exported media asset.
- Fast failure with actionable envelope error codes.
- Small, reviewable implementation slices.

Error codes to use where relevant:

- `EDITOR_PROJECT_NOT_FOUND`
- `EDITOR_INVALID_ACTION`
- `EDITOR_INVALID_SNAPSHOT`
- `EDITOR_SNAPSHOT_TOO_LARGE`
- `EDITOR_REVISION_CONFLICT`
- `EDITOR_ASSET_NOT_FOUND`
- `EDITOR_ASSET_UNSUPPORTED`
- `EDITOR_RENDER_JOB_NOT_FOUND`
- `EDITOR_RENDER_PROVIDER_UNAVAILABLE`
- `EDITOR_RENDER_UNSUPPORTED_COMPOSITION`
- `EDITOR_RENDER_CALLBACK_UNAUTHORIZED`

---

## 23. Codex Prompt Handoff

Use this exact framing when delegating implementation:

"Implement `CODEX_SPEC_worldstudio_editor_parity.md` in `/root/fanagent`. Start with Phase 1 schema/API foundation and pure editor utilities. Preserve existing FanAgent v2 behavior. Do not remove existing routes. Add tests for each phase. Use the existing envelope pattern for Edge Functions. Supabase Edge Functions may orchestrate render jobs but must not perform long-running CPU rendering. Commit in small slices. After each phase, run targeted tests and then full `npm test` if feasible."

---

## 24. Final Notes

This spec intentionally treats WorldStudio parity as a durable project/composition system, not a one-off enhancement to `RemixEditor`. The existing FanAgent primitives are valuable and should remain intact. The editor becomes the creative workspace that can ingest those primitives, let users refine them visually, and output back into the same library/calendar/publish pipeline.

