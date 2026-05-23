alter table if exists public.ai_model_catalog
  add column if not exists studio_surfaces text[] not null default '{}'::text[],
  add column if not exists kanvas_modes text[] not null default '{}'::text[],
  add column if not exists pricing jsonb not null default '{}'::jsonb,
  add column if not exists raw_source_block text not null default '',
  add column if not exists is_default boolean not null default false,
  add column if not exists default_rank integer not null default 1000,
  add column if not exists model_url text,
  add column if not exists license text,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists published_at date,
  add column if not exists model_updated_at date,
  add column if not exists vendor text,
  add column if not exists family text,
  add column if not exists tier text;

alter table if exists public.ai_model_catalog
  drop constraint if exists ai_model_catalog_media_type_check;

alter table if exists public.ai_model_catalog
  add constraint ai_model_catalog_media_type_check check (
    media_type = any (array['text'::text, 'image'::text, 'video'::text, 'audio'::text, 'json'::text, '3d'::text])
  );

alter table if exists public.ai_model_catalog
  drop constraint if exists ai_model_catalog_transport_type_check;

alter table if exists public.ai_model_catalog
  add constraint ai_model_catalog_transport_type_check check (
    transport_type = any (array[
      'chat_completion'::text,
      'request_queue'::text,
      'fal_queue'::text,
      'edge_function'::text,
      'direct_http'::text
    ])
  );

create index if not exists ai_model_catalog_surfaces_gin_idx
  on public.ai_model_catalog using gin (studio_surfaces);

create index if not exists ai_model_catalog_provider_media_surface_idx
  on public.ai_model_catalog (provider, media_type, ui_group, enabled, is_default desc, default_rank, sort_rank);

with fal_defaults as (
  select *
  from jsonb_to_recordset($fal_defaults$[
    {"id":"fal-ai/nano-banana-2","endpoint_id":"fal-ai/nano-banana-2","provider":"fal-ai","provider_label":"fal.ai","name":"Nano Banana 2","description":"Fast Fal image generation.","category":"text-to-image","pricing_text":"$0.08 / images USD (partner)","pricing":{},"model_url":"https://fal.run/fal-ai/nano-banana-2","license":"commercial","tags":["image","generation"],"published_at":null,"model_updated_at":null,"vendor":"Google","family":"Nano Banana","tier":"standard","transport_type":"fal_queue","media_type":"image","workflow_type":"text-to-image","ui_group":"generation","supports":["prompt","num_images","image"],"payload_keys":["prompt","num_images"],"requires_assets":[],"defaults":{"num_images":1},"controls":[],"aliases":["fal-ai/nano-banana-2","nano banana 2"],"enabled":true,"credits":8,"time_label":"~10s","sort_rank":10,"studio_surfaces":["studio:image"],"kanvas_modes":[],"raw_api_example":"","raw_payload":{},"raw_source_block":"","is_default":true,"default_rank":10},
    {"id":"fal-ai/nano-banana-2/edit","endpoint_id":"fal-ai/nano-banana-2/edit","provider":"fal-ai","provider_label":"fal.ai","name":"Nano Banana 2 Edit","description":"Fast Fal image editing.","category":"image-to-image","pricing_text":"$0.08 / images USD (partner)","pricing":{},"model_url":"https://fal.run/fal-ai/nano-banana-2/edit","license":"commercial","tags":["image","edit"],"published_at":null,"model_updated_at":null,"vendor":"Google","family":"Nano Banana","tier":"standard","transport_type":"fal_queue","media_type":"image","workflow_type":"image-to-image","ui_group":"advanced","supports":["prompt","image_urls","image"],"payload_keys":["prompt","image_urls"],"requires_assets":["image"],"defaults":{},"controls":[],"aliases":["fal-ai/nano-banana-2/edit","nano banana edit"],"enabled":true,"credits":8,"time_label":"~10s","sort_rank":20,"studio_surfaces":["studio:image"],"kanvas_modes":[],"raw_api_example":"","raw_payload":{},"raw_source_block":"","is_default":true,"default_rank":20},
    {"id":"fal-ai/kling-video/o3/standard/text-to-video","endpoint_id":"fal-ai/kling-video/o3/standard/text-to-video","provider":"fal-ai","provider_label":"fal.ai","name":"Kling O3 Text to Video Standard","description":"Balanced Fal text-to-video generation.","category":"text-to-video","pricing_text":"$0.14 / seconds USD (partner)","pricing":{},"model_url":"https://fal.run/fal-ai/kling-video/o3/standard/text-to-video","license":"commercial","tags":["video","generation"],"published_at":null,"model_updated_at":null,"vendor":"Kling","family":"Kling Video","tier":"standard","transport_type":"fal_queue","media_type":"video","workflow_type":"text-to-video","ui_group":"generation","supports":["prompt","video"],"payload_keys":["prompt"],"requires_assets":[],"defaults":{},"controls":[],"aliases":["fal-ai/kling-video/o3/standard/text-to-video","kling o3 text to video"],"enabled":true,"credits":15,"time_label":"~60s","sort_rank":30,"studio_surfaces":["studio:video"],"kanvas_modes":[],"raw_api_example":"","raw_payload":{},"raw_source_block":"","is_default":true,"default_rank":30},
    {"id":"fal-ai/kling-video/o3/standard/image-to-video","endpoint_id":"fal-ai/kling-video/o3/standard/image-to-video","provider":"fal-ai","provider_label":"fal.ai","name":"Kling O3 Image to Video Standard","description":"Fal image-to-video generation.","category":"image-to-video","pricing_text":"$0.14 / seconds USD (partner)","pricing":{},"model_url":"https://fal.run/fal-ai/kling-video/o3/standard/image-to-video","license":"commercial","tags":["video","image-to-video"],"published_at":null,"model_updated_at":null,"vendor":"Kling","family":"Kling Video","tier":"standard","transport_type":"fal_queue","media_type":"video","workflow_type":"image-to-video","ui_group":"generation","supports":["prompt","image_url","video"],"payload_keys":["prompt","image_url"],"requires_assets":["image"],"defaults":{},"controls":[],"aliases":["fal-ai/kling-video/o3/standard/image-to-video","kling o3 image to video"],"enabled":true,"credits":15,"time_label":"~60s","sort_rank":40,"studio_surfaces":["studio:video"],"kanvas_modes":[],"raw_api_example":"","raw_payload":{},"raw_source_block":"","is_default":true,"default_rank":40},
    {"id":"fal-ai/elevenlabs/tts/turbo-v2.5","endpoint_id":"fal-ai/elevenlabs/tts/turbo-v2.5","provider":"fal-ai","provider_label":"fal.ai","name":"ElevenLabs TTS Turbo v2.5","description":"Fal-hosted ElevenLabs text-to-speech.","category":"text-to-speech","pricing_text":"$0.05 / 1000 characters USD (partner)","pricing":{},"model_url":"https://fal.run/fal-ai/elevenlabs/tts/turbo-v2.5","license":"commercial","tags":["audio","tts"],"published_at":null,"model_updated_at":null,"vendor":"ElevenLabs","family":"ElevenLabs","tier":"fast","transport_type":"fal_queue","media_type":"audio","workflow_type":"text-to-speech","ui_group":"generation","supports":["text","voice","prompt","audio"],"payload_keys":["text","voice"],"requires_assets":[],"defaults":{},"controls":[],"aliases":["fal-ai/elevenlabs/tts/turbo-v2.5","elevenlabs tts turbo"],"enabled":true,"credits":5,"time_label":"~10s","sort_rank":50,"studio_surfaces":["studio:audio"],"kanvas_modes":[],"raw_api_example":"","raw_payload":{},"raw_source_block":"","is_default":true,"default_rank":50},
    {"id":"fal-ai/trellis/multi","endpoint_id":"fal-ai/trellis/multi","provider":"fal-ai","provider_label":"fal.ai","name":"Trellis","description":"Fal image-to-3D generation.","category":"image-to-3d","pricing_text":"$0.02 / unit USD (fal)","pricing":{},"model_url":"https://fal.run/fal-ai/trellis/multi","license":"commercial","tags":["3d","image-to-3d"],"published_at":null,"model_updated_at":null,"vendor":"Fal","family":"Trellis","tier":"standard","transport_type":"fal_queue","media_type":"3d","workflow_type":"image-to-3d","ui_group":"generation","supports":["image_url","3d"],"payload_keys":["image_url"],"requires_assets":["image"],"defaults":{},"controls":[],"aliases":["fal-ai/trellis/multi","trellis"],"enabled":true,"credits":2,"time_label":"~90s","sort_rank":60,"studio_surfaces":["studio:3d"],"kanvas_modes":[],"raw_api_example":"","raw_payload":{},"raw_source_block":"","is_default":true,"default_rank":60},
    {"id":"openai/gpt-image-2","endpoint_id":"openai/gpt-image-2","provider":"fal-ai","provider_label":"fal.ai","name":"GPT Image 2 API","description":"Fal-hosted OpenAI image generation.","category":"text-to-image","pricing_text":"$1 / units USD (partner)","pricing":{},"model_url":"https://fal.run/openai/gpt-image-2","license":"commercial","tags":["image","openai"],"published_at":null,"model_updated_at":null,"vendor":"OpenAI","family":"GPT Image","tier":"standard","transport_type":"fal_queue","media_type":"image","workflow_type":"text-to-image","ui_group":"generation","supports":["prompt","num_images","image"],"payload_keys":["prompt","num_images"],"requires_assets":[],"defaults":{"num_images":1},"controls":[],"aliases":["openai/gpt-image-2","gpt image 2"],"enabled":true,"credits":100,"time_label":"~10s","sort_rank":70,"studio_surfaces":["studio:image"],"kanvas_modes":[],"raw_api_example":"","raw_payload":{},"raw_source_block":"","is_default":true,"default_rank":70},
    {"id":"openai/gpt-image-2/edit","endpoint_id":"openai/gpt-image-2/edit","provider":"fal-ai","provider_label":"fal.ai","name":"GPT Image 2 API Edit","description":"Fal-hosted OpenAI image editing.","category":"image-to-image","pricing_text":"$1 / units USD (partner)","pricing":{},"model_url":"https://fal.run/openai/gpt-image-2/edit","license":"commercial","tags":["image","openai","edit"],"published_at":null,"model_updated_at":null,"vendor":"OpenAI","family":"GPT Image","tier":"standard","transport_type":"fal_queue","media_type":"image","workflow_type":"image-to-image","ui_group":"advanced","supports":["prompt","image_urls","image"],"payload_keys":["prompt","image_urls"],"requires_assets":["image"],"defaults":{},"controls":[],"aliases":["openai/gpt-image-2/edit","gpt image 2 edit"],"enabled":true,"credits":100,"time_label":"~10s","sort_rank":80,"studio_surfaces":["studio:image"],"kanvas_modes":[],"raw_api_example":"","raw_payload":{},"raw_source_block":"","is_default":true,"default_rank":80}
  ]$fal_defaults$::jsonb) as row_data(
    id text,
    endpoint_id text,
    provider text,
    provider_label text,
    name text,
    description text,
    category text,
    pricing_text text,
    pricing jsonb,
    model_url text,
    license text,
    tags text[],
    published_at date,
    model_updated_at date,
    vendor text,
    family text,
    tier text,
    transport_type text,
    media_type text,
    workflow_type text,
    ui_group text,
    supports text[],
    payload_keys text[],
    requires_assets text[],
    defaults jsonb,
    controls jsonb,
    aliases text[],
    enabled boolean,
    credits integer,
    time_label text,
    sort_rank integer,
    studio_surfaces text[],
    kanvas_modes text[],
    raw_api_example text,
    raw_payload jsonb,
    raw_source_block text,
    is_default boolean,
    default_rank integer
  )
)
insert into public.ai_model_catalog (
  id, endpoint_id, provider, provider_label, name, description, category,
  pricing_text, pricing, model_url, license, tags, published_at, model_updated_at,
  vendor, family, tier, transport_type, media_type, workflow_type, ui_group,
  supports, payload_keys, requires_assets, defaults, controls, aliases,
  enabled, credits, time_label, sort_rank, studio_surfaces, kanvas_modes,
  raw_api_example, raw_payload, raw_source_block, is_default, default_rank
)
select
  id, endpoint_id, provider, provider_label, name, description, category,
  pricing_text, pricing, model_url, license, tags, published_at, model_updated_at,
  vendor, family, tier, transport_type, media_type, workflow_type, ui_group,
  supports, payload_keys, requires_assets, defaults, controls, aliases,
  enabled, credits, time_label, sort_rank, studio_surfaces, kanvas_modes,
  raw_api_example, raw_payload, raw_source_block, is_default, default_rank
from fal_defaults
on conflict (id) do update set
  endpoint_id = excluded.endpoint_id,
  provider = excluded.provider,
  provider_label = excluded.provider_label,
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  pricing_text = excluded.pricing_text,
  pricing = excluded.pricing,
  model_url = excluded.model_url,
  license = excluded.license,
  tags = excluded.tags,
  published_at = excluded.published_at,
  model_updated_at = excluded.model_updated_at,
  vendor = excluded.vendor,
  family = excluded.family,
  tier = excluded.tier,
  transport_type = excluded.transport_type,
  media_type = excluded.media_type,
  workflow_type = excluded.workflow_type,
  ui_group = excluded.ui_group,
  supports = excluded.supports,
  payload_keys = excluded.payload_keys,
  requires_assets = excluded.requires_assets,
  defaults = excluded.defaults,
  controls = excluded.controls,
  aliases = excluded.aliases,
  enabled = excluded.enabled,
  credits = excluded.credits,
  time_label = excluded.time_label,
  sort_rank = excluded.sort_rank,
  studio_surfaces = excluded.studio_surfaces,
  kanvas_modes = excluded.kanvas_modes,
  raw_api_example = excluded.raw_api_example,
  raw_payload = excluded.raw_payload,
  raw_source_block = excluded.raw_source_block,
  is_default = excluded.is_default,
  default_rank = excluded.default_rank,
  updated_at = now();

update public.ai_model_catalog
set
  provider = 'fal-ai',
  provider_label = 'fal.ai',
  enabled = true,
  transport_type = case
    when transport_type in ('fal_queue', 'direct_http') then transport_type
    else 'fal_queue'
  end,
  studio_surfaces = (
    select array_agg(distinct surface order by surface)
    from unnest(
      coalesce(studio_surfaces, '{}'::text[]) ||
      array_remove(array[
        case media_type
          when 'text' then 'studio:text'
          when 'image' then 'studio:image'
          when 'video' then 'studio:video'
          when 'audio' then 'studio:audio'
          when 'json' then 'studio:json'
          when '3d' then 'studio:3d'
          else null
        end
      ], null::text)
    ) as surface
    where surface is not null and surface <> ''
  ),
  updated_at = now()
where
  provider in ('fal-ai', 'fal.ai', 'fal', 'fal_ai', 'falai')
  or id like 'fal-ai/%'
  or endpoint_id like 'fal-ai/%'
  or model_url like 'https://fal.run/%';

NOTIFY pgrst, 'reload schema';