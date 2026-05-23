import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import { ensureStripeKeyAllowed, getBillingMode, stripeRequest } from '../_shared/billing.ts';

interface PortalRequest {
  return_url?: string;
}

function getDefaultReturnUrl(req: Request): string {
  const origin = req.headers.get('origin') || 'http://localhost:8080';
  return `${origin}/settings/billing`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const user = await authenticateRequest(req.headers);
    const body = ((await req.json().catch(() => ({}))) || {}) as PortalRequest;

    const mode = getBillingMode();
    if (mode === 'disabled') {
      return successResponse({
        success: false,
        billing_mode: mode,
        portal_available: false,
        message: 'Customer portal unavailable',
      }, 200);
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const keyCheck = ensureStripeKeyAllowed(mode, stripeKey);
    if (!keyCheck.ok) {
      return errorResponse(keyCheck.message || 'Customer portal unavailable', 400);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    let stripeCustomerId: string | null = null;

    const { data: subscription } = await serviceClient
      .from('billing_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscription?.stripe_customer_id) {
      stripeCustomerId = subscription.stripe_customer_id;
    }

    if (!stripeCustomerId) {
      const { data: checkoutSession } = await serviceClient
        .from('billing_checkout_sessions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .not('stripe_customer_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      stripeCustomerId = checkoutSession?.stripe_customer_id ?? null;
    }

    if (!stripeCustomerId) {
      return successResponse({
        success: false,
        billing_mode: mode,
        portal_available: false,
        error: 'no_subscription',
        message: 'No active subscription. Please choose a plan to get started.',
      }, 200);
    }

    const returnUrl = body.return_url || getDefaultReturnUrl(req);

    const portalSession = await stripeRequest(
      stripeKey!,
      'POST',
      '/billing_portal/sessions',
      {
        customer: stripeCustomerId,
        return_url: returnUrl,
      },
    );

    return successResponse({
      success: true,
      billing_mode: mode,
      portal_available: true,
      portal_url: portalSession.url,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(message, 500);
  }
});

