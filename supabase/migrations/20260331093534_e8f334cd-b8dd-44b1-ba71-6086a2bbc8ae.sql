
-- 1. Fix token_holders: Remove overly permissive ALL policy, restrict writes to service role
DROP POLICY IF EXISTS "Authenticated users can manage token holders" ON token_holders;
CREATE POLICY "Service role manages token holders" ON token_holders FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 2. Fix user_karma: Remove unrestricted ALL policy, restrict to service role
DROP POLICY IF EXISTS "user_karma_system_update" ON user_karma;
CREATE POLICY "Service role manages user karma" ON user_karma FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 3. Fix mog_rate_limits: Restrict to service role only
DROP POLICY IF EXISTS "Service role can manage rate limits" ON mog_rate_limits;
CREATE POLICY "Service role manages rate limits" ON mog_rate_limits FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 4. Fix content_likes tautological delete: require authenticated + owner check via profile wallet
DROP POLICY IF EXISTS "Users can remove their own likes" ON content_likes;
CREATE POLICY "Users can remove their own likes" ON content_likes FOR DELETE
  USING (
    user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 5. Fix content_bookmarks tautological delete
DROP POLICY IF EXISTS "Users can remove their own bookmarks" ON content_bookmarks;
CREATE POLICY "Users can remove their own bookmarks" ON content_bookmarks FOR DELETE
  USING (
    user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 6. Fix content_comments tautological delete
DROP POLICY IF EXISTS "Users can delete their own comments" ON content_comments;
CREATE POLICY "Users can delete their own comments" ON content_comments FOR DELETE
  USING (
    user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 7. Fix referral_tracking: restrict SELECT to authenticated users viewing their own referrals
DROP POLICY IF EXISTS "Anyone can view referral tracking" ON referral_tracking;
CREATE POLICY "Users can view own referral records" ON referral_tracking FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      referrer_email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR
      referee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
-- Also restrict INSERT to service role (referrals should be system-managed)
DROP POLICY IF EXISTS "Anyone can insert referral tracking" ON referral_tracking;
CREATE POLICY "Service role inserts referral tracking" ON referral_tracking FOR INSERT
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 8. Fix music_entitlements: remove overly broad SELECT, restrict to owner only
DROP POLICY IF EXISTS "Users can view their entitlements" ON music_entitlements;
CREATE POLICY "Users can view their own entitlements" ON music_entitlements FOR SELECT
  USING (auth.uid() = user_id);
-- Fix INSERT to service role only
DROP POLICY IF EXISTS "Service can insert entitlements" ON music_entitlements;
CREATE POLICY "Service role inserts entitlements" ON music_entitlements FOR INSERT
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 9. Fix mrkt_tenants: add explicit policies (RLS enabled but no policies = deny all, make it explicit)
CREATE POLICY "Service role manages tenants" ON mrkt_tenants FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
-- Tenant-scoped read for authenticated users
CREATE POLICY "Tenants can read own record" ON mrkt_tenants FOR SELECT
  USING (id = public.get_mrkt_tenant_id());

-- 10. Fix mog-media storage: add ownership checks
DROP POLICY IF EXISTS "Anyone can upload mog media" ON storage.objects;
CREATE POLICY "Authenticated users upload own mog media" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'mog-media' AND auth.role() = 'authenticated' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Anyone can update mog media" ON storage.objects;
CREATE POLICY "Users can update own mog media" ON storage.objects FOR UPDATE
  USING (bucket_id = 'mog-media' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Anyone can delete mog media" ON storage.objects;
CREATE POLICY "Users can delete own mog media" ON storage.objects FOR DELETE
  USING (bucket_id = 'mog-media' AND (auth.uid())::text = (storage.foldername(name))[1]);
