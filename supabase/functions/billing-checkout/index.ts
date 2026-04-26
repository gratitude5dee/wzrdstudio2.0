import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import { ensureStripeKeyAllowed, getBillingMode, stripeRequest } from '../_shared/billing.ts';

interface CheckoutRequest {
  checkout_mode: 'pack' | 'subscription';
  pack_code?: string;
  plan_code?: string;
  interval?: 'month' | 'year';
  success_url?: string;
  cancel_url?: string;
}

function getDefaultUrl(req: Request, path: string): string {
  const origin = req.headers.get('origin') || 'http://localhost:8080';
  return `${origin}${path}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const user = await authenticateRequest(req.headers);
    const body = (await req.json()) as CheckoutRequest;

    if (!body.checkout_mode || (body.checkout_mode !== 'pack' && body.checkout_mode !== 'subscription')) {
      return errorResponse('checkout_mode must be pack or subscription', 400);
    }

    const mode = getBillingMode();
    if (mode === 'disabled') {
      return successResponse({
        success: false,
        checkout_available: false,
        billing_mode: mode,
        message: 'Checkout unavailable',
      }, 200);
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const keyCheck = ensureStripeKeyAllowed(mode, stripeKey);
    if (!keyCheck.ok) {
      return errorResponse(keyCheck.message || 'Checkout unavailable', 400);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    let amountCents = 0;
    let credits = 0;
    let planCode: string | null = null;
    let packCode: string | null = null;
    let stripePriceId: string | null = null;

    if (body.checkout_mode === 'pack') {
      if (!body.pack_code) {
        return errorResponse('pack_code is required for pack checkout', 400);
      }

      const { data: pack, error: packError } = await serviceClient
        .from('billing_credit_packs')
        .select('pack_code, credits, price_cents, stripe_price_id')
        .eq('pack_code', body.pack_code)
        .eq('is_active', true)
        .single();

      if (packError || !pack) {
        return errorResponse('Invalid credit pack', 400);
      }

      if (!pack.stripe_price_id) {
        return errorResponse('Selected credit pack is not configured for checkout', 400);
      }

      packCode = pack.pack_code;
      amountCents = pack.price_cents;
      credits = pack.credits;
      stripePriceId = pack.stripe_price_id;
    } else {
      if (!body.plan_code) {
        return errorResponse('plan_code is required for subscription checkout', 400);
      }

      const { data: plan, error: planError } = await serviceClient
        .from('billing_plans')
        .select('plan_code, monthly_price_cents, yearly_price_cents, stripe_price_monthly_id, stripe_price_yearly_id')
        .eq('plan_code', body.plan_code)
        .eq('is_active', true)
        .single();

      if (planError || !plan) {
        return errorResponse('Invalid billing plan', 400);
      }

      const interval = body.interval === 'year' ? 'year' : 'month';
      stripePriceId = interval === 'year' ? plan.stripe_price_yearly_id : plan.stripe_price_monthly_id;
      if (!stripePriceId) {
        return errorResponse('Selected plan is not configured for checkout', 400);
      }

      planCode = plan.plan_code;
      amountCents = interval === 'year' ? (plan.yearly_price_cents || 0) : plan.monthly_price_cents;
    }

    const successUrl = body.success_url || getDefaultUrl(req, '/settings/billing?checkout=success');
    const cancelUrl = body.cancel_url || getDefaultUrl(req, '/settings/billing?checkout=cancel');

    const stripeSession = await stripeRequest(
      stripeKey!,
      'POST',
      '/checkout/sessions',
      {
        mode: body.checkout_mode === 'pack' ? 'payment' : 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: user.id,
        'line_items[0][price]': stripePriceId!,
        'line_items[0][quantity]': 1,
        'metadata[user_id]': user.id,
        'metadata[checkout_mode]': body.checkout_mode,
        'metadata[pack_code]': packCode,
        'metadata[plan_code]': planCode,
      },
    );

    const { error: insertError } = await serviceClient
      .from('billing_checkout_sessions')
      .insert({
        user_id: user.id,
        checkout_mode: body.checkout_mode,
        plan_code: planCode,
        pack_code: packCode,
        amount_cents: amountCents,
        credits,
        stripe_session_id: stripeSession.id,
        stripe_payment_intent_id: stripeSession.payment_intent || null,
        stripe_customer_id: stripeSession.customer || null,
        status: 'created',
        metadata: {
          success_url: successUrl,
          cancel_url: cancelUrl,
          billing_mode: mode,
        },
      });

    if (insertError) {
      throw insertError;
    }

    return successResponse({
      success: true,
      billing_mode: mode,
      checkout_mode: body.checkout_mode,
      session_id: stripeSession.id,
      checkout_url: stripeSession.url,
      status: 'created',
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(message, 500);
  }
});
