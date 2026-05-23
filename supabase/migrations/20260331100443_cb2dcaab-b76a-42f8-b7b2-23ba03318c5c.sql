-- Add user_id to venues for ownership tracking
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Backfill: set existing venues to the user who created the most gigs at that venue
UPDATE public.venues v
SET user_id = (
  SELECT g.user_id FROM public.gigs g WHERE g.venue_id = v.id
  ORDER BY g.created_at ASC LIMIT 1
)
WHERE v.user_id IS NULL;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Authenticated users can insert venues" ON public.venues;
DROP POLICY IF EXISTS "Authenticated users can update venues" ON public.venues;

-- New ownership-scoped INSERT policy
CREATE POLICY "Users can insert own venues" ON public.venues FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- New ownership-scoped UPDATE policy
CREATE POLICY "Users can update own venues" ON public.venues FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add DELETE policy scoped to owner
CREATE POLICY "Users can delete own venues" ON public.venues FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);