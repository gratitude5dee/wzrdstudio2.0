-- Harden credit provisioning and zero-balance generation gates.
-- Free accounts receive a one-time welcome grant; recurring quota starts at 0.

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- Catalog defaults
-- --------------------------------------------------------------------------
insert into public.billing_plans (
  plan_code,
  display_name,
  description,
  monthly_price_cents,
  yearly_price_cents,
  monthly_quota,
  rollover_cap,
  is_active,
  sort_order,
  metadata
)
values (
  'free',
  'Free',
  'One-time 100-credit welcome grant. Add credits or upgrade when the balance reaches zero.',
  0,
  null,
  0,
  0,
  true,
  0,
  '{"cta":"start_free","welcome_credits":100,"recurring_quota":false}'::jsonb
)
on conflict (plan_code) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  yearly_price_cents = excluded.yearly_price_cents,
  monthly_quota = excluded.monthly_quota,
  rollover_cap = excluded.rollover_cap,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  metadata = coalesce(public.billing_plans.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

alter table public.credit_wallets
  alter column plan_code set default 'free',
  alter column monthly_quota set default 0,
  alter column monthly_remaining set default 0;

-- Any catalog rows still marked free should consume at least one credit so
-- provider calls can be blocked consistently at zero balance.
do $$
begin
  if to_regclass('public.ai_model_catalog') is not null then
    update public.ai_model_catalog
    set credits = 1
    where coalesce(credits, 0) <= 0
      and (
        provider in ('gmi-cloud', 'gmi', 'fal-ai', 'fal.ai')
        or id like 'gmi/%'
        or id like 'fal-ai/%'
      );
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- Public table access: clients can read their own rows; writes go through RPCs.
-- --------------------------------------------------------------------------
alter table public.user_credits enable row level security;
alter table public.credit_transactions enable row level security;

drop policy if exists user_credits_select_own on public.user_credits;
create policy user_credits_select_own
on public.user_credits
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists credit_transactions_select_own on public.credit_transactions;
create policy credit_transactions_select_own
on public.credit_transactions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.user_credits from anon, authenticated;
revoke insert, update, delete on public.credit_transactions from anon, authenticated;
grant select on public.user_credits to authenticated;
grant select on public.credit_transactions to authenticated;

-- Remove the profile-side legacy grant trigger so all provisioning flows through
-- ensure_credit_account.
drop trigger if exists on_profile_created_grant_credits on public.profiles;
drop function if exists public.grant_free_credits();

-- --------------------------------------------------------------------------
-- Wallet/account bootstrap
-- --------------------------------------------------------------------------
create or replace function public._credits_ensure_wallet(p_user_id uuid)
returns public.credit_wallets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.credit_wallets;
  v_plan_code text := 'free';
  v_monthly_quota integer := 0;
  v_reset_at timestamptz := now() + interval '1 month';
  v_legacy_available numeric(12,2) := 0;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  select * into v_wallet
  from public.credit_wallets
  where user_id = p_user_id;

  if found then
    return v_wallet;
  end if;

  select coalesce(bs.plan_code, 'free'), coalesce(bs.current_period_end, now() + interval '1 month')
  into v_plan_code, v_reset_at
  from public.billing_subscriptions bs
  where bs.user_id = p_user_id
    and bs.status in ('trialing', 'active')
  limit 1;

  select coalesce(bp.monthly_quota, 0)
  into v_monthly_quota
  from public.billing_plans bp
  where bp.plan_code = v_plan_code
  limit 1;

  select greatest(coalesce(uc.total_credits, 0) - coalesce(uc.used_credits, 0), 0)
  into v_legacy_available
  from public.user_credits uc
  where uc.user_id = p_user_id;

  insert into public.credit_wallets (
    user_id,
    plan_code,
    monthly_quota,
    monthly_remaining,
    rollover_remaining,
    topup_remaining,
    reset_at
  )
  values (
    p_user_id,
    v_plan_code,
    v_monthly_quota,
    case when v_plan_code = 'free' then 0 else v_monthly_quota end,
    0,
    greatest(v_legacy_available, 0),
    v_reset_at
  )
  on conflict (user_id) do nothing;

  select * into v_wallet
  from public.credit_wallets
  where user_id = p_user_id;

  return v_wallet;
end;
$$;

create or replace function public.ensure_credit_account(
  p_user_id uuid default null,
  p_source text default 'repair'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_user_id uuid := coalesce(p_user_id, v_auth_user);
  v_wallet public.credit_wallets;
  v_paid_subscription public.billing_subscriptions;
  v_paid_plan public.billing_plans;
  v_existing_available numeric(12,2) := 0;
  v_available numeric(12,2) := 0;
  v_original_plan_code text;
  v_original_available numeric(12,2) := 0;
  v_has_credit_history boolean := false;
  v_welcome_granted boolean := false;
  v_repaired boolean := false;
  v_target_plan text := 'free';
  v_target_quota integer := 0;
  v_reset_at timestamptz := now() + interval '1 month';
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'user_required');
  end if;

  if v_auth_user is not null and v_user_id <> v_auth_user and coalesce(v_role, '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  insert into public.profiles (id)
  values (v_user_id)
  on conflict (id) do nothing;

  select *
  into v_paid_subscription
  from public.billing_subscriptions
  where user_id = v_user_id
    and status in ('trialing', 'active')
    and plan_code <> 'free'
  order by updated_at desc nulls last
  limit 1;

  if found then
    v_target_plan := v_paid_subscription.plan_code;
    v_reset_at := coalesce(v_paid_subscription.current_period_end, now() + interval '1 month');
  end if;

  select *
  into v_paid_plan
  from public.billing_plans
  where plan_code = v_target_plan
  limit 1;

  v_target_quota := coalesce(v_paid_plan.monthly_quota, 0);

  perform public._credits_ensure_wallet(v_user_id);

  select * into v_wallet
  from public.credit_wallets
  where user_id = v_user_id
  for update;

  v_existing_available := greatest(public._credits_available_total(v_wallet), 0);
  v_original_available := v_existing_available;
  v_original_plan_code := v_wallet.plan_code;

  select exists (
    select 1 from public.credit_ledger cl where cl.user_id = v_user_id
  ) or exists (
    select 1 from public.credit_transactions ct where ct.user_id = v_user_id
  ) or exists (
    select 1
    from public.user_credits uc
    where uc.user_id = v_user_id
      and (coalesce(uc.total_credits, 0) > 0 or coalesce(uc.used_credits, 0) > 0)
  )
  into v_has_credit_history;

  if v_target_plan = 'free' then
    if not v_has_credit_history and v_existing_available <= 0 then
      v_existing_available := 100;
      v_welcome_granted := true;
    end if;

    update public.credit_wallets
    set
      plan_code = 'free',
      monthly_quota = 0,
      monthly_remaining = 0,
      rollover_remaining = 0,
      topup_remaining = v_existing_available,
      reset_at = coalesce(v_wallet.reset_at, v_reset_at),
      metadata = coalesce(v_wallet.metadata, '{}'::jsonb)
        || jsonb_build_object('source', coalesce(p_source, 'repair'), 'free_account_provisioned', true),
      updated_at = now()
    where user_id = v_user_id
    returning * into v_wallet;
  else
    update public.credit_wallets
    set
      plan_code = v_target_plan,
      monthly_quota = v_target_quota,
      monthly_remaining = greatest(monthly_remaining, case when monthly_quota = 0 then v_target_quota else 0 end),
      reset_at = v_reset_at,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('source', coalesce(p_source, 'repair'), 'paid_account_synced', true),
      updated_at = now()
    where user_id = v_user_id
    returning * into v_wallet;
  end if;

  v_available := public._credits_available_total(v_wallet);

  insert into public.user_credits (user_id, total_credits, used_credits)
  values (v_user_id, greatest(ceil(v_available)::integer, 0), 0)
  on conflict (user_id) do update
  set
    total_credits = excluded.total_credits,
    used_credits = 0,
    updated_at = now();

  if v_welcome_granted then
    insert into public.credit_ledger (
      user_id,
      entry_type,
      resource_type,
      delta,
      balance_after,
      reference_type,
      reference_id,
      idempotency_key,
      metadata
    )
    values (
      v_user_id,
      'grant',
      'welcome_credit',
      100,
      v_available,
      'signup_bonus',
      'free_welcome_100',
      'signup_bonus:free_welcome_100',
      jsonb_build_object('source', coalesce(p_source, 'repair'), 'description', 'Welcome bonus - Free plan')
    )
    on conflict do nothing;

    insert into public.credit_transactions (
      user_id,
      amount,
      transaction_type,
      resource_type,
      metadata
    )
    values (
      v_user_id,
      100,
      'free',
      'credit',
      jsonb_build_object('source', coalesce(p_source, 'repair'), 'description', 'Welcome bonus - Free plan')
    );
  end if;

  v_repaired := v_welcome_granted
    or coalesce(v_original_plan_code, '') <> coalesce(v_wallet.plan_code, '')
    or v_original_available <> v_available;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'planCode', v_wallet.plan_code,
    'availableCredits', v_available,
    'welcomeGranted', v_welcome_granted,
    'repaired', v_repaired
  );
end;
$$;

create or replace function public.credits_get_balance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.credit_wallets;
  v_plan public.billing_plans;
  v_available numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_credit_account(v_user_id, 'credits_get_balance');
  perform public.credits_apply_monthly_refresh(v_user_id);

  select * into v_wallet
  from public.credit_wallets
  where user_id = v_user_id;

  select * into v_plan
  from public.billing_plans
  where plan_code = v_wallet.plan_code;

  v_available := public._credits_available_total(v_wallet);

  return jsonb_build_object(
    'success', true,
    'wallet', jsonb_build_object(
      'user_id', v_wallet.user_id,
      'plan_code', v_wallet.plan_code,
      'monthly_quota', v_wallet.monthly_quota,
      'monthly_remaining', v_wallet.monthly_remaining,
      'rollover_remaining', v_wallet.rollover_remaining,
      'topup_remaining', v_wallet.topup_remaining,
      'available_total', v_available,
      'reset_at', v_wallet.reset_at,
      'updated_at', v_wallet.updated_at
    ),
    'plan', case when v_plan.plan_code is not null then jsonb_build_object(
      'plan_code', v_plan.plan_code,
      'display_name', v_plan.display_name,
      'monthly_price_cents', v_plan.monthly_price_cents,
      'yearly_price_cents', v_plan.yearly_price_cents,
      'monthly_quota', v_plan.monthly_quota,
      'rollover_cap', v_plan.rollover_cap,
      'description', v_plan.description
    ) else null end
  );
end;
$$;

create or replace function public.credits_reserve(
  resource_type text,
  requested_amount numeric default 1,
  reference_type text default null,
  reference_id text default null,
  idempotency_key text default null,
  metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_wallet public.credit_wallets;
  v_hold public.credit_holds;
  v_key text := coalesce(nullif(idempotency_key, ''), gen_random_uuid()::text);
  v_requested numeric(12,2) := greatest(ceil(coalesce(requested_amount, 1)), 1);
  v_available numeric(12,2) := 0;
  v_use_monthly numeric(12,2) := 0;
  v_use_rollover numeric(12,2) := 0;
  v_use_topup numeric(12,2) := 0;
  v_remaining numeric(12,2) := 0;
begin
  if v_user_id is null and coalesce(v_role, '') = 'service_role' then
    begin
      v_user_id := nullif(metadata->>'user_id', '')::uuid;
    exception
      when invalid_text_representation then
        v_user_id := null;
    end;
  end if;

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_credit_account(v_user_id, 'credits_reserve');
  perform public._credits_cleanup_expired_holds_for_user(v_user_id);
  perform public.credits_apply_monthly_refresh(v_user_id);

  select * into v_hold
  from public.credit_holds
  where user_id = v_user_id
    and idempotency_key = v_key
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'hold_id', v_hold.id,
      'reserved_amount', v_hold.reserved_amount,
      'status', v_hold.status,
      'idempotent', true,
      'available_after', (select public._credits_available_total(w) from public.credit_wallets w where w.user_id = v_user_id)
    );
  end if;

  select * into v_wallet
  from public.credit_wallets
  where user_id = v_user_id
  for update;

  v_available := public._credits_available_total(v_wallet);
  if v_available <= 0 or v_available < v_requested then
    return jsonb_build_object(
      'success', false,
      'code', 'insufficient_credits',
      'required', v_requested,
      'available', greatest(v_available, 0),
      'top_up_url', '/settings/billing',
      'upgrade_url', '/settings/billing#plans'
    );
  end if;

  v_remaining := v_requested;

  v_use_monthly := least(v_wallet.monthly_remaining, v_remaining);
  v_wallet.monthly_remaining := v_wallet.monthly_remaining - v_use_monthly;
  v_remaining := v_remaining - v_use_monthly;

  v_use_rollover := least(v_wallet.rollover_remaining, v_remaining);
  v_wallet.rollover_remaining := v_wallet.rollover_remaining - v_use_rollover;
  v_remaining := v_remaining - v_use_rollover;

  v_use_topup := least(v_wallet.topup_remaining, v_remaining);
  v_wallet.topup_remaining := v_wallet.topup_remaining - v_use_topup;
  v_remaining := v_remaining - v_use_topup;

  update public.credit_wallets
  set
    monthly_remaining = v_wallet.monthly_remaining,
    rollover_remaining = v_wallet.rollover_remaining,
    topup_remaining = v_wallet.topup_remaining,
    updated_at = now()
  where user_id = v_user_id
  returning * into v_wallet;

  insert into public.credit_holds (
    user_id,
    resource_type,
    reserved_amount,
    status,
    expires_at,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    v_user_id,
    coalesce(resource_type, 'generation'),
    v_requested,
    'active',
    now() + interval '15 minutes',
    reference_type,
    reference_id,
    v_key,
    coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'consumed', jsonb_build_object(
        'monthly', v_use_monthly,
        'rollover', v_use_rollover,
        'topup', v_use_topup
      )
    )
  )
  returning * into v_hold;

  v_available := public._credits_available_total(v_wallet);

  insert into public.credit_ledger (
    user_id,
    entry_type,
    resource_type,
    delta,
    balance_after,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    v_user_id,
    'reserve',
    coalesce(resource_type, 'generation'),
    -v_requested,
    v_available,
    reference_type,
    reference_id,
    v_key,
    coalesce(metadata, '{}'::jsonb)
  );

  insert into public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    resource_type,
    metadata
  )
  values (
    v_user_id,
    -ceil(v_requested)::integer,
    'usage',
    coalesce(resource_type, 'generation'),
    coalesce(metadata, '{}'::jsonb) || jsonb_build_object('hold_id', v_hold.id, 'idempotency_key', v_key)
  );

  perform public._credits_sync_legacy_tables(v_user_id);

  return jsonb_build_object(
    'success', true,
    'hold_id', v_hold.id,
    'reserved_amount', v_requested,
    'available_after', v_available,
    'status', v_hold.status,
    'idempotency_key', v_key
  );
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, avatar_url, wallet_address)
  values (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'wallet_address'
  )
  on conflict (id) do nothing;

  perform public.ensure_credit_account(NEW.id, 'auth_trigger');

  return NEW;
exception
  when foreign_key_violation then
    raise warning 'handle_new_user FK violation for user %', NEW.id;
    return NEW;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing auth users after the repaired functions are in place.
do $$
declare
  v_user record;
begin
  for v_user in select id from auth.users loop
    perform public.ensure_credit_account(v_user.id, 'migration_backfill');
  end loop;
end;
$$;

revoke execute on function public.add_credits(integer, text, jsonb) from public, anon, authenticated;
revoke execute on function public.deduct_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public._credits_ensure_wallet(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_credit_account(uuid, text) from public, anon;
revoke execute on function public.credits_get_balance() from public, anon;
revoke execute on function public.credits_reserve(text, numeric, text, text, text, jsonb) from public, anon;
revoke execute on function public.credits_commit(uuid, numeric, jsonb) from public, anon;
revoke execute on function public.credits_release(uuid, text, jsonb) from public, anon;
revoke execute on function public.use_credits(text, numeric, jsonb) from public, anon;
grant execute on function public._credits_ensure_wallet(uuid) to service_role;
grant execute on function public.ensure_credit_account(uuid, text) to authenticated, service_role;
grant execute on function public.credits_get_balance() to authenticated, service_role;
grant execute on function public.credits_reserve(text, numeric, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.credits_commit(uuid, numeric, jsonb) to authenticated, service_role;
grant execute on function public.credits_release(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.use_credits(text, numeric, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
