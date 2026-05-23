-- Editor persistence and Editframe webhook tracking.
-- Keeps /editor state durable and lets server-side Editframe renders complete asynchronously.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  width INTEGER NOT NULL DEFAULT 1920 CHECK (width > 0),
  height INTEGER NOT NULL DEFAULT 1080 CHECK (height > 0),
  fps INTEGER NOT NULL DEFAULT 30 CHECK (fps > 0),
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  background_color TEXT NOT NULL DEFAULT '#000000',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compositions_user_project
  ON public.compositions(user_id, project_id);

ALTER TABLE public.compositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own editor compositions"
  ON public.compositions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = compositions.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own editor compositions"
  ON public.compositions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = compositions.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own editor compositions"
  ON public.compositions
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = compositions.project_id
        AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = compositions.project_id
        AND projects.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS compositions_set_updated_at ON public.compositions;
CREATE TRIGGER compositions_set_updated_at
  BEFORE UPDATE ON public.compositions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.timeline_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  media_item_id UUID REFERENCES public.media_items(id) ON DELETE SET NULL,
  clip_type TEXT NOT NULL CHECK (clip_type IN ('image', 'video', 'text', 'element')),
  name TEXT NOT NULL DEFAULT 'Clip',
  source_url TEXT,
  source_id TEXT,
  text_content TEXT,
  start_time_ms INTEGER NOT NULL DEFAULT 0 CHECK (start_time_ms >= 0),
  duration_ms INTEGER NOT NULL DEFAULT 5000 CHECK (duration_ms >= 0),
  end_time_ms INTEGER,
  track_index INTEGER NOT NULL DEFAULT 0,
  layer_index INTEGER NOT NULL DEFAULT 0,
  trim_start_ms INTEGER,
  trim_end_ms INTEGER,
  position_x NUMERIC NOT NULL DEFAULT 0,
  position_y NUMERIC NOT NULL DEFAULT 0,
  scale_x NUMERIC NOT NULL DEFAULT 1,
  scale_y NUMERIC NOT NULL DEFAULT 1,
  rotation NUMERIC NOT NULL DEFAULT 0,
  opacity NUMERIC NOT NULL DEFAULT 1 CHECK (opacity >= 0 AND opacity <= 1),
  transition JSONB NOT NULL DEFAULT '{"type":"none","duration":0}'::jsonb,
  effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_clips_user_project_start
  ON public.timeline_clips(user_id, project_id, start_time_ms, layer_index);

CREATE INDEX IF NOT EXISTS idx_timeline_clips_project_layer
  ON public.timeline_clips(project_id, layer_index, start_time_ms);

CREATE INDEX IF NOT EXISTS idx_timeline_clips_media_item
  ON public.timeline_clips(media_item_id)
  WHERE media_item_id IS NOT NULL;

ALTER TABLE public.timeline_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own editor timeline clips"
  ON public.timeline_clips
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = timeline_clips.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own editor timeline clips"
  ON public.timeline_clips
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = timeline_clips.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own editor timeline clips"
  ON public.timeline_clips
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = timeline_clips.project_id
        AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = timeline_clips.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own editor timeline clips"
  ON public.timeline_clips
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = timeline_clips.project_id
        AND projects.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS timeline_clips_set_updated_at ON public.timeline_clips;
CREATE TRIGGER timeline_clips_set_updated_at
  BEFORE UPDATE ON public.timeline_clips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.timeline_keyframes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'clip' CHECK (target_type IN ('clip', 'audio', 'composition')),
  time_ms INTEGER NOT NULL CHECK (time_ms >= 0),
  property_path TEXT NOT NULL,
  value JSONB NOT NULL,
  easing TEXT NOT NULL DEFAULT 'linear',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_keyframes_user_project_target
  ON public.timeline_keyframes(user_id, project_id, target_type, target_id, time_ms);

ALTER TABLE public.timeline_keyframes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own editor keyframes"
  ON public.timeline_keyframes
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = timeline_keyframes.project_id
        AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = timeline_keyframes.project_id
        AND projects.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS timeline_keyframes_set_updated_at ON public.timeline_keyframes;
CREATE TRIGGER timeline_keyframes_set_updated_at
  BEFORE UPDATE ON public.timeline_keyframes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.audio_tracks
  ADD COLUMN IF NOT EXISTS volume NUMERIC DEFAULT 1 CHECK (volume >= 0 AND volume <= 1),
  ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fade_in_ms INTEGER DEFAULT 0 CHECK (fade_in_ms >= 0),
  ADD COLUMN IF NOT EXISTS fade_out_ms INTEGER DEFAULT 0 CHECK (fade_out_ms >= 0),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_audio_tracks_user_project_start
  ON public.audio_tracks(user_id, project_id, start_time_ms, track_index);

CREATE TABLE IF NOT EXISTS public.editframe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT,
  render_id TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.export_jobs(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  signature TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_editframe_webhook_events_event_id
  ON public.editframe_webhook_events(event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_editframe_webhook_events_render
  ON public.editframe_webhook_events(render_id, created_at DESC)
  WHERE render_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_editframe_webhook_events_job
  ON public.editframe_webhook_events(job_id, created_at DESC)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_editframe_webhook_events_user_project
  ON public.editframe_webhook_events(user_id, project_id, created_at DESC);

ALTER TABLE public.editframe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Editframe webhook events"
  ON public.editframe_webhook_events
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = editframe_webhook_events.project_id
          AND projects.user_id = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compositions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_clips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_keyframes TO authenticated;
GRANT SELECT ON public.editframe_webhook_events TO authenticated;
