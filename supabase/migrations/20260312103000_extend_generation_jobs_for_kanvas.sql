alter table public.generation_jobs
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists external_request_id text,
  add column if not exists model_id text,
  add column if not exists studio text check (studio in ('image', 'video', 'cinema', 'lipsync')),
  add column if not exists input_assets jsonb not null default '[]'::jsonb,
  add column if not exists result_payload jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.generation_jobs
set updated_at = created_at
where updated_at is null;

create index if not exists idx_generation_jobs_external_request_id
  on public.generation_jobs(external_request_id);

create index if not exists idx_generation_jobs_model_id
  on public.generation_jobs(model_id);

create index if not exists idx_generation_jobs_studio
  on public.generation_jobs(studio);

create or replace function public.update_generation_jobs_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_generation_jobs_updated_at on public.generation_jobs;

create trigger update_generation_jobs_updated_at
before update on public.generation_jobs
for each row
execute function public.update_generation_jobs_timestamp();
