-- Create timeline_assets table for Director's Cut chronological sequencing
CREATE TABLE IF NOT EXISTS public.timeline_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE,
  shot_id UUID REFERENCES public.shots(id) ON DELETE CASCADE,
  sequence_index INTEGER NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('image', 'video', 'audio')),
  asset_role TEXT NOT NULL CHECK (asset_role IN ('shot_visual', 'voiceover', 'sfx', 'music')),
  source_url TEXT,
  thumbnail_url TEXT,
  duration_ms INTEGER,
  generation_status TEXT NOT NULL DEFAULT 'pending' CHECK (generation_status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_assets_project_sequence
  ON public.timeline_assets(project_id, sequence_index);

CREATE INDEX IF NOT EXISTS idx_timeline_assets_project_scene_shot
  ON public.timeline_assets(project_id, scene_id, shot_id);

ALTER TABLE public.timeline_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own timeline assets"
  ON public.timeline_assets
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own timeline assets"
  ON public.timeline_assets
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own timeline assets"
  ON public.timeline_assets
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own timeline assets"
  ON public.timeline_assets
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.update_timeline_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_timeline_assets_updated_at ON public.timeline_assets;
CREATE TRIGGER trigger_update_timeline_assets_updated_at
  BEFORE UPDATE ON public.timeline_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_timeline_assets_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_assets TO authenticated;

-- Extend export_jobs telemetry for Director's Cut provider orchestration
ALTER TABLE public.export_jobs
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_job_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_payload JSONB DEFAULT '{}'::jsonb;
