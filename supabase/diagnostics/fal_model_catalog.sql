-- Fal model catalog visibility checks.
-- Run in Supabase SQL editor after applying migrations.

select
  provider,
  media_type,
  ui_group,
  count(*) as model_count
from public.ai_model_catalog
where provider = 'fal-ai'
group by provider, media_type, ui_group
order by media_type, ui_group;

select
  count(*) as fal_rows_missing_studio_surface
from public.ai_model_catalog
where provider = 'fal-ai'
  and not exists (
    select 1
    from unnest(studio_surfaces) as surface
    where surface like 'studio:%'
  );

select
  id,
  media_type,
  ui_group,
  is_default,
  default_rank,
  studio_surfaces
from public.ai_model_catalog
where id in (
  'fal-ai/nano-banana-2',
  'fal-ai/nano-banana-2/edit',
  'fal-ai/kling-video/o3/standard/text-to-video',
  'fal-ai/kling-video/o3/standard/image-to-video',
  'fal-ai/elevenlabs/tts/turbo-v2.5',
  'fal-ai/trellis/multi',
  'openai/gpt-image-2',
  'openai/gpt-image-2/edit'
)
order by default_rank;
