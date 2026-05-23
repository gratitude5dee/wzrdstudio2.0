
-- ============================================================
-- Billing Tables
-- ============================================================

-- 1. billing_plans
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  yearly_price_cents INTEGER,
  monthly_quota INTEGER NOT NULL DEFAULT 0,
  rollover_cap INTEGER NOT NULL DEFAULT 0,
  stripe_price_monthly_id TEXT,
  stripe_price_yearly_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active billing plans"
  ON public.billing_plans FOR SELECT TO authenticated
  USING (is_active = true);

-- 2. billing_credit_packs
CREATE TABLE IF NOT EXISTS public.billing_credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  stripe_price_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active credit packs"
  ON public.billing_credit_packs FOR SELECT TO authenticated
  USING (is_active = true);

-- 3. billing_subscriptions
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES public.billing_plans(plan_code),
  status TEXT NOT NULL DEFAULT 'active',
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own subscription"
  ON public.billing_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 4. billing_checkout_sessions
CREATE TABLE IF NOT EXISTS public.billing_checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkout_mode TEXT NOT NULL,
  plan_code TEXT,
  pack_code TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_checkout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own checkout sessions"
  ON public.billing_checkout_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Timestamp triggers
CREATE TRIGGER update_billing_plans_updated_at
  BEFORE UPDATE ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_billing_credit_packs_updated_at
  BEFORE UPDATE ON public.billing_credit_packs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_billing_subscriptions_updated_at
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_billing_checkout_sessions_updated_at
  BEFORE UPDATE ON public.billing_checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- Seed Data
-- ============================================================
-- Replace placeholder Stripe Price IDs with real ones from
-- your Stripe Dashboard before enabling live checkout.
-- Stripe > Products > select product > copy Price ID (price_...)

INSERT INTO public.billing_plans (plan_code, display_name, description, monthly_price_cents, yearly_price_cents, monthly_quota, rollover_cap, sort_order)
VALUES
  ('free',       'Free',       'One-time 100-credit welcome grant. Top up or upgrade when credits run out.', 0,     NULL,   0,     0,     0),
  ('pro',        'Pro',        'For independent creators and small teams.',                                  4900,  46800,  2000,  2000,  1),
  ('business',   'Business',   'For larger teams with heavier generation volume.',                           14900, 142800, 10000, 10000, 2),
  ('enterprise', 'Enterprise', 'Custom billing, governance, and support.',                                   0,     NULL,   0,     0,     3)
ON CONFLICT (plan_code) DO NOTHING;

-- Set placeholder Stripe Price IDs (only if currently empty)
UPDATE public.billing_plans SET stripe_price_monthly_id = 'price_REPLACE_WITH_PRO_MONTHLY'
WHERE plan_code = 'pro' AND (stripe_price_monthly_id IS NULL OR stripe_price_monthly_id = '');

UPDATE public.billing_plans SET stripe_price_monthly_id = 'price_REPLACE_WITH_BUSINESS_MONTHLY'
WHERE plan_code = 'business' AND (stripe_price_monthly_id IS NULL OR stripe_price_monthly_id = '');

INSERT INTO public.billing_credit_packs (pack_code, display_name, credits, price_cents, is_active, sort_order, stripe_price_id)
VALUES
  ('pack_500',  '500 Credits',   500,  5000,  true, 0, 'price_REPLACE_WITH_PACK_500'),
  ('pack_2000', '2,000 Credits', 2000, 18000, true, 1, 'price_REPLACE_WITH_PACK_2000'),
  ('pack_5000', '5,000 Credits', 5000, 40000, true, 2, 'price_REPLACE_WITH_PACK_5000')
ON CONFLICT (pack_code) DO UPDATE SET
  stripe_price_id = CASE
    WHEN billing_credit_packs.stripe_price_id IS NULL OR billing_credit_packs.stripe_price_id = ''
    THEN EXCLUDED.stripe_price_id
    ELSE billing_credit_packs.stripe_price_id
  END,
  is_active = true;

NOTIFY pgrst, 'reload schema';
