
-- 1. Fix engagement_payouts: restrict INSERT and UPDATE to service role
DROP POLICY IF EXISTS "Service role can insert payouts" ON engagement_payouts;
CREATE POLICY "Service role inserts payouts" ON engagement_payouts FOR INSERT
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can update payouts" ON engagement_payouts;
CREATE POLICY "Service role updates payouts" ON engagement_payouts FOR UPDATE
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 2. Fix mog_posts: enforce wallet ownership on INSERT
DROP POLICY IF EXISTS "Anyone can create posts" ON mog_posts;
CREATE POLICY "Authenticated users create own posts" ON mog_posts FOR INSERT
  WITH CHECK (
    creator_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 3. Fix mog_comments: enforce wallet ownership on INSERT
DROP POLICY IF EXISTS "Anyone can comment" ON mog_comments;
CREATE POLICY "Authenticated users create own comments" ON mog_comments FOR INSERT
  WITH CHECK (
    user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 4. Fix mog_likes: enforce wallet ownership on INSERT
DROP POLICY IF EXISTS "Anyone can like posts" ON mog_likes;
CREATE POLICY "Authenticated users create own likes" ON mog_likes FOR INSERT
  WITH CHECK (
    user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 5. Fix mog_bookmarks: enforce wallet ownership on INSERT
DROP POLICY IF EXISTS "Anyone can bookmark" ON mog_bookmarks;
CREATE POLICY "Authenticated users create own bookmarks" ON mog_bookmarks FOR INSERT
  WITH CHECK (
    user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 6. Fix mog_follows: enforce wallet ownership on INSERT
DROP POLICY IF EXISTS "Anyone can follow" ON mog_follows;
CREATE POLICY "Authenticated users create own follows" ON mog_follows FOR INSERT
  WITH CHECK (
    follower_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 7. Fix content_likes INSERT: enforce wallet ownership
DROP POLICY IF EXISTS "Authenticated users can like content" ON content_likes;
CREATE POLICY "Authenticated users like with own wallet" ON content_likes FOR INSERT
  WITH CHECK (
    user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 8. Fix content_comments INSERT: enforce wallet ownership
DROP POLICY IF EXISTS "Authenticated users can add comments" ON content_comments;
CREATE POLICY "Authenticated users comment with own wallet" ON content_comments FOR INSERT
  WITH CHECK (
    user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 9. Fix content_bookmarks INSERT: enforce wallet ownership
DROP POLICY IF EXISTS "Authenticated users can bookmark content" ON content_bookmarks;
CREATE POLICY "Authenticated users bookmark with own wallet" ON content_bookmarks FOR INSERT
  WITH CHECK (
    user_wallet = (SELECT wallet_address FROM profiles WHERE id = auth.uid())
  );

-- 10. Fix final-exports storage DELETE: add ownership check
DROP POLICY IF EXISTS "Users can delete own final-exports" ON storage.objects;
CREATE POLICY "Users delete own final-exports" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'final-exports'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
