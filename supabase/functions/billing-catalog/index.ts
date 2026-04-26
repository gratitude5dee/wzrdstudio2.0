import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import { getBillingMode } from '../_shared/billing.ts';

const FALLBACK_PLANS = [
  {
    plan_code: 'free',
    display_name: 'Free',
    description: 'Get started with 100 credits per month.',
    monthly_price_cents: 0,
    yearly_price_cents: null,
    monthly_quota: 100,
    rollover_cap: 0,
    stripe_price_monthly_id: null,
    stripe_price_yearly_id: null,
    metadata: null,
    sort_order: 0,
  },
  {
    plan_code: 'pro',
    display_name: 'Pro',
    description: 'For independent creators and small teams.',
    monthly_price_cents: 4900,
    yearly_price_cents: 46800,
    monthly_quota: 2000,
    rollover_cap: 2000,
    stripe_price_monthly_id: null,
    stripe_price_yearly_id: null,
    metadata: null,
    sort_order: 1,
  },
  {
    plan_code: 'business',
    display_name: 'Business',
    description: 'For larger teams with heavier generation volume.',
    monthly_price_cents: 14900,
    yearly_price_cents: 142800,
    monthly_quota: 10000,
    rollover_cap: 10000,
    stripe_price_monthly_id: null,
    stripe_price_yearly_id: null,
    metadata: null,
    sort_order: 2,
  },
];

const FALLBACK_PACKS = [
  { pack_code: 'pack_500', display_name: '500 Credits', credits: 500, price_cents: 999, stripe_price_id: null, metadata: null, sort_order: 0 },
  { pack_code: 'pack_2000', display_name: '2,000 Credits', credits: 2000, price_cents: 2999, stripe_price_id: null, metadata: null, sort_order: 1 },
  { pack_code: 'pack_5000', display_name: '5,000 Credits', credits: 5000, price_cents: 5999, stripe_price_id: null, metadata: null, sort_order: 2 },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const user = await authenticateRequest(req.headers);
    const mode = getBillingMode();

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    let plans = FALLBACK_PLANS;
    let packs = FALLBACK_PACKS;

    try {
      const { data: dbPlans, error: plansError } = await userClient
        .from('billing_plans')
        .select('plan_code, display_name, description, monthly_price_cents, yearly_price_cents, monthly_quota, rollover_cap, stripe_price_monthly_id, stripe_price_yearly_id, metadata, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!plansError && dbPlans && dbPlans.length > 0) {
        plans = dbPlans;
      }
    } catch (e) {
      console.warn('billing-catalog: plans query failed, using fallback', e);
    }

    try {
      const { data: dbPacks, error: packsError } = await userClient
        .from('billing_credit_packs')
        .select('pack_code, display_name, credits, price_cents, stripe_price_id, metadata, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!packsError && dbPacks && dbPacks.length > 0) {
        packs = dbPacks;
      }
    } catch (e) {
      console.warn('billing-catalog: packs query failed, using fallback', e);
    }

    let subscription = null;
    try {
      const { data } = await userClient
        .from('billing_subscriptions')
        .select('plan_code, status, cancel_at_period_end, current_period_start, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle();
      subscription = data;
    } catch (e) {
      console.warn('billing-catalog: subscription query failed', e);
    }

    let walletBalance = null;
    try {
      const { data: balance, error: balanceError } = await (userClient as any).rpc('credits_get_balance');
      if (!balanceError) {
        walletBalance = balance;
      }
    } catch (e) {
      console.warn('billing-catalog: balance query failed', e);
    }

    return successResponse({
      success: true,
      billing_mode: mode,
      checkout_available: mode !== 'disabled',
      plans,
      credit_packs: packs,
      subscription: subscription || null,
      wallet: walletBalance?.wallet ?? null,
      plan: walletBalance?.plan ?? null,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(message, 500);
  }
});
