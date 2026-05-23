
-- Add missing columns to character_blueprints
ALTER TABLE public.character_blueprints
  ADD COLUMN IF NOT EXISTS slug text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'character',
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS face_details jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS body_details jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS style_details jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prompt_fragment text DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0;

-- Add missing columns to character_blueprint_images
ALTER TABLE public.character_blueprint_images
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_character_blueprints_slug ON public.character_blueprints(slug);
CREATE INDEX IF NOT EXISTS idx_character_blueprints_project_id ON public.character_blueprints(project_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
