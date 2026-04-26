
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer;
  v_used integer;
  v_available integer;
BEGIN
  -- Lock the row to prevent concurrent modifications
  SELECT total_credits, used_credits
  INTO v_total, v_used
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No credit record found for user %', p_user_id;
  END IF;

  v_available := v_total - v_used;

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits: required=%, available=%', p_amount, v_available;
  END IF;

  UPDATE user_credits
  SET used_credits = used_credits + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_available - p_amount;
END;
$$;
