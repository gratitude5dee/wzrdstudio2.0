-- Director's Cut reads the canonical timeline_assets shape. Older migration
-- paths created asset_kind / sequence_index instead of asset_type /
-- position_order, so repair the schema forward without dropping legacy columns.

ALTER TABLE public.timeline_assets
  ADD COLUMN IF NOT EXISTS asset_type TEXT,
  ADD COLUMN IF NOT EXISTS position_order INTEGER,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS user_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'timeline_assets'
      AND column_name = 'asset_kind'
  ) THEN
    EXECUTE $sql$
      UPDATE public.timeline_assets
      SET asset_type = asset_kind
      WHERE asset_type IS NULL
        AND asset_kind IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'timeline_assets'
      AND column_name = 'sequence_index'
  ) THEN
    EXECUTE $sql$
      UPDATE public.timeline_assets
      SET position_order = sequence_index
      WHERE position_order IS NULL
        AND sequence_index IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'timeline_assets'
      AND column_name = 'asset_role'
  ) THEN
    EXECUTE $sql$
      UPDATE public.timeline_assets
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('asset_role', asset_role)
      WHERE asset_role IS NOT NULL
        AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'asset_role')
    $sql$;
  END IF;
END $$;

UPDATE public.timeline_assets
SET
  asset_type = COALESCE(asset_type, 'video'),
  position_order = COALESCE(position_order, 0),
  metadata = COALESCE(metadata, '{}'::jsonb)
WHERE asset_type IS NULL
  OR position_order IS NULL
  OR metadata IS NULL;

ALTER TABLE public.timeline_assets
  ALTER COLUMN asset_type SET DEFAULT 'video',
  ALTER COLUMN asset_type SET NOT NULL,
  ALTER COLUMN position_order SET DEFAULT 0,
  ALTER COLUMN position_order SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'timeline_assets_asset_type_check'
      AND conrelid = 'public.timeline_assets'::regclass
  ) THEN
    ALTER TABLE public.timeline_assets
      ADD CONSTRAINT timeline_assets_asset_type_check
      CHECK (asset_type IN ('image', 'video', 'audio', 'text', 'element'));
  END IF;
END $$;

ALTER TABLE public.timeline_assets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_timeline_assets_user_project_position_order
  ON public.timeline_assets(user_id, project_id, position_order);

CREATE INDEX IF NOT EXISTS idx_timeline_assets_user_project_type
  ON public.timeline_assets(user_id, project_id, asset_type);

CREATE INDEX IF NOT EXISTS idx_timeline_assets_project_shot_position
  ON public.timeline_assets(project_id, shot_id, position_order);
