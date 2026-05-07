## What's wrong

The `character_blueprints` table is missing several columns that the code references via `select('*')`, causing the PostgREST schema cache error. The `character_blueprint_images` table is also missing columns.

## Database migration

Add missing columns to both tables:

**`character_blueprints`** — add:
- `location_metadata` (JSONB, nullable)
- `tags` (JSONB, nullable)
- `gmi_element_id` (TEXT, nullable)
- `gmi_element_request_id` (TEXT, nullable)
- `gmi_element_status` (TEXT, nullable)
- `gmi_element_error` (TEXT, nullable)
- `gmi_element_updated_at` (TIMESTAMPTZ, nullable)

**`character_blueprint_images`** — add:
- `asset_id` (TEXT, nullable)
- `generation_role` (TEXT, nullable)
- `generation_metadata` (JSONB, nullable)

After migration, run `NOTIFY pgrst, 'reload schema';` to refresh the PostgREST cache.

## Add OVERSHOOT_API_KEY secret

Add the `OVERSHOOT_API_KEY` to Supabase Edge Function secrets so the `aura-vlm-judge` and `overshoot-stream` functions work.

## No code changes needed

The application code already handles these columns correctly — it just needs the database schema to match.
