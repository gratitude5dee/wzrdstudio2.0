
-- Fix credits_commit: remove table-qualified column reference in UPDATE SET
CREATE OR REPLACE FUNCTION public.credits_commit(
  hold_id UUID,
  actual_amount INTEGER DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hold RECORD;
  v_diff INTEGER;
BEGIN
  SELECT * INTO v_hold
  FROM public.credit_holds
  WHERE id = credits_commit.hold_id AND status = 'held'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'hold_not_found');
  END IF;

  IF actual_amount IS NOT NULL AND actual_amount < v_hold.amount THEN
    v_diff := v_hold.amount - actual_amount;
    UPDATE public.user_credits
    SET used_credits = used_credits - v_diff, updated_at = now()
    WHERE user_credits.user_id = v_hold.user_id;

    INSERT INTO public.credit_transactions (user_id, amount, transaction_type, resource_type, metadata)
    VALUES (v_hold.user_id, v_diff, 'refund_partial', v_hold.resource_type,
      jsonb_build_object('hold_id', credits_commit.hold_id, 'original', v_hold.amount, 'actual', actual_amount));
  END IF;

  UPDATE public.credit_holds ch
  SET status = 'committed',
      updated_at = now(),
      metadata = v_hold.metadata || credits_commit.metadata
  WHERE ch.id = credits_commit.hold_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Fix credits_release: remove table-qualified column reference in UPDATE SET
CREATE OR REPLACE FUNCTION public.credits_release(
  hold_id UUID,
  reason TEXT DEFAULT 'cancelled',
  metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hold RECORD;
BEGIN
  SELECT * INTO v_hold
  FROM public.credit_holds
  WHERE id = credits_release.hold_id AND status = 'held'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'hold_not_found');
  END IF;

  UPDATE public.user_credits
  SET used_credits = GREATEST(used_credits - v_hold.amount, 0), updated_at = now()
  WHERE user_credits.user_id = v_hold.user_id;

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, resource_type, metadata)
  VALUES (v_hold.user_id, v_hold.amount, 'release', v_hold.resource_type,
    jsonb_build_object('hold_id', credits_release.hold_id, 'reason', credits_release.reason));

  UPDATE public.credit_holds ch
  SET status = 'released',
      updated_at = now(),
      metadata = v_hold.metadata || credits_release.metadata || jsonb_build_object('release_reason', credits_release.reason)
  WHERE ch.id = credits_release.hold_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
