## Root Cause

Wallet signup fails with `500 Database error creating new user`. Auth logs show:

```
duplicate key value violates unique constraint "user_credits_user_id_key" (SQLSTATE 23505)
```

Two triggers race to insert into `public.user_credits` inside the same signup transaction:

| Trigger | Table | Function | What it inserts |
|---|---|---|---|
| `on_auth_user_created_credits` | `auth.users` | `handle_new_user_credits()` | empty row (default 0 credits) |
| `on_profile_created_grant_credits` | `public.profiles` | `grant_free_credits()` | row with 100 credits + logs welcome bonus |

Order in the transaction:
1. `auth.users` insert
2. `handle_new_user()` runs → inserts into `profiles` → fires `grant_free_credits()` → inserts user_credits row ✅
3. `handle_new_user_credits()` then runs on the same `auth.users` insert → tries to insert again → **23505** → transaction aborts → user never created → edge function 500

`grant_free_credits` is the correct one (matches `bootstrap_wallet_user` expectations and grants the welcome bonus). `handle_new_user_credits` is leftover legacy code.

## Fix

Single migration:

1. **Drop the redundant trigger** `on_auth_user_created_credits` from `auth.users`.
2. **Drop the now-unused function** `public.handle_new_user_credits()`.
3. Keep `grant_free_credits()` and `handle_new_user()` exactly as they are — they already use `ON CONFLICT DO NOTHING` and are idempotent.
4. Backfill safety: any existing user without a `user_credits` row gets one (defensive — should be none, but cheap).

```sql
DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_credits();

INSERT INTO public.user_credits (user_id, total_credits)
SELECT u.id, 0
FROM auth.users u
LEFT JOIN public.user_credits c ON c.user_id = u.id
WHERE c.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
```

## Verification

After the migration:
- Sign up with a fresh wallet → `auth.users` row created, `profiles` row created, `user_credits` row with 100, `credit_transactions` welcome row.
- `wallet-auth` edge function returns 200 with a session.
- `bootstrap_wallet_user` (called next) is a no-op for credits (welcome already granted) and just sets `wallet_address`.

## Why no edge-function code change is needed

`wallet-auth/index.ts` already correctly:
- Uses service-role for `admin.createUser`
- Calls `bootstrap_wallet_user` which is idempotent (`ON CONFLICT`, guard on existing welcome transaction)
- Returns proper CORS headers

The bug is 100% database-side. Removing the duplicate trigger fixes it.

## Files touched

- New migration: `supabase/migrations/<ts>_drop_redundant_user_credits_trigger.sql`

No frontend or edge function changes.