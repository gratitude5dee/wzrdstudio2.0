-- Production-grade credits ledger + gated billing foundation
-- Backward-compatible with legacy user_credits/credit_transactions RPC surface.

create extension if not exists pgcrypto;

-- ============================================================
-- Billing Catalog
-- ============================================================
create table if not exists public.billing_plans (
  plan_code text primary key,
  display_name text not null,
  description text,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  yearly_price_cents integer check (yearly_price_cents is null or yearly_price_cents >= 0),
  monthly_quota integer not null default 0 check (monthly_quota >= 0),
  rollover_cap integer not null default 0 check (rollover_cap >= 0),
  stripe_price_monthly_id text,
  stripe_price_yearly_id text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_credit_packs (
  pack_code text primary key,
  display_name text not null,
  credits integer not null check (credits > 0),
  price_cents integer not null check (price_cents >= 0),
  stripe_price_id text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.billing_plans(plan_code),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled','incomplete','unpaid','paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (stripe_subscription_id)
);

create table if not exists public.billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkout_mode text not null check (checkout_mode in ('pack','subscription')),
  plan_code text references public.billing_plans(plan_code),
  pack_code text references public.billing_credit_packs(pack_code),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  credits integer not null default 0 check (credits >= 0),
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  status text not null default 'created' check (status in ('created','completed','expired','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stripe_session_id)
);

create index if not exists idx_billing_checkout_sessions_user_created
  on public.billing_checkout_sessions (user_id, created_at desc);
create index if not exists idx_billing_checkout_sessions_status
  on public.billing_checkout_sessions (status, created_at desc);
create index if not exists idx_billing_subscriptions_user
  on public.billing_subscriptions (user_id);

-- ============================================================
-- Credits Wallet / Ledger / Holds
-- ============================================================
create table if not exists public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'pro' references public.billing_plans(plan_code),
  monthly_quota integer not null default 1200 check (monthly_quota >= 0),
  monthly_remaining numeric(12,2) not null default 1200,
  rollover_remaining numeric(12,2) not null default 0,
  topup_remaining numeric(12,2) not null default 0,
  reset_at timestamptz not null default (now() + interval '1 month'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('grant','reserve','commit','release','refund','adjustment')),
  resource_type text not null,
  delta numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  reference_type text,
  reference_id text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_ledger_user_created
  on public.credit_ledger (user_id, created_at desc);
create index if not exists idx_credit_ledger_idempotency
  on public.credit_ledger (user_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.credit_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null,
  reserved_amount numeric(12,2) not null check (reserved_amount > 0),
  status text not null default 'active' check (status in ('active','committed','released','expired')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  reference_type text,
  reference_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists idx_credit_holds_user_status
  on public.credit_holds (user_id, status, created_at desc);
create index if not exists idx_credit_holds_expiry
  on public.credit_holds (expires_at)
  where status = 'active';

-- ============================================================
-- Triggers
-- ============================================================
create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_billing_plans_updated_at on public.billing_plans;
create trigger trg_billing_plans_updated_at
before update on public.billing_plans
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_billing_credit_packs_updated_at on public.billing_credit_packs;
create trigger trg_billing_credit_packs_updated_at
before update on public.billing_credit_packs
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger trg_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_billing_checkout_sessions_updated_at on public.billing_checkout_sessions;
create trigger trg_billing_checkout_sessions_updated_at
before update on public.billing_checkout_sessions
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_credit_wallets_updated_at on public.credit_wallets;
create trigger trg_credit_wallets_updated_at
before update on public.credit_wallets
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_credit_holds_updated_at on public.credit_holds;
create trigger trg_credit_holds_updated_at
before update on public.credit_holds
for each row execute function public.set_current_timestamp_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.billing_plans enable row level security;
alter table public.billing_credit_packs enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_checkout_sessions enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.credit_holds enable row level security;

drop policy if exists billing_plans_read_authenticated on public.billing_plans;
create policy billing_plans_read_authenticated
on public.billing_plans
for select
using (auth.role() = 'authenticated');

drop policy if exists billing_credit_packs_read_authenticated on public.billing_credit_packs;
create policy billing_credit_packs_read_authenticated
on public.billing_credit_packs
for select
using (auth.role() = 'authenticated');

drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own
on public.billing_subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists billing_checkout_sessions_select_own on public.billing_checkout_sessions;
create policy billing_checkout_sessions_select_own
on public.billing_checkout_sessions
for select
using (auth.uid() = user_id);

drop policy if exists credit_wallets_select_own on public.credit_wallets;
create policy credit_wallets_select_own
on public.credit_wallets
for select
using (auth.uid() = user_id);

drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own
on public.credit_ledger
for select
using (auth.uid() = user_id);

drop policy if exists credit_holds_select_own on public.credit_holds;
create policy credit_holds_select_own
on public.credit_holds
for select
using (auth.uid() = user_id);

-- ============================================================
-- Seed Catalog
-- ============================================================
insert into public.billing_plans (
  plan_code,
  display_name,
  description,
  monthly_price_cents,
  yearly_price_cents,
  monthly_quota,
  rollover_cap,
  sort_order,
  metadata
)
values
  (
    'pro',
    'Pro',
    'For independent creators and small teams.',
    4900,
    49000,
    1200,
    1200,
    10,
    '{"cta":"upgrade_pro"}'::jsonb
  ),
  (
    'business',
    'Business',
    'For larger teams with heavier generation volume.',
    14900,
    149000,
    5000,
    5000,
    20,
    '{"cta":"upgrade_business"}'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    'Custom billing, governance, and support.',
    0,
    0,
    0,
    0,
    30,
    '{"cta":"contact_sales","custom":true}'::jsonb
  )
on conflict (plan_code) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  yearly_price_cents = excluded.yearly_price_cents,
  monthly_quota = excluded.monthly_quota,
  rollover_cap = excluded.rollover_cap,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.billing_credit_packs (pack_code, display_name, credits, price_cents, sort_order, metadata)
values
  ('pack_50', '+50 credits', 50, 500, 10, '{}'::jsonb),
  ('pack_100', '+100 credits', 100, 1000, 20, '{}'::jsonb),
  ('pack_150', '+150 credits', 150, 1500, 30, '{}'::jsonb),
  ('pack_200', '+200 credits', 200, 2000, 40, '{"default":true}'::jsonb),
  ('pack_250', '+250 credits', 250, 2500, 50, '{}'::jsonb),
  ('pack_300', '+300 credits', 300, 3000, 60, '{}'::jsonb),
  ('pack_350', '+350 credits', 350, 3500, 70, '{}'::jsonb),
  ('pack_400', '+400 credits', 400, 4000, 80, '{}'::jsonb),
  ('pack_450', '+450 credits', 450, 4500, 90, '{}'::jsonb),
  ('pack_500', '+500 credits', 500, 5000, 100, '{}'::jsonb),
  ('pack_550', '+550 credits', 550, 5000, 110, '{}'::jsonb)
on conflict (pack_code) do update
set
  display_name = excluded.display_name,
  credits = excluded.credits,
  price_cents = excluded.price_cents,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

-- ============================================================
-- Internal Helpers
-- ============================================================
create or replace function public._credits_available_total(p_wallet public.credit_wallets)
returns numeric
language sql
immutable
as $$
  select coalesce(p_wallet.monthly_remaining, 0)
       + coalesce(p_wallet.rollover_remaining, 0)
       + coalesce(p_wallet.topup_remaining, 0)
$$;

create or replace function public._credits_sync_legacy_tables(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.credit_wallets;
  v_available integer;
begin
  if p_user_id is null then
    return;
  end if;

  select * into v_wallet
  from public.credit_wallets
  where user_id = p_user_id;

  if not found then
    return;
  end if;

  v_available := ceil(public._credits_available_total(v_wallet));

  insert into public.user_credits (user_id, total_credits, used_credits)
  values (p_user_id, greatest(v_available, 0), 0)
  on conflict (user_id)
  do update set
    total_credits = excluded.total_credits,
    used_credits = excluded.used_credits,
    updated_at = now();
end;
$$;

create or replace function public._credits_ensure_wallet(p_user_id uuid)
returns public.credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.credit_wallets;
  v_plan_code text := 'pro';
  v_monthly_quota integer := 1200;
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

  select coalesce(bs.plan_code, 'pro'), coalesce(bs.current_period_end, now() + interval '1 month')
  into v_plan_code, v_reset_at
  from public.billing_subscriptions bs
  where bs.user_id = p_user_id
  limit 1;

  select coalesce(bp.monthly_quota, 1200)
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
    case when v_legacy_available > 0 then 0 else v_monthly_quota end,
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

create or replace function public._credits_apply_monthly_refresh_locked(p_user_id uuid)
returns table(wallet public.credit_wallets, refreshed boolean, refresh_cycles integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.credit_wallets;
  v_rollover_cap integer := 0;
  v_cycles integer := 0;
  v_prior_monthly numeric(12,2) := 0;
  v_available numeric(12,2) := 0;
begin
  perform public._credits_ensure_wallet(p_user_id);

  select * into v_wallet
  from public.credit_wallets
  where user_id = p_user_id
  for update;

  select coalesce(bp.rollover_cap, v_wallet.monthly_quota)
  into v_rollover_cap
  from public.billing_plans bp
  where bp.plan_code = v_wallet.plan_code;

  while now() >= v_wallet.reset_at loop
    v_prior_monthly := greatest(v_wallet.monthly_remaining, 0);

    v_wallet.rollover_remaining := least(v_rollover_cap::numeric, v_prior_monthly);
    v_wallet.monthly_remaining := v_wallet.monthly_quota;
    v_wallet.reset_at := v_wallet.reset_at + interval '1 month';
    v_cycles := v_cycles + 1;
  end loop;

  if v_cycles > 0 then
    update public.credit_wallets
    set
      monthly_remaining = v_wallet.monthly_remaining,
      rollover_remaining = v_wallet.rollover_remaining,
      reset_at = v_wallet.reset_at,
      updated_at = now()
    where user_id = p_user_id
    returning * into v_wallet;

    v_available := public._credits_available_total(v_wallet);

    insert into public.credit_ledger (
      user_id,
      entry_type,
      resource_type,
      delta,
      balance_after,
      reference_type,
      reference_id,
      metadata
    )
    values (
      p_user_id,
      'grant',
      'monthly_refresh',
      (v_wallet.monthly_quota * v_cycles),
      v_available,
      'plan_refresh',
      v_wallet.plan_code,
      jsonb_build_object('cycles', v_cycles, 'rollover_cap', v_rollover_cap)
    );
  end if;

  return query select v_wallet, (v_cycles > 0), v_cycles;
end;
$$;

create or replace function public._credits_restore_consumed(
  p_wallet inout public.credit_wallets,
  p_consumed jsonb,
  p_amount numeric
)
returns public.credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monthly numeric := greatest(coalesce((p_consumed->>'monthly')::numeric, 0), 0);
  v_rollover numeric := greatest(coalesce((p_consumed->>'rollover')::numeric, 0), 0);
  v_topup numeric := greatest(coalesce((p_consumed->>'topup')::numeric, 0), 0);
  v_restore numeric := greatest(coalesce(p_amount, 0), 0);
  v_take numeric := 0;
begin
  if v_restore <= 0 then
    return p_wallet;
  end if;

  v_take := least(v_monthly, v_restore);
  p_wallet.monthly_remaining := p_wallet.monthly_remaining + v_take;
  v_restore := v_restore - v_take;

  v_take := least(v_rollover, v_restore);
  p_wallet.rollover_remaining := p_wallet.rollover_remaining + v_take;
  v_restore := v_restore - v_take;

  v_take := least(v_topup, v_restore);
  p_wallet.topup_remaining := p_wallet.topup_remaining + v_take;
  v_restore := v_restore - v_take;

  if v_restore > 0 then
    p_wallet.topup_remaining := p_wallet.topup_remaining + v_restore;
  end if;

  update public.credit_wallets
  set
    monthly_remaining = p_wallet.monthly_remaining,
    rollover_remaining = p_wallet.rollover_remaining,
    topup_remaining = p_wallet.topup_remaining,
    updated_at = now()
  where user_id = p_wallet.user_id
  returning * into p_wallet;

  return p_wallet;
end;
$$;

create or replace function public._credits_cleanup_expired_holds_for_user(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold record;
  v_count integer := 0;
begin
  for v_hold in
    select id, user_id
    from public.credit_holds
    where status = 'active'
      and expires_at < now()
      and (p_user_id is null or user_id = p_user_id)
  loop
    perform public.credits_release(v_hold.id, 'expired', jsonb_build_object('source', 'cleanup'));

    update public.credit_holds
    set status = 'expired', updated_at = now()
    where id = v_hold.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================
-- Public RPCs
-- ============================================================
create or replace function public.credits_apply_monthly_refresh(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_row record;
  v_available numeric(12,2);
begin
  if p_user_id is null then
    return jsonb_build_object('success', false, 'code', 'user_required');
  end if;

  if v_auth_user is not null and p_user_id <> v_auth_user and coalesce(v_role, '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  select * into v_row
  from public._credits_apply_monthly_refresh_locked(p_user_id)
  limit 1;

  v_available := public._credits_available_total((v_row.wallet)::public.credit_wallets);

  perform public._credits_sync_legacy_tables(p_user_id);

  return jsonb_build_object(
    'success', true,
    'refreshed', coalesce(v_row.refreshed, false),
    'refresh_cycles', coalesce(v_row.refresh_cycles, 0),
    'available_total', v_available,
    'reset_at', (v_row.wallet).reset_at
  );
end;
$$;

create or replace function public.credits_get_balance()
returns jsonb
language plpgsql
security definer
set search_path = public
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
set search_path = public
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

  perform public._credits_ensure_wallet(v_user_id);

  select * into v_wallet
  from public.credit_wallets
  where user_id = v_user_id
  for update;

  v_available := public._credits_available_total(v_wallet);
  if v_available < v_requested then
    return jsonb_build_object(
      'success', false,
      'code', 'insufficient_credits',
      'required', v_requested,
      'available', v_available,
      'top_up_url', '/settings/billing'
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

create or replace function public.credits_commit(
  hold_id uuid,
  actual_amount numeric default null,
  metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_hold public.credit_holds;
  v_wallet public.credit_wallets;
  v_reserved numeric(12,2);
  v_actual numeric(12,2);
  v_release numeric(12,2);
  v_available numeric(12,2);
begin
  if hold_id is null then
    return jsonb_build_object('success', false, 'code', 'hold_required');
  end if;

  select * into v_hold
  from public.credit_holds
  where id = hold_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'hold_not_found');
  end if;

  if v_auth_user is not null and v_hold.user_id <> v_auth_user and coalesce(v_role, '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  perform public._credits_cleanup_expired_holds_for_user(v_hold.user_id);

  if v_hold.status = 'committed' then
    return jsonb_build_object('success', true, 'hold_id', hold_id, 'status', 'committed', 'idempotent', true);
  end if;

  if v_hold.status <> 'active' then
    return jsonb_build_object('success', false, 'code', 'invalid_hold_status', 'status', v_hold.status);
  end if;

  select * into v_wallet
  from public.credit_wallets
  where user_id = v_hold.user_id
  for update;

  v_reserved := v_hold.reserved_amount;
  v_actual := least(greatest(ceil(coalesce(actual_amount, v_reserved)), 0), v_reserved);
  v_release := greatest(v_reserved - v_actual, 0);

  if v_release > 0 then
    v_wallet := public._credits_restore_consumed(v_wallet, v_hold.metadata->'consumed', v_release);
  end if;

  update public.credit_holds
  set
    status = 'committed',
    metadata = coalesce(v_hold.metadata, '{}'::jsonb)
      || jsonb_build_object('actual_amount', v_actual, 'released_amount', v_release, 'commit_metadata', coalesce(metadata, '{}'::jsonb)),
    updated_at = now()
  where id = hold_id
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
    v_hold.user_id,
    'commit',
    v_hold.resource_type,
    0,
    v_available,
    v_hold.reference_type,
    v_hold.reference_id,
    v_hold.idempotency_key,
    jsonb_build_object('actual_amount', v_actual, 'released_amount', v_release) || coalesce(metadata, '{}'::jsonb)
  );

  if v_release > 0 then
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
      v_hold.user_id,
      'release',
      v_hold.resource_type,
      v_release,
      v_available,
      v_hold.reference_type,
      v_hold.reference_id,
      v_hold.idempotency_key,
      jsonb_build_object('reason', 'unused_reservation') || coalesce(metadata, '{}'::jsonb)
    );

    insert into public.credit_transactions (
      user_id,
      amount,
      transaction_type,
      resource_type,
      metadata
    )
    values (
      v_hold.user_id,
      ceil(v_release)::integer,
      'refund',
      v_hold.resource_type,
      jsonb_build_object('reason', 'unused_reservation', 'hold_id', hold_id) || coalesce(metadata, '{}'::jsonb)
    );
  end if;

  perform public._credits_sync_legacy_tables(v_hold.user_id);

  return jsonb_build_object(
    'success', true,
    'hold_id', hold_id,
    'status', 'committed',
    'charged_amount', v_actual,
    'released_amount', v_release,
    'available_after', v_available
  );
end;
$$;

create or replace function public.credits_release(
  hold_id uuid,
  reason text default null,
  metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_hold public.credit_holds;
  v_wallet public.credit_wallets;
  v_available numeric(12,2);
begin
  if hold_id is null then
    return jsonb_build_object('success', false, 'code', 'hold_required');
  end if;

  select * into v_hold
  from public.credit_holds
  where id = hold_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'hold_not_found');
  end if;

  if v_auth_user is not null and v_hold.user_id <> v_auth_user and coalesce(v_role, '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  if v_hold.status in ('released', 'expired') then
    return jsonb_build_object('success', true, 'hold_id', hold_id, 'status', v_hold.status, 'idempotent', true);
  end if;

  if v_hold.status <> 'active' then
    return jsonb_build_object('success', false, 'code', 'invalid_hold_status', 'status', v_hold.status);
  end if;

  select * into v_wallet
  from public.credit_wallets
  where user_id = v_hold.user_id
  for update;

  v_wallet := public._credits_restore_consumed(v_wallet, v_hold.metadata->'consumed', v_hold.reserved_amount);

  update public.credit_holds
  set
    status = 'released',
    metadata = coalesce(v_hold.metadata, '{}'::jsonb)
      || jsonb_build_object('release_reason', coalesce(reason, 'manual_release'), 'release_metadata', coalesce(metadata, '{}'::jsonb)),
    updated_at = now()
  where id = hold_id
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
    v_hold.user_id,
    'release',
    v_hold.resource_type,
    v_hold.reserved_amount,
    v_available,
    v_hold.reference_type,
    v_hold.reference_id,
    v_hold.idempotency_key,
    jsonb_build_object('reason', coalesce(reason, 'manual_release')) || coalesce(metadata, '{}'::jsonb)
  );

  insert into public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    resource_type,
    metadata
  )
  values (
    v_hold.user_id,
    ceil(v_hold.reserved_amount)::integer,
    'refund',
    v_hold.resource_type,
    jsonb_build_object('reason', coalesce(reason, 'manual_release'), 'hold_id', hold_id) || coalesce(metadata, '{}'::jsonb)
  );

  perform public._credits_sync_legacy_tables(v_hold.user_id);

  return jsonb_build_object(
    'success', true,
    'hold_id', hold_id,
    'status', 'released',
    'released_amount', v_hold.reserved_amount,
    'available_after', v_available
  );
end;
$$;

create or replace function public.credits_grant_topup(
  p_user_id uuid,
  p_pack_code text,
  external_ref text default null,
  metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := current_setting('request.jwt.claim.role', true);
  v_pack public.billing_credit_packs;
  v_wallet public.credit_wallets;
  v_available numeric(12,2);
  v_ref text := coalesce(nullif(external_ref, ''), gen_random_uuid()::text);
  v_existing uuid;
begin
  if coalesce(v_role, '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'service_role_required');
  end if;

  select * into v_pack
  from public.billing_credit_packs
  where pack_code = p_pack_code
    and is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'code', 'invalid_pack_code');
  end if;

  select id into v_existing
  from public.credit_ledger
  where user_id = p_user_id
    and reference_type = 'billing_pack'
    and reference_id = v_ref
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('success', true, 'idempotent', true, 'reference_id', v_ref);
  end if;

  perform public._credits_ensure_wallet(p_user_id);

  select * into v_wallet
  from public.credit_wallets
  where user_id = p_user_id
  for update;

  update public.credit_wallets
  set
    topup_remaining = topup_remaining + v_pack.credits,
    updated_at = now()
  where user_id = p_user_id
  returning * into v_wallet;

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
    p_user_id,
    'grant',
    'credit_pack',
    v_pack.credits,
    v_available,
    'billing_pack',
    v_ref,
    v_ref,
    coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('pack_code', v_pack.pack_code, 'credits', v_pack.credits)
  );

  insert into public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    resource_type,
    metadata
  )
  values (
    p_user_id,
    v_pack.credits,
    'purchase',
    'credit',
    coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('pack_code', v_pack.pack_code, 'reference', v_ref)
  );

  perform public._credits_sync_legacy_tables(p_user_id);

  return jsonb_build_object(
    'success', true,
    'pack_code', v_pack.pack_code,
    'credits', v_pack.credits,
    'available_after', v_available,
    'reference_id', v_ref
  );
end;
$$;

create or replace function public.credits_cleanup_expired_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._credits_cleanup_expired_holds_for_user(null);
end;
$$;

-- ============================================================
-- Legacy Compatibility Wrappers
-- ============================================================
create or replace function public.get_available_credits()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance jsonb;
begin
  v_balance := public.credits_get_balance();
  return coalesce((v_balance->'wallet'->>'available_total')::numeric, 0);
end;
$$;

create or replace function public.use_credits(
  resource_type text,
  credit_cost numeric default 1,
  metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserve jsonb;
  v_commit jsonb;
  v_hold_id uuid;
  v_idempotency text;
begin
  v_idempotency := coalesce(nullif(metadata->>'idempotency_key', ''), gen_random_uuid()::text);

  v_reserve := public.credits_reserve(
    resource_type,
    credit_cost,
    'legacy_rpc',
    resource_type,
    v_idempotency,
    metadata
  );

  if coalesce((v_reserve->>'success')::boolean, false) = false then
    return false;
  end if;

  v_hold_id := (v_reserve->>'hold_id')::uuid;
  v_commit := public.credits_commit(v_hold_id, credit_cost, metadata);

  return coalesce((v_commit->>'success')::boolean, false);
end;
$$;

create or replace function public.add_credits(
  credit_amount integer,
  transaction_type text default 'purchase',
  metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.credit_wallets;
  v_available numeric(12,2);
begin
  if v_user_id is null then
    return false;
  end if;

  if credit_amount is null or credit_amount <= 0 then
    return false;
  end if;

  perform public._credits_ensure_wallet(v_user_id);

  select * into v_wallet
  from public.credit_wallets
  where user_id = v_user_id
  for update;

  update public.credit_wallets
  set
    topup_remaining = topup_remaining + credit_amount,
    updated_at = now()
  where user_id = v_user_id
  returning * into v_wallet;

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
    'grant',
    'credit',
    credit_amount,
    v_available,
    'legacy_add_credits',
    coalesce(transaction_type, 'purchase'),
    gen_random_uuid()::text,
    coalesce(metadata, '{}'::jsonb) || jsonb_build_object('transaction_type', transaction_type)
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
    credit_amount,
    coalesce(transaction_type, 'purchase'),
    'credit',
    metadata
  );

  perform public._credits_sync_legacy_tables(v_user_id);

  return true;
end;
$$;

-- ============================================================
-- Function Grants
-- ============================================================
grant execute on function public.credits_get_balance() to authenticated, service_role;
grant execute on function public.credits_reserve(text, numeric, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.credits_commit(uuid, numeric, jsonb) to authenticated, service_role;
grant execute on function public.credits_release(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.credits_grant_topup(uuid, text, text, jsonb) to service_role;
grant execute on function public.credits_apply_monthly_refresh(uuid) to authenticated, service_role;
grant execute on function public.credits_cleanup_expired_holds() to service_role;

grant execute on function public.get_available_credits() to authenticated, service_role;
grant execute on function public.use_credits(text, numeric, jsonb) to authenticated, service_role;
grant execute on function public.add_credits(integer, text, jsonb) to authenticated, service_role;

-- ============================================================
-- Best-effort hourly cleanup schedule (if pg_cron exists)
-- ============================================================
do $$
declare
  v_job_id bigint;
begin
  if to_regnamespace('cron') is null then
    return;
  end if;

  begin
    select jobid into v_job_id
    from cron.job
    where jobname = 'credits_cleanup_expired_holds_hourly'
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
  exception when others then
    null;
  end;

  begin
    perform cron.schedule(
      'credits_cleanup_expired_holds_hourly',
      '5 * * * *',
      $job$select public.credits_cleanup_expired_holds();$job$
    );
  exception when others then
    null;
  end;
end
$$;
