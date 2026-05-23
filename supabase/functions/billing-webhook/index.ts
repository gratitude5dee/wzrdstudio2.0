import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import {
  ensureStripeKeyAllowed,
  getBillingMode,
  verifyStripeWebhookSignature,
} from '../_shared/billing.ts';

type StripeEvent = {
  id: string;
  type: string;
  livemode?: boolean;
  data?: { object?: Record<string, unknown> };
  created?: number;
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asTimestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed * 1000).toISOString();
    }
  }
  return null;
}

function normalizeSubscriptionStatus(value: string | null): string {
  const status = (value || '').toLowerCase();
  const allowed = new Set([
    'trialing',
    'active',
    'past_due',
    'canceled',
    'incomplete',
    'unpaid',
    'paused',
  ]);
  if (allowed.has(status)) return status;
  return 'active';
}

async function resolveUserIdForCustomer(serviceClient: any, stripeCustomerId: string): Promise<string | null> {
  const { data: subMatch } = await serviceClient
    .from('billing_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .limit(1)
    .maybeSingle();

  if (subMatch?.user_id) return subMatch.user_id;

  const { data: checkoutMatch } = await serviceClient
    .from('billing_checkout_sessions')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return checkoutMatch?.user_id ?? null;
}

async function resolvePlanCodeForCustomer(serviceClient: any, stripeCustomerId: string): Promise<string | null> {
  const { data: subMatch } = await serviceClient
    .from('billing_subscriptions')
    .select('plan_code')
    .eq('stripe_customer_id', stripeCustomerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subMatch?.plan_code) return subMatch.plan_code;

  const { data: checkoutMatch } = await serviceClient
    .from('billing_checkout_sessions')
    .select('plan_code')
    .eq('stripe_customer_id', stripeCustomerId)
    .eq('checkout_mode', 'subscription')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return checkoutMatch?.plan_code ?? null;
}

async function syncWalletPlan(serviceClient: any, userId: string, planCode: string): Promise<void> {
  const { data: plan } = await serviceClient
    .from('billing_plans')
    .select('monthly_quota')
    .eq('plan_code', planCode)
    .limit(1)
    .maybeSingle();

  if (!plan || typeof plan.monthly_quota !== 'number') {
    return;
  }

  const { data: existingWallet } = await serviceClient
    .from('credit_wallets')
    .select('user_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existingWallet?.user_id) {
    await serviceClient
      .from('credit_wallets')
      .update({
        plan_code: planCode,
        monthly_quota: plan.monthly_quota,
      })
      .eq('user_id', userId);
    return;
  }

  await serviceClient.from('credit_wallets').insert({
    user_id: userId,
    plan_code: planCode,
    monthly_quota: plan.monthly_quota,
    monthly_remaining: plan.monthly_quota,
    rollover_remaining: 0,
    topup_remaining: 0,
    reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

async function upsertSubscription(
  serviceClient: any,
  input: {
    userId: string;
    planCode: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await serviceClient.from('billing_subscriptions').upsert(
    {
      user_id: input.userId,
      plan_code: input.planCode,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
      status: normalizeSubscriptionStatus(input.status),
      current_period_start: input.currentPeriodStart,
      current_period_end: input.currentPeriodEnd,
      cancel_at_period_end: input.cancelAtPeriodEnd,
      metadata: input.metadata,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(`Failed to upsert billing subscription: ${error.message}`);
  }
}

async function handleCheckoutCompleted(serviceClient: any, event: StripeEvent): Promise<void> {
  const payload = asObject(event.data?.object);
  const metadata = asObject(payload.metadata);

  const stripeSessionId = asString(payload.id);
  if (!stripeSessionId) {
    return;
  }

  const paymentIntentId = asString(payload.payment_intent);
  const stripeCustomerId = asString(payload.customer);
  const stripeSubscriptionId = asString(payload.subscription);

  const checkoutMode = asString(metadata.checkout_mode) || (payload.mode === 'subscription' ? 'subscription' : 'pack');

  const { data: existingSession } = await serviceClient
    .from('billing_checkout_sessions')
    .select('user_id, plan_code, pack_code')
    .eq('stripe_session_id', stripeSessionId)
    .limit(1)
    .maybeSingle();

  const userId = asString(metadata.user_id) || asString(payload.client_reference_id) || existingSession?.user_id || null;
  const packCode = asString(metadata.pack_code) || existingSession?.pack_code || null;
  const planCode = asString(metadata.plan_code) || existingSession?.plan_code || null;

  const { error: sessionUpdateError } = await serviceClient
    .from('billing_checkout_sessions')
    .update({
      status: 'completed',
      stripe_payment_intent_id: paymentIntentId,
      stripe_customer_id: stripeCustomerId,
      metadata: {
        stripe_event_id: event.id,
        stripe_event_type: event.type,
        completed_at: new Date().toISOString(),
      },
    })
    .eq('stripe_session_id', stripeSessionId);

  if (sessionUpdateError) {
    throw new Error(`Failed to update checkout session: ${sessionUpdateError.message}`);
  }

  if (checkoutMode === 'pack' && userId && packCode) {
    const { error: grantError } = await serviceClient.rpc('credits_grant_topup', {
      p_user_id: userId,
      p_pack_code: packCode,
      external_ref: event.id,
      metadata: {
        source: 'stripe_webhook',
        event_id: event.id,
        session_id: stripeSessionId,
        pack_code: packCode,
      },
    });

    if (grantError) {
      throw new Error(`Failed to grant top-up credits: ${grantError.message}`);
    }
  }

  if (checkoutMode === 'subscription' && userId && stripeSubscriptionId) {
    const normalizedPlanCode = planCode || 'pro';
    await upsertSubscription(serviceClient, {
      userId,
      planCode: normalizedPlanCode,
      stripeCustomerId,
      stripeSubscriptionId,
      status: 'active',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      metadata: {
        source: 'stripe_webhook',
        event_id: event.id,
        event_type: event.type,
      },
    });
    await syncWalletPlan(serviceClient, userId, normalizedPlanCode);
  }
}

async function handleSubscriptionUpdate(serviceClient: any, event: StripeEvent): Promise<void> {
  const subscription = asObject(event.data?.object);
  const metadata = asObject(subscription.metadata);

  const stripeSubscriptionId = asString(subscription.id);
  if (!stripeSubscriptionId) {
    return;
  }

  const stripeCustomerId = asString(subscription.customer);
  const status = normalizeSubscriptionStatus(asString(subscription.status));
  const cancelAtPeriodEnd = asBoolean(subscription.cancel_at_period_end);
  const currentPeriodStart = asTimestamp(subscription.current_period_start);
  const currentPeriodEnd = asTimestamp(subscription.current_period_end);

  const { data: existing } = await serviceClient
    .from('billing_subscriptions')
    .select('user_id, plan_code')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .limit(1)
    .maybeSingle();

  const userId =
    existing?.user_id ||
    (stripeCustomerId ? await resolveUserIdForCustomer(serviceClient, stripeCustomerId) : null);

  if (!userId) {
    return;
  }

  const planCode =
    asString(metadata.plan_code) ||
    existing?.plan_code ||
    (stripeCustomerId ? await resolvePlanCodeForCustomer(serviceClient, stripeCustomerId) : null) ||
    'pro';

  await upsertSubscription(serviceClient, {
    userId,
    planCode,
    stripeCustomerId,
    stripeSubscriptionId,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    metadata: {
      source: 'stripe_webhook',
      event_id: event.id,
      event_type: event.type,
    },
  });

  await syncWalletPlan(serviceClient, userId, planCode);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const mode = getBillingMode();
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (mode === 'disabled') {
      return successResponse({ success: true, ignored: true, reason: 'billing_disabled' });
    }

    const keyCheck = ensureStripeKeyAllowed(mode, stripeKey);
    if (!keyCheck.ok) {
      return errorResponse(keyCheck.message || 'Billing mode is not configured for Stripe', 400);
    }

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      return errorResponse('Stripe webhook secret is not configured', 500);
    }

    const rawBody = await req.text();
    const signatureHeader = req.headers.get('stripe-signature');

    const signatureValid = await verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
    if (!signatureValid) {
      return errorResponse('Invalid Stripe webhook signature', 400);
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      return errorResponse('Invalid webhook payload', 400);
    }

    if (mode === 'test_only' && event.livemode === true) {
      return errorResponse('Live Stripe webhook events are not allowed in test_only mode', 400);
    }

    if (mode === 'live' && event.livemode === false) {
      return errorResponse('Test Stripe webhook events are not allowed in live mode', 400);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(serviceClient, event);
        break;

      case 'checkout.session.expired': {
        const payload = asObject(event.data?.object);
        const stripeSessionId = asString(payload.id);
        if (stripeSessionId) {
          await serviceClient
            .from('billing_checkout_sessions')
            .update({
              status: 'expired',
              metadata: {
                stripe_event_id: event.id,
                stripe_event_type: event.type,
                expired_at: new Date().toISOString(),
              },
            })
            .eq('stripe_session_id', stripeSessionId);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const payload = asObject(event.data?.object);
        const paymentIntentId = asString(payload.id);
        if (paymentIntentId) {
          await serviceClient
            .from('billing_checkout_sessions')
            .update({
              status: 'failed',
              metadata: {
                stripe_event_id: event.id,
                stripe_event_type: event.type,
                failed_at: new Date().toISOString(),
              },
            })
            .eq('stripe_payment_intent_id', paymentIntentId);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdate(serviceClient, event);
        break;

      default:
        break;
    }

    return successResponse({
      success: true,
      received: true,
      event_id: event.id,
      event_type: event.type,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(message, 500);
  }
});
