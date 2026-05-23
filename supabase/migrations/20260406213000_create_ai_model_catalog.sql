create table if not exists public.ai_model_catalog (
  id text primary key,
  endpoint_id text not null unique,
  provider text not null default 'gmi-cloud',
  provider_label text not null,
  name text not null,
  description text not null,
  category text not null,
  pricing_text text not null,
  transport_type text not null check (transport_type in ('chat_completion', 'request_queue')),
  media_type text not null check (media_type in ('text', 'image', 'video', 'audio')),
  workflow_type text not null,
  ui_group text not null check (ui_group in ('generation', 'advanced')),
  supports text[] not null default '{}'::text[],
  payload_keys text[] not null default '{}'::text[],
  requires_assets text[] not null default '{}'::text[],
  defaults jsonb not null default '{}'::jsonb,
  controls jsonb not null default '[]'::jsonb,
  aliases text[] not null default '{}'::text[],
  enabled boolean not null default true,
  credits integer not null default 0,
  time_label text not null default '~10s',
  sort_rank integer not null default 1000,
  raw_api_example text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_model_catalog_enabled_idx
  on public.ai_model_catalog (enabled, media_type, ui_group, sort_rank);

create index if not exists ai_model_catalog_provider_idx
  on public.ai_model_catalog (provider, provider_label);

create index if not exists ai_model_catalog_workflow_idx
  on public.ai_model_catalog (workflow_type, media_type);

create index if not exists ai_model_catalog_aliases_gin_idx
  on public.ai_model_catalog using gin (aliases);

create index if not exists ai_model_catalog_supports_gin_idx
  on public.ai_model_catalog using gin (supports);

create index if not exists ai_model_catalog_payload_keys_gin_idx
  on public.ai_model_catalog using gin (payload_keys);

alter table public.ai_model_catalog enable row level security;

drop policy if exists "Authenticated users can read ai model catalog" on public.ai_model_catalog;
create policy "Authenticated users can read ai model catalog"
  on public.ai_model_catalog
  for select
  to authenticated
  using (true);

drop trigger if exists set_ai_model_catalog_updated_at on public.ai_model_catalog;
create trigger set_ai_model_catalog_updated_at
before update on public.ai_model_catalog
for each row
execute function public.update_updated_at_column();
