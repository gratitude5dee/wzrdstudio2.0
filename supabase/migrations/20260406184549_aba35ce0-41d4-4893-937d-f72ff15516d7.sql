
-- 1. Fix engagement_payouts: restrict SELECT to own rows
DROP POLICY IF EXISTS "Anyone can view engagement payouts" ON public.engagement_payouts;

CREATE POLICY "Users can view own engagement payouts"
ON public.engagement_payouts
FOR SELECT
TO authenticated
USING (
  creator_wallet IN (
    SELECT wallet_address FROM public.profiles WHERE id = auth.uid()
  )
  OR payer_wallet IN (
    SELECT wallet_address FROM public.profiles WHERE id = auth.uid()
  )
);

-- 2. Fix mog_agent_profiles: replace public SELECT with one excluding api_key_hash
-- Since we can't do column-level security with RLS, drop the permissive public policy
-- and rely on the existing mog_agent_profiles_public view for public reads
DROP POLICY IF EXISTS "Public can view verified agent profiles" ON public.mog_agent_profiles;

-- Add a restricted policy: only the profile owner or service role can SELECT
CREATE POLICY "Owners can view their own agent profiles"
ON public.mog_agent_profiles
FOR SELECT
TO authenticated
USING (
  moltbook_id IN (
    SELECT id::text FROM auth.users WHERE id = auth.uid()
  )
  OR (((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) = 'service_role'::text)
);

-- 3. Fix project-media storage: add user-ownership check to SELECT
DROP POLICY IF EXISTS "Anyone can view project media" ON storage.objects;

CREATE POLICY "Users can view their own project media"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'project-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
