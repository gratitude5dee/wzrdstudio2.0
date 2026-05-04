
# Fix: IP Vault, Credit System, and Voice Errors

## Root Causes

1. **"Failed to load IP Vault"** — The `ip_vault_items` table doesn't exist in the database. A migration file exists (`20260504143000_create_ip_vault_items.sql`) but was never applied.

2. **"Error fetching credits" (console spam)** — `useCredits.ts` calls `supabase.rpc('credits_get_balance')`, which doesn't exist. On failure it falls back to `ensure_credit_account`, which also doesn't exist. Neither function has a migration.

3. **"Failed to finalize asset"** — This depends on `ip_vault_items` existing (the finalize writes to that table). Fixing #1 fixes this.

4. **"Voice unavailable: failed to send a request to the Edge Function"** — The `realtime-client-secret` edge function exists and is deployed, but no logs indicate it's being hit. This is likely a downstream effect of the app being in an error state from #2 (credit errors firing repeatedly). If it persists after the other fixes, it may be an OpenAI API key issue.

## Plan

### Step 1: Apply the IP Vault migration
Run the existing `20260504143000_create_ip_vault_items.sql` migration to create the `ip_vault_items` table with RLS policies. This fixes both "failed to load IP vault" and "failed to finalize asset."

### Step 2: Fix the credit balance fetch in `useCredits.ts`
The `credits_get_balance` and `ensure_credit_account` RPCs don't exist. Instead of creating new DB functions, fix `useCredits.ts` to use the existing `get_available_credits` RPC and `user_credits` table directly:

- Replace `supabase.rpc('credits_get_balance')` with a direct query to `user_credits` table
- Remove the `ensure_credit_account` fallback call
- Keep the existing wallet/plan state but populate from available data

This stops the console error spam and restores credit display.

### Step 3: Verify voice function
After fixes 1-2, verify the voice error resolves. If not, investigate the `realtime-client-secret` edge function separately.

## Files Changed
- `src/hooks/useCredits.ts` — rewrite `fetchCredits` to use existing DB schema
- New migration — apply ip_vault_items table creation
