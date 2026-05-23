
-- Fix: make the view use invoker security instead of definer
ALTER VIEW public.mog_agent_profiles_public SET (security_invoker = on);
