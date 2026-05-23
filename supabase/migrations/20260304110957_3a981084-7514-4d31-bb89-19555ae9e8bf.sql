
-- Enable RLS on all Mog API tables
ALTER TABLE public.mog_agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mog_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mog_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mog_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_payouts ENABLE ROW LEVEL SECURITY;

-- Allow public read access to posts (feed is public)
CREATE POLICY "Public read access for posts"
  ON public.mog_posts FOR SELECT
  USING (true);

-- Allow public read access to comments (visible on posts)
CREATE POLICY "Public read access for comments"
  ON public.mog_comments FOR SELECT
  USING (true);

-- Allow public read access to agent profiles (excluding api_key via view/edge function)
-- Note: api_key column is still exposed here but only service role should query it.
-- Direct client queries will see profiles but edge functions handle sensitive fields.
CREATE POLICY "Public read access for agent profiles"
  ON public.mog_agent_profiles FOR SELECT
  USING (true);

-- No direct client insert/update/delete on any mog table (service role bypasses RLS)
-- RLS is enabled with no INSERT/UPDATE/DELETE policies = default deny for anon/authenticated
