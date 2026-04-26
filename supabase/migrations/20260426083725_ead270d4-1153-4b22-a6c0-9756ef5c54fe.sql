ALTER TABLE public.saved_flows
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'shared', 'public')),
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS template_category text,
  ADD COLUMN IF NOT EXISTS remix_parent_flow_id uuid REFERENCES public.saved_flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remix_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS featured_rank integer;

CREATE UNIQUE INDEX IF NOT EXISTS saved_flows_slug_unique
  ON public.saved_flows (slug) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS saved_flows_visibility_idx ON public.saved_flows (visibility);
CREATE INDEX IF NOT EXISTS saved_flows_template_category_idx ON public.saved_flows (template_category);

DROP POLICY IF EXISTS "Users can manage their saved flows" ON public.saved_flows;

CREATE POLICY "Owners manage their flows"
  ON public.saved_flows FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Signed-in users read public templates"
  ON public.saved_flows FOR SELECT
  TO authenticated
  USING (visibility = 'public');

NOTIFY pgrst, 'reload schema';