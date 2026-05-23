ALTER TABLE public.project_settings
  ADD COLUMN IF NOT EXISTS storyline_text_model text DEFAULT 'llama-3.3-70b-versatile',
  ADD COLUMN IF NOT EXISTS storyline_text_settings jsonb DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';