-- =========================================================
-- Kanvas Remix: footage, lyric styles, and repo-native jobs
-- =========================================================

ALTER TABLE public.kanvas_lyric_templates
  ADD COLUMN IF NOT EXISTS thumbnail_url text NULL;

CREATE TABLE IF NOT EXISTS public.footage_categories (
  id text PRIMARY KEY,
  parent_id text NULL REFERENCES public.footage_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Film',
  sort integer NOT NULL DEFAULT 0
);

ALTER TABLE public.footage_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read footage categories" ON public.footage_categories;
CREATE POLICY "Anyone can read footage categories"
  ON public.footage_categories FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.footage_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner text NOT NULL DEFAULT 'system',
  category_id text NULL REFERENCES public.footage_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  source text NOT NULL DEFAULT 'preselected'
    CHECK (source IN ('preselected','upload','generated')),
  url text NOT NULL,
  poster_url text NULL,
  duration_ms integer NOT NULL CHECK (duration_ms > 0),
  aspect_ratio text NOT NULL DEFAULT '9:16'
    CHECK (aspect_ratio IN ('9:16','16:9','1:1')),
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_footage_assets_category_created
  ON public.footage_assets(category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_footage_assets_owner_created
  ON public.footage_assets(owner, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_footage_assets_tags
  ON public.footage_assets USING gin(tags);

ALTER TABLE public.footage_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read system and own footage" ON public.footage_assets;
CREATE POLICY "Users read system and own footage"
  ON public.footage_assets FOR SELECT
  USING (owner = 'system' OR owner = auth.uid()::text);

DROP POLICY IF EXISTS "Users insert own footage" ON public.footage_assets;
CREATE POLICY "Users insert own footage"
  ON public.footage_assets FOR INSERT
  WITH CHECK (owner = auth.uid()::text);

DROP POLICY IF EXISTS "Users update own footage" ON public.footage_assets;
CREATE POLICY "Users update own footage"
  ON public.footage_assets FOR UPDATE
  USING (owner = auth.uid()::text)
  WITH CHECK (owner = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own footage" ON public.footage_assets;
CREATE POLICY "Users delete own footage"
  ON public.footage_assets FOR DELETE
  USING (owner = auth.uid()::text);

CREATE TABLE IF NOT EXISTS public.lyric_styles (
  id text PRIMARY KEY,
  name text NOT NULL,
  spec_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort integer NOT NULL DEFAULT 0
);

ALTER TABLE public.lyric_styles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read lyric styles" ON public.lyric_styles;
CREATE POLICY "Anyone can read lyric styles"
  ON public.lyric_styles FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.remix_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id uuid NOT NULL REFERENCES public.kanvas_lyric_templates(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  lyric_style_id text NOT NULL REFERENCES public.lyric_styles(id),
  scale real NOT NULL DEFAULT 0.65 CHECK (scale >= 0.4 AND scale <= 1.4),
  no_cuts boolean NOT NULL DEFAULT false,
  clip_ratio text NOT NULL DEFAULT 'all'
    CHECK (clip_ratio IN ('all','9:16','16:9','1:1')),
  filter text NOT NULL DEFAULT 'all',
  shuffle_each boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','partial','failed','cancelled')),
  credit_cost integer NOT NULL DEFAULT 0 CHECK (credit_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_remix_jobs_updated_at
  BEFORE UPDATE ON public.remix_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_remix_jobs_user_created
  ON public.remix_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remix_jobs_template_created
  ON public.remix_jobs(template_id, created_at DESC);

ALTER TABLE public.remix_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own remix jobs" ON public.remix_jobs;
CREATE POLICY "Users select own remix jobs"
  ON public.remix_jobs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own remix jobs" ON public.remix_jobs;
CREATE POLICY "Users insert own remix jobs"
  ON public.remix_jobs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.kanvas_lyric_templates t
      WHERE t.id = template_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users update own remix jobs" ON public.remix_jobs;
CREATE POLICY "Users update own remix jobs"
  ON public.remix_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own remix jobs" ON public.remix_jobs;
CREATE POLICY "Users delete own remix jobs"
  ON public.remix_jobs FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.remix_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.remix_jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','rendering','done','failed','cancelled')),
  remotion_render_id text NULL,
  clip_ids text[] NOT NULL DEFAULT '{}',
  output_url text NULL,
  thumbnail_url text NULL,
  error text NULL,
  progress real NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_remix_renders_updated_at
  BEFORE UPDATE ON public.remix_renders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_remix_renders_job_created
  ON public.remix_renders(job_id, created_at ASC);

ALTER TABLE public.remix_renders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own remix renders" ON public.remix_renders;
CREATE POLICY "Users select own remix renders"
  ON public.remix_renders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.remix_jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert own remix renders" ON public.remix_renders;
CREATE POLICY "Users insert own remix renders"
  ON public.remix_renders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.remix_jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users update own remix renders" ON public.remix_renders;
CREATE POLICY "Users update own remix renders"
  ON public.remix_renders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.remix_jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.remix_jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

-- Seed immutable v1 categories.
INSERT INTO public.footage_categories (id, parent_id, name, icon, sort) VALUES
  ('bay-area', NULL, 'Bay Area', 'Globe2', 10),
  ('bay-area-8mm', 'bay-area', '8mm', 'Film', 11),
  ('bay-area-modern', 'bay-area', 'Modern', 'Sparkles', 12),
  ('bay-area-aerial', 'bay-area', 'Aerial', 'Plane', 13),
  ('abstract', NULL, 'Abstract', 'Shapes', 20),
  ('abstract-loops', 'abstract', 'Loops', 'RefreshCw', 21),
  ('abstract-glitch', 'abstract', 'Glitch', 'Zap', 22),
  ('nature', NULL, 'Nature', 'Waves', 30),
  ('nature-coast', 'nature', 'Coast', 'Waves', 31),
  ('nature-forest', 'nature', 'Forest', 'Trees', 32)
ON CONFLICT (id) DO UPDATE SET
  parent_id = excluded.parent_id,
  name = excluded.name,
  icon = excluded.icon,
  sort = excluded.sort;

INSERT INTO public.lyric_styles (id, name, spec_json, sort) VALUES
  ('default', 'Default', '{"font":"Inter, system-ui, sans-serif","fill":"#E8FBFF","accentFill":"#54D9FF","accentTarget":"first-word","stroke":"#071014","strokeWidth":10,"animationIn":"pop"}', 10),
  ('none', 'None', '{"font":"Inter, system-ui, sans-serif","fill":"transparent","animationIn":"none"}', 20),
  ('heartless', 'Heartless', '{"font":"Georgia, Times New Roman, serif","fill":"#FFD400","stroke":"#050505","strokeWidth":12,"animationIn":"tilt","transform":"skewX(-8deg)"}', 30),
  ('fly', 'Fly', '{"font":"Impact, Arial Narrow, sans-serif","fill":"#FFFFFF","stroke":"#050505","strokeWidth":9,"animationIn":"rise"}', 40),
  ('pikachu', 'Pikachu', '{"font":"Inter, system-ui, sans-serif","fill":"#FFFFFF","accentFill":"#FFD400","accentTarget":"first-word","stroke":"#050505","strokeWidth":10,"animationIn":"pop"}', 50),
  ('wave', 'Wave', '{"font":"Inter, system-ui, sans-serif","fill":"#FFFFFF","accentFill":"#42D9FF","accentTarget":"first-word","stroke":"#061014","strokeWidth":10,"animationIn":"rise"}', 60),
  ('hotpink', 'Hotpink', '{"font":"Arial Black, Inter, system-ui, sans-serif","fill":"#FF3D81","stroke":"#050505","strokeWidth":9,"animationIn":"tilt","transform":"rotate(-2deg)"}', 70),
  ('brat', 'Brat', '{"font":"ui-monospace, SFMono-Regular, Menlo, monospace","fill":"#050505","stroke":"#B7FF31","strokeWidth":8,"background":"#B7FF31","animationIn":"none"}', 80)
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name,
  spec_json = excluded.spec_json,
  sort = excluded.sort;

INSERT INTO public.footage_assets (owner, category_id, title, source, url, poster_url, duration_ms, aspect_ratio, tags) VALUES
  ('system', 'bay-area-8mm', 'Bay Area Super 8mm night', 'preselected', '/bgvid.mp4', '/og-image.png', 6600, '9:16', ARRAY['8mm','Bay Area']),
  ('system', 'bay-area-8mm', 'Bay Area Super 8mm bridge', 'preselected', '/wzrdstudiointro1.mp4', '/og-image.png', 7900, '9:16', ARRAY['8mm','Bay Area']),
  ('system', 'bay-area-8mm', 'Bay Area Super 8mm red frame', 'preselected', '/wzrdstudiointro1.mp4', '/og-image.png', 15000, '9:16', ARRAY['8mm','Bay Area']),
  ('system', 'bay-area-modern', 'Modern skyline plate', 'preselected', '/bgvid.mp4', '/og-image.png', 15000, '16:9', ARRAY['Modern','Bay Area']),
  ('system', 'bay-area-aerial', 'Aerial haze loop', 'preselected', '/bgvid.mp4', '/og-image.png', 5600, '16:9', ARRAY['Aerial']),
  ('system', 'abstract-loops', 'Abstract motion loop', 'preselected', '/wzrdstudiointro1.mp4', '/placeholder.svg', 11900, '1:1', ARRAY['Abstract','Loops'])
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
