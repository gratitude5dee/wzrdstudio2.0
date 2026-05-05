-- WZRD Asset Reference Registry V1
-- Additive registry metadata for project assets and reusable blueprints.

ALTER TABLE public.project_assets
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.character_blueprints
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.character_blueprint_images
  ADD COLUMN IF NOT EXISTS generation_role text,
  ADD COLUMN IF NOT EXISTS generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_project_assets_tags_gin
  ON public.project_assets USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_character_blueprints_tags_gin
  ON public.character_blueprints USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_character_blueprints_location_metadata_gin
  ON public.character_blueprints USING gin (location_metadata);

CREATE INDEX IF NOT EXISTS idx_character_blueprint_images_generation_metadata_gin
  ON public.character_blueprint_images USING gin (generation_metadata);

CREATE INDEX IF NOT EXISTS idx_character_blueprints_user_project_kind_updated
  ON public.character_blueprints (user_id, project_id, kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_character_blueprint_images_blueprint_role_sort
  ON public.character_blueprint_images (blueprint_id, generation_role, sort_order);
