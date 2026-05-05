
-- Table to track credit holds
CREATE TABLE IF NOT EXISTS public.credit_holds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  resource_type TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'committed', 'released')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own holds"
  ON public.credit_holds FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_credit_holds_user_status ON public.credit_holds (user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_holds_idempotency ON public.credit_holds (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- credits_reserve: place a hold on credits
CREATE OR REPLACE FUNCTION public.credits_reserve(
  resource_type TEXT,
  requested_amount INTEGER,
  reference_type TEXT DEFAULT NULL,
  reference_id TEXT DEFAULT NULL,
  idempotency_key TEXT DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_total INTEGER;
  v_used INTEGER;
  v_available INTEGER;
  v_hold_id UUID;
  v_existing_hold_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    -- Check metadata for user_id (service-role calls)
    v_user_id := (metadata->>'user_id')::UUID;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
  END IF;

  -- Idempotency check
  IF idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_hold_id
    FROM public.credit_holds
    WHERE credit_holds.idempotency_key = credits_reserve.idempotency_key
      AND status = 'held';
    IF FOUND THEN
      SELECT GREATEST(COALESCE(uc.total_credits, 0) - COALESCE(uc.used_credits, 0), 0)
      INTO v_available
      FROM public.user_credits uc WHERE uc.user_id = v_user_id;

      RETURN jsonb_build_object(
        'success', true,
        'hold_id', v_existing_hold_id,
        'available_after', COALESCE(v_available, 0)
      );
    END IF;
  END IF;

  -- Lock and check balance
  SELECT total_credits, used_credits
  INTO v_total, v_used
  FROM public.user_credits
  WHERE user_credits.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-create credit account
    INSERT INTO public.user_credits (user_id, total_credits, used_credits)
    VALUES (v_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_total := 0;
    v_used := 0;
  END IF;

  v_available := COALESCE(v_total, 0) - COALESCE(v_used, 0);

  IF v_available < requested_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'insufficient_credits',
      'available', v_available,
      'required', requested_amount
    );
  END IF;

  -- Deduct credits
  UPDATE public.user_credits
  SET used_credits = used_credits + requested_amount, updated_at = now()
  WHERE user_credits.user_id = v_user_id;

  -- Create hold record
  INSERT INTO public.credit_holds (user_id, amount, resource_type, reference_type, reference_id, idempotency_key, metadata, status)
  VALUES (v_user_id, requested_amount, credits_reserve.resource_type, credits_reserve.reference_type, credits_reserve.reference_id, credits_reserve.idempotency_key, credits_reserve.metadata, 'held')
  RETURNING id INTO v_hold_id;

  -- Record transaction
  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, resource_type, metadata)
  VALUES (v_user_id, -requested_amount, 'hold', credits_reserve.resource_type,
    jsonb_build_object('hold_id', v_hold_id, 'reference_type', credits_reserve.reference_type, 'reference_id', credits_reserve.reference_id));

  v_available := v_available - requested_amount;

  RETURN jsonb_build_object(
    'success', true,
    'hold_id', v_hold_id,
    'available_after', v_available
  );
END;
$$;

-- credits_commit: finalize a held amount
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
  WHERE id = hold_id AND status = 'held'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'hold_not_found');
  END IF;

  -- If actual_amount provided and differs, refund the difference
  IF actual_amount IS NOT NULL AND actual_amount < v_hold.amount THEN
    v_diff := v_hold.amount - actual_amount;
    UPDATE public.user_credits
    SET used_credits = used_credits - v_diff, updated_at = now()
    WHERE user_credits.user_id = v_hold.user_id;

    INSERT INTO public.credit_transactions (user_id, amount, transaction_type, resource_type, metadata)
    VALUES (v_hold.user_id, v_diff, 'refund_partial', v_hold.resource_type,
      jsonb_build_object('hold_id', hold_id, 'original', v_hold.amount, 'actual', actual_amount));
  END IF;

  UPDATE public.credit_holds
  SET status = 'committed', updated_at = now(),
      credit_holds.metadata = v_hold.metadata || credits_commit.metadata
  WHERE id = hold_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- credits_release: cancel a hold and refund
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
  WHERE id = hold_id AND status = 'held'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'hold_not_found');
  END IF;

  -- Refund credits
  UPDATE public.user_credits
  SET used_credits = GREATEST(used_credits - v_hold.amount, 0), updated_at = now()
  WHERE user_credits.user_id = v_hold.user_id;

  -- Record refund transaction
  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, resource_type, metadata)
  VALUES (v_hold.user_id, v_hold.amount, 'release', v_hold.resource_type,
    jsonb_build_object('hold_id', hold_id, 'reason', reason));

  UPDATE public.credit_holds
  SET status = 'released', updated_at = now(),
      credit_holds.metadata = v_hold.metadata || credits_release.metadata || jsonb_build_object('release_reason', reason)
  WHERE id = hold_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
