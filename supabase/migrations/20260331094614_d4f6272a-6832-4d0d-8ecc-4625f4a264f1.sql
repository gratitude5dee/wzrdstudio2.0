
-- 1. Fix creator_balances: restrict ALL policy to service role
DROP POLICY IF EXISTS "Service role can manage balances" ON creator_balances;
CREATE POLICY "Service role manages balances" ON creator_balances FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 2. Fix kv_store: add service-role-only policy (no user_id column, system table)
CREATE POLICY "Service role manages kv store" ON kv_store_a1c444fa FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
