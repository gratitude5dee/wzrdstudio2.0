-- Add storyline model controls used by project setup and storyline generation.
ALTER TABLE IF EXISTS project_settings
  ADD COLUMN IF NOT EXISTS storyline_text_model TEXT;

ALTER TABLE IF EXISTS project_settings
  ADD COLUMN IF NOT EXISTS storyline_text_settings JSONB;

ALTER TABLE IF EXISTS project_settings
  ALTER COLUMN storyline_text_model SET DEFAULT 'llama-3.3-70b-versatile';

ALTER TABLE IF EXISTS project_settings
  ALTER COLUMN storyline_text_settings SET DEFAULT '{}'::jsonb;

UPDATE project_settings
SET storyline_text_model = COALESCE(NULLIF(storyline_text_model, ''), 'llama-3.3-70b-versatile')
WHERE storyline_text_model IS NULL OR storyline_text_model = '';

UPDATE project_settings
SET storyline_text_settings = '{}'::jsonb
WHERE storyline_text_settings IS NULL;

ALTER TABLE IF EXISTS project_settings
  ALTER COLUMN storyline_text_model SET NOT NULL;

ALTER TABLE IF EXISTS project_settings
  ALTER COLUMN storyline_text_settings SET NOT NULL;
