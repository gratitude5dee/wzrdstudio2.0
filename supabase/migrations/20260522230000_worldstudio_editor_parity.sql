begin;

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

create table if not exists public.video_editor_project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_editor_projects(id) on delete cascade,
  client_id text not null,
  event_type text not null,
  operation jsonb not null,
  revision_base int,
  created_at timestamptz not null default now()
);

create index if not exists idx_video_editor_projects_account_updated
  on public.video_editor_projects(account_id, updated_at desc);
create index if not exists idx_video_editor_projects_source
  on public.video_editor_projects(source_type, source_id);
create index if not exists idx_video_editor_revisions_project_created
  on public.video_editor_revisions(project_id, created_at desc);
create index if not exists idx_video_editor_assets_project
  on public.video_editor_assets(project_id, created_at desc);
create index if not exists idx_video_editor_render_jobs_project_created
  on public.video_editor_render_jobs(project_id, created_at desc);
create index if not exists idx_video_editor_render_jobs_status
  on public.video_editor_render_jobs(status, created_at);
create index if not exists idx_video_editor_project_events_project_created
  on public.video_editor_project_events(project_id, created_at desc);

do $$ begin
  alter table public.video_editor_projects
    add constraint video_editor_projects_current_revision_fk
    foreign key (current_revision_id) references public.video_editor_revisions(id) on delete set null;
exception when duplicate_object then null;
end $$;

alter table public.video_editor_projects enable row level security;
alter table public.video_editor_revisions enable row level security;
alter table public.video_editor_assets enable row level security;
alter table public.video_editor_render_jobs enable row level security;
alter table public.video_editor_project_events enable row level security;

do $$ begin
  create policy "video_editor_projects_read" on public.video_editor_projects
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "video_editor_revisions_read" on public.video_editor_revisions
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "video_editor_assets_read" on public.video_editor_assets
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "video_editor_render_jobs_read" on public.video_editor_render_jobs
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "video_editor_project_events_read" on public.video_editor_project_events
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

alter table public.video_editor_projects replica identity full;
alter table public.video_editor_render_jobs replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.video_editor_projects;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.video_editor_render_jobs;
exception when duplicate_object then null; end $$;

commit;

