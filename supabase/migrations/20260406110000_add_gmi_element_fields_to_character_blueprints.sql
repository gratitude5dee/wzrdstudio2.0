ALTER TABLE public.character_blueprints
  ADD COLUMN IF NOT EXISTS gmi_element_id TEXT,
  ADD COLUMN IF NOT EXISTS gmi_element_request_id TEXT,
  ADD COLUMN IF NOT EXISTS gmi_element_status TEXT,
  ADD COLUMN IF NOT EXISTS gmi_element_error TEXT,
  ADD COLUMN IF NOT EXISTS gmi_element_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_character_blueprints_gmi_element_id
  ON public.character_blueprints (gmi_element_id)
  WHERE gmi_element_id IS NOT NULL;
