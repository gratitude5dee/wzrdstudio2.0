
# Billing Page Redesign + Stripe Checkout Integration

## Overview
Redesign `/settings/billing` into a premium SaaS billing console with working Stripe Checkout links for Pro, Business, and credit packs. All checkout flows already exist in the backend — this is primarily a frontend redesign + seed data + tests.

## 1. Per-Item Checkout Loading in useBilling

**File: `src/hooks/useBilling.ts`**

Replace the single `isCheckoutLoading` boolean with a `checkoutLoadingId` string that tracks which specific item (plan code or pack code) is currently checking out. This prevents all buttons from showing loading state simultaneously.

- Add `checkoutLoadingId: string | null` state
- Export both `isCheckoutLoading` (derived: `checkoutLoadingId !== null`) for backward compat and `checkoutLoadingId` for per-item UI
- In `startCheckout`, set `checkoutLoadingId` to the pack_code or plan_code before the request, clear on complete

## 2. Billing Page Redesign

**File: `src/pages/SettingsBillingPage.tsx`** — full rewrite

### Checkout query param handling
- On mount, check `?checkout=success` → show success toast + call `fetchCatalog()` to refresh
- On mount, check `?checkout=cancel` → show info toast ("Checkout cancelled")
- Clear query params after handling

### Top summary area
Two cards in a grid:
- **Current Plan card**: plan name, billing mode badge, renewal date, "Manage Subscription" button
- **Credits card**: available credits with progress bar, monthly quota, "Top Up" button

### Plan comparison section (id="plans" for anchor)
Grid of 4 cards: Free, Pro, Business, Enterprise

- **Pro** ($49/mo): 2,000 monthly credits, 2,000 rollover cap, feature bullets (priority generation, advanced models, project sharing)
- **Business** ($149/mo): 10,000 monthly credits, 10,000 rollover cap, feature bullets (everything in Pro + team seats, priority support, custom workflows) — visually marked as "Best Value" with an accent border/badge
- **Free**: current welcome grant description, disabled "Current Plan" button if active
- **Enterprise**: "Contact Sales" CTA

Each card:
- Shows disabled state with tooltip when `!checkoutAvailable` or when the plan's `stripe_price_monthly_id` is missing (from catalog data)
- Shows "Current Plan" label + disabled button for active plan
- Loading spinner only on the specific card being checked out (using `checkoutLoadingId`)
- Calls `startCheckout({ checkout_mode: 'subscription', plan_code, interval: 'month' })`

### Credit packs section
Replace the modal list with a clean 3-card grid layout directly on the page (below plans). Use the 3 preferred packs from catalog or fallback:
- **pack_500**: 500 credits / $50 — show as starter
- **pack_2000**: 2,000 credits / $180 — show as "Best Value" with accent
- **pack_5000**: 5,000 credits / $400 — show as "Max Pack"

Each card shows:
- Credit count, price, effective per-credit cost (e.g., "$0.10/credit → $0.08/credit")
- Buy button with per-item loading state
- Disabled state when checkout unavailable or stripe_price_id missing

### Top-up modal
Keep the dialog for the `?topup=1` / `billing:open-topup` event triggers, but render the same 3 pack cards inside it instead of the long scrollable list.

### Billing docs link
Move to a secondary footer section — subtle card with "Open Docs" link.

### Visual treatment
- Keep the existing dark gradient background
- Use orange accent for "Best Value" highlights
- Zinc-800 borders, zinc-950 card backgrounds
- Proper spacing, consistent heading hierarchy

## 3. Stripe Price ID Seed Migration

**File: `supabase/migrations/[timestamp]_stripe_price_id_placeholders.sql`**

SQL that updates existing `billing_plans` and `billing_credit_packs` rows with placeholder Stripe Price IDs plus clear comments:

```sql
-- Replace these placeholder Price IDs with real ones from your Stripe Dashboard.
-- Stripe > Products > select product > copy Price ID (starts with price_)

UPDATE billing_plans SET stripe_price_monthly_id = 'price_REPLACE_WITH_PRO_MONTHLY'
WHERE plan_code = 'pro' AND (stripe_price_monthly_id IS NULL OR stripe_price_monthly_id = '');

UPDATE billing_plans SET stripe_price_monthly_id = 'price_REPLACE_WITH_BUSINESS_MONTHLY'
WHERE plan_code = 'business' AND (stripe_price_monthly_id IS NULL OR stripe_price_monthly_id = '');

-- Credit packs
UPDATE billing_credit_packs SET stripe_price_id = 'price_REPLACE_WITH_PACK_500'
WHERE pack_code = 'pack_500' AND (stripe_price_id IS NULL OR stripe_price_id = '');

UPDATE billing_credit_packs SET stripe_price_id = 'price_REPLACE_WITH_PACK_2000'
WHERE pack_code = 'pack_2000' AND (stripe_price_id IS NULL OR stripe_price_id = '');

UPDATE billing_credit_packs SET stripe_price_id = 'price_REPLACE_WITH_PACK_5000'
WHERE pack_code = 'pack_5000' AND (stripe_price_id IS NULL OR stripe_price_id = '');
```

Also ensure the 3 preferred packs exist in `billing_credit_packs` if missing:

```sql
INSERT INTO billing_credit_packs (pack_code, display_name, credits, price_cents, is_active, stripe_price_id)
VALUES
  ('pack_500',  '500 Credits',   500,   5000, true, 'price_REPLACE_WITH_PACK_500'),
  ('pack_2000', '2,000 Credits', 2000, 18000, true, 'price_REPLACE_WITH_PACK_2000'),
  ('pack_5000', '5,000 Credits', 5000, 40000, true, 'price_REPLACE_WITH_PACK_5000')
ON CONFLICT (pack_code) DO UPDATE SET
  stripe_price_id = CASE
    WHEN billing_credit_packs.stripe_price_id IS NULL OR billing_credit_packs.stripe_price_id = ''
    THEN EXCLUDED.stripe_price_id
    ELSE billing_credit_packs.stripe_price_id
  END;
```

## 4. Tests

**File: `src/pages/__tests__/SettingsBillingPage.test.tsx`**

Mock `useBilling` and `useCredits` hooks. Test:

1. Pro CTA calls `startCheckout` with `{ checkout_mode: 'subscription', plan_code: 'pro', interval: 'month' }`
2. Business CTA calls `startCheckout` with `{ checkout_mode: 'subscription', plan_code: 'business', interval: 'month' }`
3. Credit pack CTA calls `startCheckout` with `{ checkout_mode: 'pack', pack_code: 'pack_2000' }`
4. When `checkoutAvailable` is false, all checkout buttons are disabled
5. `?checkout=success` query param triggers success toast
6. `?checkout=cancel` query param triggers info toast
7. Current plan button is disabled and labeled "Current Plan"

## Files Changed
- `src/hooks/useBilling.ts` — add `checkoutLoadingId` per-item state
- `src/pages/SettingsBillingPage.tsx` — full redesign
- `supabase/migrations/[timestamp]_stripe_price_id_placeholders.sql` — seed Stripe Price IDs
- `src/pages/__tests__/SettingsBillingPage.test.tsx` — new test file

No edge function changes needed — the existing `billing-checkout` already handles everything correctly. No Stripe secrets in frontend code.
