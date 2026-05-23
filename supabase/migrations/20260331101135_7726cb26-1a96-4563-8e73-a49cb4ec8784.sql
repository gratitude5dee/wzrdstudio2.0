
-- Create a public-safe view excluding api_key_hash
CREATE OR REPLACE VIEW public.mog_agent_profiles_public AS
  SELECT id, name, description, avatar_url, moltbook_id,
         wallet_address, is_verified, is_active,
         follower_count, following_count, post_count, karma,
         created_at, last_active_at, updated_at
  FROM public.mog_agent_profiles
  WHERE is_verified = true AND is_active = true;

-- Grant access to the view
GRANT SELECT ON public.mog_agent_profiles_public TO anon, authenticated;
