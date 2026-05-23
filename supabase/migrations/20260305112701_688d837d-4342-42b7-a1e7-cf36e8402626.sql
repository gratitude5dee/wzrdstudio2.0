
-- ============================================================
-- Director's Cut: Create missing tables + extend export_jobs
-- ============================================================

-- 1. final_project_assets
CREATE TABLE IF NOT EXISTS public.final_project_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL DEFAULT 'video',
  file_url TEXT,
  storage_path TEXT,
  storage_bucket TEXT DEFAULT 'final-exports',
  file_size BIGINT,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.final_project_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own final assets"
  ON public.final_project_assets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own final assets"
  ON public.final_project_assets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own final assets"
  ON public.final_project_assets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own final assets"
  ON public.final_project_assets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. export_jobs
CREATE TABLE IF NOT EXISTS public.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  output_url TEXT,
  error_message TEXT,
  settings JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  provider TEXT DEFAULT 'internal_ffmpeg',
  provider_job_id TEXT,
  provider_status TEXT,
  fallback_used BOOLEAN DEFAULT false,
  provider_payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own export jobs"
  ON public.export_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own export jobs"
  ON public.export_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own export jobs"
  ON public.export_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. timeline_assets
CREATE TABLE IF NOT EXISTS public.timeline_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_id UUID,
  shot_id UUID,
  asset_type TEXT NOT NULL DEFAULT 'video',
  source_url TEXT,
  duration_ms INTEGER DEFAULT 5000,
  position_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.timeline_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own timeline assets"
  ON public.timeline_assets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own timeline assets"
  ON public.timeline_assets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own timeline assets"
  ON public.timeline_assets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own timeline assets"
  ON public.timeline_assets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Create final-exports storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('final-exports', 'final-exports', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage policy for final-exports
CREATE POLICY "Authenticated users can upload to final-exports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'final-exports');

CREATE POLICY "Anyone can read final-exports"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'final-exports');

CREATE POLICY "Users can delete own final-exports"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'final-exports');
