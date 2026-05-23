
-- 1. Idempotent server-side bootstrap for new wallet users
create or replace function public.bootstrap_wallet_user(
  p_user_id uuid,
  p_wallet_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_lower text;
  v_credits_granted boolean := false;
  v_available integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;
  if p_wallet_address is null or length(trim(p_wallet_address)) = 0 then
    raise exception 'p_wallet_address is required';
  end if;

  v_wallet_lower := lower(p_wallet_address);

  -- 1a. Upsert profile row, ensure wallet_address is set
  insert into public.profiles (id, wallet_address)
  values (p_user_id, v_wallet_lower)
  on conflict (id) do update
  set wallet_address = coalesce(public.profiles.wallet_address, excluded.wallet_address),
      updated_at = now();

  -- 1b. Upsert wallet_users link
  insert into public.wallet_users (user_id, wallet_address)
  values (p_user_id, v_wallet_lower)
  on conflict (wallet_address) do nothing;

  -- 1c. Guarded one-time welcome grant (skip if already granted)
  if not exists (
    select 1
    from public.credit_transactions
    where user_id = p_user_id
      and transaction_type = 'free'
      and metadata->>'description' = 'Welcome bonus - Free plan'
  ) then
    insert into public.user_credits (user_id, total_credits)
    values (p_user_id, 100)
    on conflict (user_id) do update
      set total_credits = public.user_credits.total_credits + 100,
          updated_at = now();

    insert into public.credit_transactions (
      user_id,
      amount,
      transaction_type,
      resource_type,
      metadata
    )
    values (
      p_user_id,
      100,
      'free',
      'credit',
      jsonb_build_object('description', 'Welcome bonus - Free plan')
    );

    v_credits_granted := true;
  end if;

  select greatest(coalesce(total_credits, 0) - coalesce(used_credits, 0), 0)
  into v_available
  from public.user_credits
  where user_id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'wallet_address', v_wallet_lower,
    'plan_code', 'free',
    'available_credits', coalesce(v_available, 0),
    'welcome_granted', v_credits_granted
  );
end;
$$;

revoke all on function public.bootstrap_wallet_user(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_wallet_user(uuid, text) to service_role;

-- 2. Tighten handle_new_user: keep FK tolerance, stop swallowing all OTHERS errors
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
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

  return NEW;
exception
  when foreign_key_violation then
    raise warning 'handle_new_user FK violation for user %', NEW.id;
    return NEW;
end;
$$;

notify pgrst, 'reload schema';
