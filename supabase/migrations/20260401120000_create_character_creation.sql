-- Character Creation Schema Migration
-- Stores user-created characters/objects for @mention reference across studios

-- ============================================================================
-- character_blueprints — the "recipe" for a character/object
-- ============================================================================

CREATE TABLE IF NOT EXISTS character_blueprints (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id    UUID REFERENCES canvas_projects(id) ON DELETE SET NULL,

  -- Identity
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,                       -- lowercase, trimmed for @mention lookup
  kind          TEXT NOT NULL DEFAULT 'character'
                CHECK (kind IN ('character', 'object', 'creature', 'vehicle', 'environment')),

  -- Builder selections (denormalised JSONB keeps the schema extensible)
  traits        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { characterType, gender, ethnicity, skinColor, skinCondition, age, ... }
  face_details  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { eyeType, eyeDetail, mouth, teeth, ... }
  body_details  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { build, height, pose, ... }
  style_details JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { clothing, accessories, artStyle, ... }

  -- Prompt fragment auto-composed from traits (pre-computed for fast injection)
  prompt_fragment TEXT NOT NULL DEFAULT '',

  -- Generated reference image (the "finalised" look)
  image_url     TEXT,
  thumbnail_url TEXT,

  -- Metadata
  is_favorite   BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-user slug uniqueness (allows different users to have same slug)
CREATE UNIQUE INDEX idx_character_blueprints_user_slug
  ON character_blueprints (user_id, slug);

-- Fast lookup by user (dashboard listing)
CREATE INDEX idx_character_blueprints_user_id
  ON character_blueprints (user_id);

-- Fast lookup by project
CREATE INDEX idx_character_blueprints_project_id
  ON character_blueprints (project_id)
  WHERE project_id IS NOT NULL;

-- @mention autocomplete: prefix search on slug per user
CREATE INDEX idx_character_blueprints_slug_trgm
  ON character_blueprints (user_id, slug text_pattern_ops);

-- ============================================================================
-- character_blueprint_images — gallery of alternate reference images
-- ============================================================================

CREATE TABLE IF NOT EXISTS character_blueprint_images (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blueprint_id  UUID REFERENCES character_blueprints(id) ON DELETE CASCADE NOT NULL,
  image_url     TEXT NOT NULL,
  label         TEXT,                               -- e.g. "front", "profile", "action pose"
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blueprint_images_blueprint_id
  ON character_blueprint_images (blueprint_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE character_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_blueprint_images ENABLE ROW LEVEL SECURITY;

-- character_blueprints policies
CREATE POLICY "Users can view their own character blueprints"
  ON character_blueprints FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own character blueprints"
  ON character_blueprints FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own character blueprints"
  ON character_blueprints FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own character blueprints"
  ON character_blueprints FOR DELETE
  USING (auth.uid() = user_id);

-- character_blueprint_images policies (join through blueprint ownership)
CREATE POLICY "Users can view images of their own blueprints"
  ON character_blueprint_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM character_blueprints
      WHERE character_blueprints.id = character_blueprint_images.blueprint_id
      AND character_blueprints.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create images for their own blueprints"
  ON character_blueprint_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM character_blueprints
      WHERE character_blueprints.id = character_blueprint_images.blueprint_id
      AND character_blueprints.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update images of their own blueprints"
  ON character_blueprint_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM character_blueprints
      WHERE character_blueprints.id = character_blueprint_images.blueprint_id
      AND character_blueprints.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete images of their own blueprints"
  ON character_blueprint_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM character_blueprints
      WHERE character_blueprints.id = character_blueprint_images.blueprint_id
      AND character_blueprints.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Auto-update updated_at trigger (reuses existing function)
-- ============================================================================

CREATE TRIGGER update_character_blueprints_updated_at
  BEFORE UPDATE ON character_blueprints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
