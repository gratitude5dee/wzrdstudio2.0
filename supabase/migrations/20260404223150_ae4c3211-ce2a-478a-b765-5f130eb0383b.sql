
-- 1. Fix referral_tracking: create a security definer function to get user email
CREATE OR REPLACE FUNCTION public.get_user_email(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text FROM auth.users WHERE id = p_user_id;
$$;

-- Drop old policy that exposes counterparty emails via auth.users direct query
DROP POLICY IF EXISTS "Users can view own referral records" ON public.referral_tracking;

-- New policy: users see only rows where THEY are the referrer (scoped to own activity only)
CREATE POLICY "Users can view own referral records"
ON public.referral_tracking
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND referrer_email = public.get_user_email(auth.uid())
);

-- 2. Fix mog_posts: remove the unrestricted "true" SELECT policy
DROP POLICY IF EXISTS "Public read access for posts" ON public.mog_posts;

-- 3. Fix waitlist_signups: require authentication for INSERT
DROP POLICY IF EXISTS "Authenticated users can join waitlist" ON public.waitlist_signups;

CREATE POLICY "Authenticated users can join waitlist"
ON public.waitlist_signups
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND char_length(name) >= 1
  AND char_length(name) <= 100
  AND char_length(email) >= 5
  AND char_length(email) <= 254
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
);
