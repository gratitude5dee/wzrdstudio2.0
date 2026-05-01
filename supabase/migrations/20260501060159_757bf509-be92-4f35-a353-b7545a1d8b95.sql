-- Widen kanvas_lyric_templates clip durations to {15s, 30s, 45s, 60s}
ALTER TABLE public.kanvas_lyric_templates
  DROP CONSTRAINT IF EXISTS kanvas_lyric_templates_selection_duration_ms_check;

ALTER TABLE public.kanvas_lyric_templates
  ADD CONSTRAINT kanvas_lyric_templates_selection_duration_ms_check
  CHECK (selection_duration_ms IN (15000, 30000, 45000, 60000));

NOTIFY pgrst, 'reload schema';