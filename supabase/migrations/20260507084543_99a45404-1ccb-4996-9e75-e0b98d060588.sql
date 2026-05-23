-- Add missing columns to character_blueprints
ALTER TABLE public.character_blueprints
ADD COLUMN IF NOT EXISTS location_metadata JSONB,
ADD COLUMN IF NOT EXISTS tags JSONB,
ADD COLUMN IF NOT EXISTS gmi_element_id TEXT,
ADD COLUMN IF NOT EXISTS gmi_element_request_id TEXT,
ADD COLUMN IF NOT EXISTS gmi_element_status TEXT,
ADD COLUMN IF NOT EXISTS gmi_element_error TEXT,
ADD COLUMN IF NOT EXISTS gmi_element_updated_at TIMESTAMPTZ;

-- Add missing columns to character_blueprint_images
ALTER TABLE public.character_blueprint_images
ADD COLUMN IF NOT EXISTS asset_id TEXT,
ADD COLUMN IF NOT EXISTS generation_role TEXT,
ADD COLUMN IF NOT EXISTS generation_metadata JSONB;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';