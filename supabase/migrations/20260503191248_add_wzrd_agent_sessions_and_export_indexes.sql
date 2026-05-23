CREATE TABLE IF NOT EXISTS public.wzrd_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'plan' CHECK (mode IN ('legacy', 'plan', 'materialize', 'repair')),
  provider TEXT NOT NULL DEFAULT 'codex' CHECK (provider IN ('codex', 'groq', 'fallback')),
  prompt TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  asset_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  materialized_graph_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'questions_ready', 'validation_failed', 'materialized', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wzrd_agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own WZRD sessions"
  ON public.wzrd_agent_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own WZRD sessions"
  ON public.wzrd_agent_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.projects
        WHERE projects.id = wzrd_agent_sessions.project_id
          AND projects.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their own WZRD sessions"
  ON public.wzrd_agent_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.projects
        WHERE projects.id = wzrd_agent_sessions.project_id
          AND projects.user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_wzrd_agent_sessions_user_project_updated
  ON public.wzrd_agent_sessions(user_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wzrd_agent_sessions_status
  ON public.wzrd_agent_sessions(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_assets_user_project_order
  ON public.timeline_assets(user_id, project_id, position_order);

CREATE INDEX IF NOT EXISTS idx_timeline_assets_audio_roles
  ON public.timeline_assets(project_id, user_id, position_order)
  WHERE asset_type = 'audio';

CREATE INDEX IF NOT EXISTS idx_export_jobs_user_project_status_created
  ON public.export_jobs(user_id, project_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_wzrd_agent_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_wzrd_agent_sessions_updated_at ON public.wzrd_agent_sessions;
CREATE TRIGGER trigger_update_wzrd_agent_sessions_updated_at
  BEFORE UPDATE ON public.wzrd_agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wzrd_agent_sessions_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.wzrd_agent_sessions TO authenticated;
