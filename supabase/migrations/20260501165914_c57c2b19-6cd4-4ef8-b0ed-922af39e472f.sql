ALTER TABLE IF EXISTS remix_jobs
  ADD COLUMN IF NOT EXISTS aspect_ratio text DEFAULT '9:16',
  ADD COLUMN IF NOT EXISTS timeline_json jsonb DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';