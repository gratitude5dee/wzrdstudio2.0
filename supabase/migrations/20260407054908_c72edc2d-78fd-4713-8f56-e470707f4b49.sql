CREATE TABLE IF NOT EXISTS public.ai_model_catalog (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  provider_label TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  pricing_text TEXT NOT NULL DEFAULT '',
  pricing JSONB NOT NULL DEFAULT '{}',
  transport_type TEXT NOT NULL DEFAULT 'chat_completion',
  media_type TEXT NOT NULL DEFAULT 'text',
  workflow_type TEXT NOT NULL DEFAULT '',
  ui_group TEXT NOT NULL DEFAULT 'generation',
  supports TEXT[] NOT NULL DEFAULT '{}',
  payload_keys TEXT[] NOT NULL DEFAULT '{}',
  requires_assets TEXT[] NOT NULL DEFAULT '{}',
  defaults JSONB NOT NULL DEFAULT '{}',
  controls JSONB NOT NULL DEFAULT '[]',
  aliases TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  credits INTEGER NOT NULL DEFAULT 0,
  time_label TEXT NOT NULL DEFAULT '~10s',
  sort_rank INTEGER NOT NULL DEFAULT 1000,
  studio_surfaces TEXT[] NOT NULL DEFAULT '{}',
  kanvas_modes TEXT[] NOT NULL DEFAULT '{}',
  raw_api_example TEXT NOT NULL DEFAULT '',
  raw_payload JSONB NOT NULL DEFAULT '{}',
  raw_source_block TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  default_rank INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_model_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read model catalog"
  ON public.ai_model_catalog FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to model catalog"
  ON public.ai_model_catalog FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
