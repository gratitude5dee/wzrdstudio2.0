import {
  buildFalCatalogRows,
  parseFalModelsMarkdown,
} from "./falModelsCatalog.ts";
import type { CatalogModel } from "../shared/ai-model-catalog.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SOURCE_PATH = Deno.args[0] ?? `${ROOT}/../models.md`;
const SEED_OUTPUT_PATH = `${ROOT}/supabase/seeds/fal-model-catalog.seed.json`;
const MIGRATION_OUTPUT_PATH = `${ROOT}/supabase/migrations/20260503143000_full_fal_model_catalog.sql`;

function toDbRow(row: CatalogModel) {
  return {
    id: row.id,
    endpoint_id: row.endpointId,
    provider: row.provider,
    provider_label: row.providerLabel,
    name: row.name,
    description: row.description,
    category: row.category,
    pricing_text: row.pricingText,
    pricing: row.pricing,
    model_url: row.modelUrl ?? null,
    license: row.license ?? null,
    tags: row.tags ?? [],
    published_at: row.publishedAt || null,
    model_updated_at: row.modelUpdatedAt || null,
    vendor: row.vendor ?? null,
    family: row.family ?? null,
    tier: row.tier ?? null,
    transport_type: row.transportType,
    media_type: row.mediaType,
    workflow_type: row.workflowType,
    ui_group: row.uiGroup,
    supports: row.supports,
    payload_keys: row.payloadKeys,
    requires_assets: row.requiresAssets,
    defaults: row.defaults,
    controls: row.controls,
    aliases: row.aliases,
    enabled: row.enabled,
    credits: row.credits,
    time_label: row.timeLabel,
    sort_rank: row.sortRank,
    studio_surfaces: row.studioSurfaces,
    kanvas_modes: row.kanvasModes,
    raw_api_example: row.rawApiExample,
    raw_payload: row.rawPayload,
    raw_source_block: row.rawSourceBlock,
    is_default: row.isDefault,
    default_rank: row.defaultRank,
  };
}

function buildMigration(rows: CatalogModel[]): string {
  const payload = JSON.stringify(rows.map(toDbRow));
  return `alter table if exists public.ai_model_catalog
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
    transport_type = any (array['chat_completion'::text, 'request_queue'::text, 'fal_queue'::text, 'edge_function'::text, 'direct_http'::text])
  );

create index if not exists ai_model_catalog_vendor_idx
  on public.ai_model_catalog (provider, vendor, family, tier);

create index if not exists ai_model_catalog_tags_gin_idx
  on public.ai_model_catalog using gin (tags);

with fal_rows as (
  select *
  from jsonb_to_recordset($fal_catalog_json$${payload}$fal_catalog_json$::jsonb) as row_data(
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
  id,
  endpoint_id,
  provider,
  provider_label,
  name,
  description,
  category,
  pricing_text,
  pricing,
  model_url,
  license,
  tags,
  published_at,
  model_updated_at,
  vendor,
  family,
  tier,
  transport_type,
  media_type,
  workflow_type,
  ui_group,
  supports,
  payload_keys,
  requires_assets,
  defaults,
  controls,
  aliases,
  enabled,
  credits,
  time_label,
  sort_rank,
  studio_surfaces,
  kanvas_modes,
  raw_api_example,
  raw_payload,
  raw_source_block,
  is_default,
  default_rank
)
select
  id,
  endpoint_id,
  provider,
  provider_label,
  name,
  description,
  category,
  pricing_text,
  pricing,
  model_url,
  license,
  tags,
  published_at,
  model_updated_at,
  vendor,
  family,
  tier,
  transport_type,
  media_type,
  workflow_type,
  ui_group,
  supports,
  payload_keys,
  requires_assets,
  defaults,
  controls,
  aliases,
  enabled,
  credits,
  time_label,
  sort_rank,
  studio_surfaces,
  kanvas_modes,
  raw_api_example,
  raw_payload,
  raw_source_block,
  is_default,
  default_rank
from fal_rows
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
`;
}

const markdown = await Deno.readTextFile(SOURCE_PATH);
const parsedModels = parseFalModelsMarkdown(markdown);
const rows = buildFalCatalogRows(parsedModels);

await Deno.mkdir(`${ROOT}/supabase/seeds`, { recursive: true });
await Deno.writeTextFile(SEED_OUTPUT_PATH, `${JSON.stringify(rows, null, 2)}\n`);
await Deno.writeTextFile(MIGRATION_OUTPUT_PATH, buildMigration(rows));

console.log(`Parsed ${parsedModels.length} fal endpoints from ${SOURCE_PATH}`);
console.log(`Wrote ${rows.length} rows to ${SEED_OUTPUT_PATH}`);
console.log(`Wrote migration to ${MIGRATION_OUTPUT_PATH}`);
