alter table public.ai_model_catalog
  add column if not exists studio_surfaces text[] not null default '{}'::text[],
  add column if not exists kanvas_modes text[] not null default '{}'::text[],
  add column if not exists pricing jsonb not null default '{}'::jsonb,
  add column if not exists raw_source_block text not null default '',
  add column if not exists is_default boolean not null default false,
  add column if not exists default_rank integer not null default 1000;

alter table public.ai_model_catalog
  drop constraint if exists ai_model_catalog_transport_type_check;

alter table public.ai_model_catalog
  add constraint ai_model_catalog_transport_type_check
  check (transport_type in ('chat_completion', 'request_queue', 'fal_queue', 'edge_function'));

alter table public.ai_model_catalog
  drop constraint if exists ai_model_catalog_endpoint_id_key;

create index if not exists ai_model_catalog_surfaces_gin_idx
  on public.ai_model_catalog using gin (studio_surfaces);

create index if not exists ai_model_catalog_kanvas_modes_gin_idx
  on public.ai_model_catalog using gin (kanvas_modes);

create index if not exists ai_model_catalog_defaults_idx
  on public.ai_model_catalog (enabled, is_default desc, default_rank, sort_rank);

create index if not exists ai_model_catalog_endpoint_idx
  on public.ai_model_catalog (endpoint_id);
