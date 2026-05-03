import { createClient } from "npm:@supabase/supabase-js@2";

import type { CatalogModel } from "../shared/ai-model-catalog.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const INPUT_PATH = Deno.args[0] ?? `${ROOT}/supabase/seeds/ai-model-catalog.seed.json`;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const raw = await Deno.readTextFile(INPUT_PATH);
const rows = JSON.parse(raw) as CatalogModel[];

const payload = rows.map((row) => ({
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
  published_at: row.publishedAt ?? null,
  model_updated_at: row.modelUpdatedAt ?? null,
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
}));

const CHUNK_SIZE = 200;
for (let index = 0; index < payload.length; index += CHUNK_SIZE) {
  const chunk = payload.slice(index, index + CHUNK_SIZE);
  const { error } = await supabase
    .from("ai_model_catalog")
    .upsert(chunk, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to upsert ai_model_catalog chunk ${index / CHUNK_SIZE + 1}: ${error.message}`);
  }
}

console.log(`Upserted ${payload.length} ai_model_catalog rows from ${INPUT_PATH}`);
