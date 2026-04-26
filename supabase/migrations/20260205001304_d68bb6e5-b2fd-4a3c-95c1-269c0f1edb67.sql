-- Create mog_rate_limits table for comprehensive rate limiting
CREATE TABLE IF NOT EXISTS public.mog_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.mog_agent_profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, action_type)
);

-- Enable RLS on mog_rate_limits
ALTER TABLE public.mog_rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS policy for mog_rate_limits
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.mog_rate_limits;
CREATE POLICY "Service role can manage rate limits" ON public.mog_rate_limits
  FOR ALL USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mog_rate_limits_agent_action ON public.mog_rate_limits(agent_id, action_type);
CREATE INDEX IF NOT EXISTS idx_mog_agent_profiles_api_key ON public.mog_agent_profiles(api_key);
CREATE INDEX IF NOT EXISTS idx_mog_posts_creator_wallet ON public.mog_posts(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_mog_posts_created_at ON public.mog_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_payouts_payer_wallet ON public.engagement_payouts(payer_wallet, created_at);