
-- Fix mog_likes: let users delete their own likes
DROP POLICY IF EXISTS "Users can delete own likes" ON public.mog_likes;
CREATE POLICY "Users can delete own likes" ON public.mog_likes
  FOR DELETE TO authenticated
  USING (user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid()));

-- Fix mog_bookmarks: let users delete their own bookmarks
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON public.mog_bookmarks;
CREATE POLICY "Users can delete own bookmarks" ON public.mog_bookmarks
  FOR DELETE TO authenticated
  USING (user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid()));

-- Fix mog_comments: let users delete/update their own comments
DROP POLICY IF EXISTS "Users can delete own comments" ON public.mog_comments;
CREATE POLICY "Users can delete own comments" ON public.mog_comments
  FOR DELETE TO authenticated
  USING (user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update comment likes" ON public.mog_comments;
CREATE POLICY "Users can update own comments" ON public.mog_comments
  FOR UPDATE TO authenticated
  USING (user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid()))
  WITH CHECK (user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid()));

-- Fix mog_follows: let users unfollow
DROP POLICY IF EXISTS "Users can unfollow" ON public.mog_follows;
CREATE POLICY "Users can unfollow" ON public.mog_follows
  FOR DELETE TO authenticated
  USING (follower_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid()));

-- Fix mog_posts: let creators delete/update their own posts
DROP POLICY IF EXISTS "Creators can delete own posts" ON public.mog_posts;
CREATE POLICY "Creators can delete own posts" ON public.mog_posts
  FOR DELETE TO authenticated
  USING (creator_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Creators can update own posts" ON public.mog_posts;
CREATE POLICY "Creators can update own posts" ON public.mog_posts
  FOR UPDATE TO authenticated
  USING (creator_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid()))
  WITH CHECK (creator_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid()));

-- Fix venues: scope SELECT to owner only
DROP POLICY IF EXISTS "Authenticated users can view venues" ON public.venues;
CREATE POLICY "Users can view own venues" ON public.venues
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
