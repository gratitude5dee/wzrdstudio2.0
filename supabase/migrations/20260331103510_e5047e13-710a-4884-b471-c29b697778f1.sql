-- 1. Create a safe view for mrkt_tenants that excludes admin_token_hash
CREATE OR REPLACE VIEW public.mrkt_tenants_safe
WITH (security_invoker = on)
AS
SELECT id, name, subdomain, config, status, created_at, updated_at
FROM public.mrkt_tenants;

GRANT SELECT ON public.mrkt_tenants_safe TO authenticated;

-- 2. Fix content_bookmarks SELECT policy to restrict to own bookmarks
DROP POLICY IF EXISTS "Users can view their own bookmarks" ON public.content_bookmarks;
CREATE POLICY "Users can view their own bookmarks" ON public.content_bookmarks
  FOR SELECT
  USING (
    user_wallet = (SELECT profiles.wallet_address FROM profiles WHERE profiles.id = auth.uid())
  );