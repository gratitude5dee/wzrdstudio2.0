
# Auto-Create Stripe Products via Edge Function

## Overview
Build a `billing-setup` edge function that creates all 5 Stripe Products + Prices (Pro Monthly, Business Monthly, pack_500, pack_2000, pack_5000) and writes the real Price IDs back to `billing_plans` / `billing_credit_packs`. Idempotent — skips rows that already have real Price IDs.

## Prerequisite: STRIPE_SECRET_KEY
The function requires `STRIPE_SECRET_KEY` as an edge function secret. You'll need to add it from the Supabase dashboard (Settings > Edge Functions > Secrets) before calling the function. Get the key from [Stripe Dashboard > API Keys](https://dashboard.stripe.com/apikeys) — use a test key (`sk_test_...`) for test mode.

## 1. New Edge Function: `billing-setup`

**File: `supabase/functions/billing-setup/index.ts`**

- Authenticated endpoint (requires valid JWT)
- Reads `STRIPE_SECRET_KEY` from env, returns 400 if missing
- For each of the 5 products:
  1. Check DB row — if `stripe_price_id` / `stripe_price_monthly_id` is already a real ID (not placeholder/empty), skip
  2. Create a Stripe Product via `POST /v1/products`
  3. Create a Stripe Price via `POST /v1/prices` (recurring for plans, one_time for packs)
  4. Update the DB row with the real Price ID using service role client
- Returns a JSON summary of what was created/skipped/errored
- Uses existing `_shared/billing.ts` `stripeRequest` helper and `_shared/auth.ts` for auth

Product definitions:
| Name | Type | Amount | DB Target |
|------|------|--------|-----------|
| WZRD Studio Pro (Monthly) | recurring/month | $49.00 | billing_plans.pro → stripe_price_monthly_id |
| WZRD Studio Business (Monthly) | recurring/month | $149.00 | billing_plans.business → stripe_price_monthly_id |
| 500 Credit Pack | one_time | $50.00 | billing_credit_packs.pack_500 → stripe_price_id |
| 2,000 Credit Pack | one_time | $180.00 | billing_credit_packs.pack_2000 → stripe_price_id |
| 5,000 Credit Pack | one_time | $400.00 | billing_credit_packs.pack_5000 → stripe_price_id |

## 2. Add Setup Button to Billing Page

**File: `src/pages/SettingsBillingPage.tsx`**

Add a small admin section at the bottom (above the docs card) that shows when any plan/pack has a missing or placeholder Stripe Price ID:
- "Configure Stripe" button that calls `supabase.functions.invoke('billing-setup')`
- Shows loading state while running
- On success, shows toast with summary and refreshes the catalog
- This section auto-hides once all Price IDs are configured

## 3. Deploy and Test

- Deploy the `billing-setup` function
- Call it via curl to verify it works (will fail gracefully if STRIPE_SECRET_KEY isn't set yet)

## Files Changed
- `supabase/functions/billing-setup/index.ts` — new edge function
- `src/pages/SettingsBillingPage.tsx` — add "Configure Stripe" admin section
