-- Aura Asset Store blueprint reference support.
-- Forward-compatible with both historical character_blueprints table shapes.

ALTER TABLE public.character_blueprints
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'character';

ALTER TABLE public.character_blueprint_images
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.project_assets(id) ON DELETE SET NULL;

DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.character_blueprints'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.character_blueprints DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END $$;

ALTER TABLE public.character_blueprints
  ADD CONSTRAINT character_blueprints_kind_check
  CHECK (kind IN ('character', 'object', 'creature', 'vehicle', 'environment', 'location'));

CREATE INDEX IF NOT EXISTS idx_character_blueprints_user_kind_updated
  ON public.character_blueprints (user_id, kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_character_blueprint_images_asset_id
  ON public.character_blueprint_images (asset_id)
  WHERE asset_id IS NOT NULL;

ALTER TABLE public.character_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_blueprint_images ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
