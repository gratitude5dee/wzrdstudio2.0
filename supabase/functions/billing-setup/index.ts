import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import { stripeRequest } from '../_shared/billing.ts';

/**
 * billing-setup
 *
 * One-shot admin edge function that creates Stripe Products + Prices
 * for Pro, Business, and credit packs, then writes the real Price IDs
 * back to billing_plans / billing_credit_packs.
 *
 * Idempotent: skips rows that already have a real (non-placeholder) stripe price ID.
 */

interface ProductSpec {
  name: string;
  description: string;
  mode: 'recurring' | 'one_time';
  unit_amount: number;
  currency: string;
  interval?: string;
  table: 'billing_plans' | 'billing_credit_packs';
  lookup_column: string;
  lookup_value: string;
  price_column: string;
}

const PRODUCTS: ProductSpec[] = [
  {
    name: 'WZRD Studio Pro (Monthly)',
    description: 'Pro plan — 2,000 monthly credits for independent creators.',
    mode: 'recurring',
    unit_amount: 4900,
    currency: 'usd',
    interval: 'month',
    table: 'billing_plans',
    lookup_column: 'plan_code',
    lookup_value: 'pro',
    price_column: 'stripe_price_monthly_id',
  },
  {
    name: 'WZRD Studio Business (Monthly)',
    description: 'Business plan — 10,000 monthly credits for teams.',
    mode: 'recurring',
    unit_amount: 14900,
    currency: 'usd',
    interval: 'month',
    table: 'billing_plans',
    lookup_column: 'plan_code',
    lookup_value: 'business',
    price_column: 'stripe_price_monthly_id',
  },
  {
    name: 'WZRD Studio — 500 Credit Pack',
    description: 'One-time top-up: 500 generative credits.',
    mode: 'one_time',
    unit_amount: 5000,
    currency: 'usd',
    table: 'billing_credit_packs',
    lookup_column: 'pack_code',
    lookup_value: 'pack_500',
    price_column: 'stripe_price_id',
  },
  {
    name: 'WZRD Studio — 2,000 Credit Pack',
    description: 'One-time top-up: 2,000 generative credits.',
    mode: 'one_time',
    unit_amount: 18000,
    currency: 'usd',
    table: 'billing_credit_packs',
    lookup_column: 'pack_code',
    lookup_value: 'pack_2000',
    price_column: 'stripe_price_id',
  },
  {
    name: 'WZRD Studio — 5,000 Credit Pack',
    description: 'One-time top-up: 5,000 generative credits.',
    mode: 'one_time',
    unit_amount: 40000,
    currency: 'usd',
    table: 'billing_credit_packs',
    lookup_column: 'pack_code',
    lookup_value: 'pack_5000',
    price_column: 'stripe_price_id',
  },
];

function isPlaceholderOrEmpty(val: string | null | undefined): boolean {
  if (!val) return true;
  return val.includes('REPLACE') || val.trim() === '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  try {
    await authenticateRequest(req.headers);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return errorResponse(
        'STRIPE_SECRET_KEY is not configured. Add it as an edge function secret first.',
        400,
      );
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const results: Record<string, { status: string; stripe_price_id?: string; error?: string }> = {};

    for (const spec of PRODUCTS) {
      const key = `${spec.table}:${spec.lookup_value}`;

      try {
        // 1. Check current value in DB
        const { data: row, error: readErr } = await serviceClient
          .from(spec.table)
          .select(`${spec.lookup_column}, ${spec.price_column}`)
          .eq(spec.lookup_column, spec.lookup_value)
          .maybeSingle();

        if (readErr) {
          results[key] = { status: 'error', error: `DB read failed: ${readErr.message}` };
          continue;
        }

        if (!row) {
          results[key] = { status: 'skipped', error: 'Row not found in database' };
          continue;
        }

        const currentPriceId = (row as Record<string, unknown>)[spec.price_column] as string | null;
        if (!isPlaceholderOrEmpty(currentPriceId)) {
          results[key] = { status: 'already_configured', stripe_price_id: currentPriceId! };
          continue;
        }

        // 2. Create Stripe Product
        const product = await stripeRequest(stripeKey, 'POST', '/products', {
          name: spec.name,
          description: spec.description,
        });

        // 3. Create Stripe Price
        const priceParams: Record<string, string | number | boolean | null | undefined> = {
          product: product.id,
          unit_amount: spec.unit_amount,
          currency: spec.currency,
        };

        if (spec.mode === 'recurring') {
          priceParams['recurring[interval]'] = spec.interval!;
        }

        const price = await stripeRequest(stripeKey, 'POST', '/prices', priceParams);

        // 4. Write back to DB
        const { error: updateErr } = await serviceClient
          .from(spec.table)
          .update({ [spec.price_column]: price.id })
          .eq(spec.lookup_column, spec.lookup_value);

        if (updateErr) {
          results[key] = {
            status: 'stripe_created_db_failed',
            stripe_price_id: price.id,
            error: `Stripe price created (${price.id}) but DB update failed: ${updateErr.message}`,
          };
        } else {
          results[key] = { status: 'created', stripe_price_id: price.id };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results[key] = { status: 'error', error: msg };
      }
    }

    return successResponse({
      success: true,
      message: 'Stripe billing setup complete',
      results,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(message, 500);
  }
});
