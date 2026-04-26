
-- =========================================================
-- Kanvas Lyrics: templates + transcription jobs
-- =========================================================

CREATE TABLE public.kanvas_lyric_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled Template',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','audio_ready','lyrics_processing','lyrics_ready','markers_ready','saved','failed','archived')),
  source_audio_asset_id uuid NOT NULL REFERENCES public.project_assets(id) ON DELETE RESTRICT,
  trimmed_audio_asset_id uuid NULL REFERENCES public.project_assets(id) ON DELETE SET NULL,
  selection_start_ms integer NOT NULL DEFAULT 0 CHECK (selection_start_ms >= 0),
  selection_duration_ms integer NOT NULL CHECK (selection_duration_ms BETWEEN 15000 AND 30000),
  total_duration_ms integer NULL CHECK (total_duration_ms IS NULL OR total_duration_ms > 0),
  waveform_peaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  lyric_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  cut_markers jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  render_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NULL,
  saved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_klt_user_created
  ON public.kanvas_lyric_templates(user_id, created_at DESC);
CREATE INDEX idx_klt_project_created
  ON public.kanvas_lyric_templates(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX idx_klt_user_status
  ON public.kanvas_lyric_templates(user_id, status);

CREATE TRIGGER trg_klt_updated_at
  BEFORE UPDATE ON public.kanvas_lyric_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.kanvas_lyric_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own lyric templates"
  ON public.kanvas_lyric_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own lyric templates"
  ON public.kanvas_lyric_templates FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users update own lyric templates"
  ON public.kanvas_lyric_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users delete own lyric templates"
  ON public.kanvas_lyric_templates FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------

CREATE TABLE public.kanvas_lyric_template_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.kanvas_lyric_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  job_type text NOT NULL CHECK (job_type IN ('transcribe','retime','normalize')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  provider text NULL,
  model text NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL
);

CREATE INDEX idx_kltj_template_created
  ON public.kanvas_lyric_template_jobs(template_id, created_at DESC);
CREATE INDEX idx_kltj_user_status
  ON public.kanvas_lyric_template_jobs(user_id, status);

ALTER TABLE public.kanvas_lyric_template_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own lyric jobs"
  ON public.kanvas_lyric_template_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own lyric jobs"
  ON public.kanvas_lyric_template_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own lyric jobs"
  ON public.kanvas_lyric_template_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own lyric jobs"
  ON public.kanvas_lyric_template_jobs FOR DELETE
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
