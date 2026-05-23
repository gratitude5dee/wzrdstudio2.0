-- Shadow evaluation + project observability foundation for Project Setup -> Timeline/Storyboard.
-- Additive only: no destructive drops of user data or dependency-changing behavior.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and p.user_id = (select auth.uid())
  );
$$;

grant execute on function public.can_access_project(uuid) to authenticated;
grant execute on function public.can_access_project(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- project_settings rollout controls
-- ---------------------------------------------------------------------------

alter table if exists public.project_settings
  add column if not exists evaluation_mode text,
  add column if not exists evaluation_thresholds jsonb,
  add column if not exists canon_facts jsonb,
  add column if not exists creative_constraints jsonb;

update public.project_settings
set evaluation_mode = coalesce(nullif(evaluation_mode, ''), 'shadow')
where evaluation_mode is null or evaluation_mode = '';

update public.project_settings
set evaluation_thresholds = jsonb_build_object(
  'storyline', 0.72,
  'continuity', 0.80,
  'character_consistency', 0.82,
  'canon_compliance', 0.85,
  'max_disagreement', 0.20
)
where evaluation_thresholds is null or evaluation_thresholds = '{}'::jsonb;

update public.project_settings
set canon_facts = '[]'::jsonb
where canon_facts is null;

update public.project_settings
set creative_constraints = '[]'::jsonb
where creative_constraints is null;

alter table if exists public.project_settings
  alter column evaluation_mode set default 'shadow',
  alter column evaluation_thresholds set default '{}'::jsonb,
  alter column canon_facts set default '[]'::jsonb,
  alter column creative_constraints set default '[]'::jsonb,
  alter column evaluation_mode set not null,
  alter column evaluation_thresholds set not null,
  alter column canon_facts set not null,
  alter column creative_constraints set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.project_settings'::regclass
      and conname = 'project_settings_evaluation_mode_check'
  ) then
    alter table public.project_settings
      add constraint project_settings_evaluation_mode_check
      check (evaluation_mode in ('off', 'shadow', 'soft_gate', 'hard_gate'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Existing entity extensions
-- ---------------------------------------------------------------------------

alter table if exists public.characters
  add column if not exists identity_profile jsonb default '{}'::jsonb,
  add column if not exists anchor_asset_ids uuid[] default '{}'::uuid[],
  add column if not exists consistency_summary jsonb default '{}'::jsonb;

alter table if exists public.scenes
  add column if not exists story_goal text,
  add column if not exists evaluation_summary jsonb default '{}'::jsonb,
  add column if not exists review_status text default 'not_reviewed';

alter table if exists public.shots
  add column if not exists shot_packet jsonb default '{}'::jsonb,
  add column if not exists evaluation_summary jsonb default '{}'::jsonb,
  add column if not exists review_status text default 'not_reviewed',
  add column if not exists image_asset_id uuid references public.project_assets(id) on delete set null,
  add column if not exists video_asset_id uuid references public.project_assets(id) on delete set null;

alter table if exists public.storylines
  add column if not exists evaluation_summary jsonb default '{}'::jsonb,
  add column if not exists review_status text default 'not_reviewed';

alter table if exists public.characters
  alter column identity_profile set default '{}'::jsonb,
  alter column anchor_asset_ids set default '{}'::uuid[],
  alter column consistency_summary set default '{}'::jsonb;

alter table if exists public.scenes
  alter column evaluation_summary set default '{}'::jsonb,
  alter column review_status set default 'not_reviewed';

alter table if exists public.shots
  alter column shot_packet set default '{}'::jsonb,
  alter column evaluation_summary set default '{}'::jsonb,
  alter column review_status set default 'not_reviewed';

alter table if exists public.storylines
  alter column evaluation_summary set default '{}'::jsonb,
  alter column review_status set default 'not_reviewed';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scenes'::regclass
      and conname = 'scenes_review_status_check'
  ) then
    alter table public.scenes
      add constraint scenes_review_status_check
      check (review_status in ('not_reviewed', 'clear', 'needs_review', 'needs_revision'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shots'::regclass
      and conname = 'shots_review_status_check'
  ) then
    alter table public.shots
      add constraint shots_review_status_check
      check (review_status in ('not_reviewed', 'clear', 'needs_review', 'needs_revision'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.storylines'::regclass
      and conname = 'storylines_review_status_check'
  ) then
    alter table public.storylines
      add constraint storylines_review_status_check
      check (review_status in ('not_reviewed', 'clear', 'needs_review', 'needs_revision'));
  end if;
end $$;

create index if not exists idx_characters_project_id_created_at on public.characters(project_id, created_at);
create index if not exists idx_scenes_project_review_status on public.scenes(project_id, review_status);
create index if not exists idx_storylines_project_review_status on public.storylines(project_id, review_status);
create index if not exists idx_shots_scene_review_status on public.shots(scene_id, review_status);
create index if not exists idx_shots_project_review_status on public.shots(project_id, review_status);
create index if not exists idx_shots_image_asset_id on public.shots(image_asset_id) where image_asset_id is not null;
create index if not exists idx_shots_video_asset_id on public.shots(video_asset_id) where video_asset_id is not null;
create index if not exists idx_shots_needs_attention on public.shots(project_id, scene_id)
  where review_status in ('needs_review', 'needs_revision');
create index if not exists idx_scenes_needs_attention on public.scenes(project_id, scene_number)
  where review_status in ('needs_review', 'needs_revision');

-- ---------------------------------------------------------------------------
-- New production graph tables
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage text not null,
  author_type text not null,
  parent_prompt_id uuid references public.prompt_versions(id) on delete set null,
  source_entity_type text,
  source_entity_id uuid,
  text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prompt_versions_stage_check check (
    stage in ('concept', 'storyline_title', 'storyline_narrative', 'storyline_structure', 'scene', 'shot_prompt', 'shot_image', 'shot_video', 'revision')
  ),
  constraint prompt_versions_author_type_check check (
    author_type in ('user', 'system', 'optimizer', 'revision_planner')
  ),
  constraint prompt_versions_source_entity_type_check check (
    source_entity_type is null or source_entity_type in ('project', 'storyline', 'scene', 'shot', 'character', 'generation_job')
  )
);

create table if not exists public.asset_lineage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prompt_version_id uuid references public.prompt_versions(id) on delete set null,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  source_asset_id uuid references public.project_assets(id) on delete set null,
  output_asset_id uuid references public.project_assets(id) on delete set null,
  scene_id uuid references public.scenes(id) on delete set null,
  shot_id uuid references public.shots(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  relation_type text not null default 'derived',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_lineage_relation_type_check check (
    relation_type in ('input', 'output', 'reference', 'derived')
  )
);

create table if not exists public.evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  target_type text,
  target_id uuid,
  mode text default 'shadow',
  rubric_version text,
  rubric_snapshot jsonb default '{}'::jsonb,
  reliability_snapshot jsonb default '{}'::jsonb,
  status text default 'queued',
  disagreement jsonb default '{}'::jsonb,
  aggregates jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint evaluation_runs_target_type_check check (
    target_type is null or target_type in ('project', 'storyline', 'scene', 'shot', 'character')
  ),
  constraint evaluation_runs_mode_check check (
    mode is null or mode in ('off', 'shadow', 'soft_gate', 'hard_gate')
  ),
  constraint evaluation_runs_status_check check (
    status is null or status in ('queued', 'running', 'completed', 'failed')
  )
);

create table if not exists public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.evaluation_runs(id) on delete cascade,
  judge_type text,
  judge_model text,
  judge_model_version text,
  score double precision,
  confidence double precision,
  likert_label text,
  failure_tags text[] default array[]::text[],
  reasons jsonb default '[]'::jsonb,
  evidence jsonb default '{}'::jsonb,
  criteria_breakdown jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint evaluation_results_judge_type_check check (
    judge_type is null or judge_type in (
      'prompt_adherence',
      'visual_quality',
      'character_consistency',
      'continuity',
      'storyline',
      'canon_compliance'
    )
  )
);

create table if not exists public.review_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  source_run_id uuid references public.evaluation_runs(id) on delete set null,
  status text not null default 'open',
  priority integer not null default 0,
  mode text not null default 'approve_reject',
  blocking boolean not null default false,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint review_tasks_status_check check (
    status in ('open', 'in_review', 'resolved', 'dismissed')
  ),
  constraint review_tasks_target_type_check check (
    target_type in ('storyline', 'scene', 'shot', 'character')
  ),
  constraint review_tasks_mode_check check (
    mode in ('pairwise', 'approve_reject', 'rank', 'annotate')
  )
);

create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  review_task_id uuid references public.review_tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  feedback_type text not null,
  chosen_asset_id uuid references public.project_assets(id) on delete set null,
  rejection_reason_codes text[] not null default array[]::text[],
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint review_events_target_type_check check (
    target_type in ('storyline', 'scene', 'shot', 'character')
  ),
  constraint review_events_feedback_type_check check (
    feedback_type in ('pairwise_pick', 'approve', 'reject', 'annotate', 'rank')
  )
);

create table if not exists public.revision_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  source_run_id uuid references public.evaluation_runs(id) on delete set null,
  trigger jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revision_plans_target_type_check check (
    target_type in ('storyline', 'scene', 'shot', 'character')
  ),
  constraint revision_plans_status_check check (
    status in ('proposed', 'approved', 'executed', 'dismissed')
  )
);

create table if not exists public.narrative_atoms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storyline_id uuid references public.storylines(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  beat_type text not null,
  description text not null,
  required_visual_evidence jsonb not null default '[]'::jsonb,
  required_story_evidence jsonb not null default '[]'::jsonb,
  is_blocking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint narrative_atoms_beat_type_check check (
    beat_type in ('goal', 'conflict', 'decision', 'reveal', 'transition')
  )
);

create table if not exists public.story_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storyline_id uuid references public.storylines(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  description text not null,
  participants text[] not null default array[]::text[],
  causes text[] not null default array[]::text[],
  consequences text[] not null default array[]::text[],
  emotional_state jsonb not null default '{}'::jsonb,
  evidence_asset_ids uuid[] not null default '{}'::uuid[],
  timestamp_range jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Canonicalize evaluation tables if they already exist remotely with older columns.
alter table if exists public.evaluation_runs
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists target_type text,
  add column if not exists target_id uuid,
  add column if not exists mode text default 'shadow',
  add column if not exists rubric_version text,
  add column if not exists rubric_snapshot jsonb default '{}'::jsonb,
  add column if not exists reliability_snapshot jsonb default '{}'::jsonb,
  add column if not exists disagreement jsonb default '{}'::jsonb,
  add column if not exists aggregates jsonb default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table if exists public.evaluation_results
  add column if not exists judge_type text,
  add column if not exists judge_model text,
  add column if not exists judge_model_version text,
  add column if not exists score double precision,
  add column if not exists confidence double precision,
  add column if not exists likert_label text,
  add column if not exists failure_tags text[] default array[]::text[],
  add column if not exists reasons jsonb default '[]'::jsonb,
  add column if not exists evidence jsonb default '{}'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'evaluation_runs'
      and column_name = 'user_id'
  ) then
    execute $sql$
      update public.evaluation_runs
      set mode = coalesce(nullif(mode, ''), 'shadow'),
          rubric_snapshot = coalesce(rubric_snapshot, '{}'::jsonb),
          reliability_snapshot = coalesce(reliability_snapshot, '{}'::jsonb),
          disagreement = coalesce(disagreement, '{}'::jsonb),
          aggregates = coalesce(aggregates, '{}'::jsonb),
          created_by = coalesce(created_by, user_id)
      where mode is null
         or rubric_snapshot is null
         or reliability_snapshot is null
         or disagreement is null
         or aggregates is null
         or created_by is null
    $sql$;
  else
    update public.evaluation_runs
    set mode = coalesce(nullif(mode, ''), 'shadow'),
        rubric_snapshot = coalesce(rubric_snapshot, '{}'::jsonb),
        reliability_snapshot = coalesce(reliability_snapshot, '{}'::jsonb),
        disagreement = coalesce(disagreement, '{}'::jsonb),
        aggregates = coalesce(aggregates, '{}'::jsonb)
    where mode is null
       or rubric_snapshot is null
       or reliability_snapshot is null
       or disagreement is null
       or aggregates is null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'evaluation_results'
      and column_name = 'judge_score'
  ) then
    execute $sql$
      update public.evaluation_results
      set score = coalesce(score, judge_score),
          reasons = coalesce(reasons, '[]'::jsonb),
          evidence = coalesce(evidence, detailed_reasoning, '{}'::jsonb),
          criteria_breakdown = coalesce(criteria_breakdown, '{}'::jsonb),
          failure_tags = coalesce(failure_tags, array[]::text[])
      where score is null
         or reasons is null
         or evidence is null
         or criteria_breakdown is null
         or failure_tags is null
    $sql$;
  else
    update public.evaluation_results
    set reasons = coalesce(reasons, '[]'::jsonb),
        evidence = coalesce(evidence, '{}'::jsonb),
        criteria_breakdown = coalesce(criteria_breakdown, '{}'::jsonb),
        failure_tags = coalesce(failure_tags, array[]::text[])
    where reasons is null
       or evidence is null
       or criteria_breakdown is null
       or failure_tags is null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_prompt_versions_project_stage on public.prompt_versions(project_id, stage, created_at desc);
create index if not exists idx_prompt_versions_source on public.prompt_versions(source_entity_type, source_entity_id);
create index if not exists idx_prompt_versions_parent on public.prompt_versions(parent_prompt_id) where parent_prompt_id is not null;

create index if not exists idx_asset_lineage_project_id on public.asset_lineage(project_id, created_at desc);
create index if not exists idx_asset_lineage_generation_job_id on public.asset_lineage(generation_job_id) where generation_job_id is not null;
create index if not exists idx_asset_lineage_output_asset_id on public.asset_lineage(output_asset_id) where output_asset_id is not null;
create index if not exists idx_asset_lineage_shot_id on public.asset_lineage(shot_id) where shot_id is not null;
create index if not exists idx_asset_lineage_scene_id on public.asset_lineage(scene_id) where scene_id is not null;

create index if not exists idx_evaluation_runs_project_status on public.evaluation_runs(project_id, status, created_at desc);
create index if not exists idx_evaluation_runs_target on public.evaluation_runs(target_type, target_id, created_at desc);
create index if not exists idx_evaluation_runs_non_terminal on public.evaluation_runs(project_id, created_at desc)
  where status in ('queued', 'running');

create index if not exists idx_evaluation_results_run_id on public.evaluation_results(run_id);
create index if not exists idx_evaluation_results_judge_type on public.evaluation_results(judge_type);

create index if not exists idx_review_tasks_project_status on public.review_tasks(project_id, status, created_at desc);
create index if not exists idx_review_tasks_target on public.review_tasks(target_type, target_id);
create index if not exists idx_review_tasks_open on public.review_tasks(project_id, priority desc, created_at desc)
  where status in ('open', 'in_review');

create index if not exists idx_review_events_project_created_at on public.review_events(project_id, created_at desc);
create index if not exists idx_review_events_task_id on public.review_events(review_task_id) where review_task_id is not null;

create index if not exists idx_revision_plans_project_status on public.revision_plans(project_id, status, created_at desc);
create index if not exists idx_revision_plans_target on public.revision_plans(target_type, target_id);

create index if not exists idx_narrative_atoms_project_scene on public.narrative_atoms(project_id, scene_id, created_at);
create index if not exists idx_narrative_atoms_storyline on public.narrative_atoms(storyline_id) where storyline_id is not null;

create index if not exists idx_story_events_project_scene on public.story_events(project_id, scene_id, created_at);
create index if not exists idx_story_events_storyline on public.story_events(storyline_id) where storyline_id is not null;

create index if not exists idx_generation_jobs_project_job_type on public.generation_jobs(project_id, job_type, created_at desc);
create index if not exists idx_generation_jobs_evaluation_status on public.generation_jobs(project_id, status, created_at desc)
  where job_type in ('evaluation', 'revision');

-- ---------------------------------------------------------------------------
-- generation_jobs support for evaluation/revision
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.generation_jobs'::regclass
      and conname = 'generation_jobs_job_type_check'
  ) then
    alter table public.generation_jobs
      drop constraint generation_jobs_job_type_check;
  end if;

  alter table public.generation_jobs
    add constraint generation_jobs_job_type_check
    check (job_type in ('image', 'video', 'stitch', 'process', 'evaluation', 'revision'));
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

do $$
declare
  direct_project_tables text[] := array[
    'prompt_versions',
    'asset_lineage',
    'evaluation_runs',
    'review_tasks',
    'review_events',
    'revision_plans',
    'narrative_atoms',
    'story_events'
  ];
  table_name text;
  policy_name text;
begin
  foreach table_name in array direct_project_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    policy_name := table_name || '_owner_access';
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using ((select public.can_access_project(project_id))) with check ((select public.can_access_project(project_id)))',
        policy_name,
        table_name
      );
    end if;
  end loop;
end $$;

alter table if exists public.evaluation_results enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'evaluation_results'
      and policyname = 'evaluation_results_owner_access'
  ) then
    create policy evaluation_results_owner_access
      on public.evaluation_results
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.evaluation_runs er
          where er.id = run_id
            and (select public.can_access_project(er.project_id))
        )
      )
      with check (
        exists (
          select 1
          from public.evaluation_runs er
          where er.id = run_id
            and (select public.can_access_project(er.project_id))
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists prompt_versions_updated_at on public.prompt_versions;
create trigger prompt_versions_updated_at
before update on public.prompt_versions
for each row
execute function public.update_updated_at_column();

drop trigger if exists asset_lineage_updated_at on public.asset_lineage;
create trigger asset_lineage_updated_at
before update on public.asset_lineage
for each row
execute function public.update_updated_at_column();

drop trigger if exists evaluation_runs_updated_at on public.evaluation_runs;
create trigger evaluation_runs_updated_at
before update on public.evaluation_runs
for each row
execute function public.update_updated_at_column();

drop trigger if exists review_tasks_updated_at on public.review_tasks;
create trigger review_tasks_updated_at
before update on public.review_tasks
for each row
execute function public.update_updated_at_column();

drop trigger if exists revision_plans_updated_at on public.revision_plans;
create trigger revision_plans_updated_at
before update on public.revision_plans
for each row
execute function public.update_updated_at_column();

drop trigger if exists narrative_atoms_updated_at on public.narrative_atoms;
create trigger narrative_atoms_updated_at
before update on public.narrative_atoms
for each row
execute function public.update_updated_at_column();

drop trigger if exists story_events_updated_at on public.story_events;
create trigger story_events_updated_at
before update on public.story_events
for each row
execute function public.update_updated_at_column();
