
-- Fix 1: Replace public SELECT on final-exports with ownership-scoped policy
DROP POLICY IF EXISTS "Anyone can read final-exports" ON storage.objects;
CREATE POLICY "Owner can read final-exports" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'final-exports'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Fix 2: Replace public SELECT on venues with authenticated-only policy
DROP POLICY IF EXISTS "Anyone can view venues" ON public.venues;
CREATE POLICY "Authenticated users can view venues" ON public.venues
  FOR SELECT TO authenticated USING (true);
