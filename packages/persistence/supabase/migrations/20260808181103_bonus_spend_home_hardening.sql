-- Harden Bonus (granted) credits:
-- 1. Off-home spend can only touch purchased (RPC-enforced).
-- 2. Assigning a credits home consolidates all owned granted wallets and
--    updates creed_credit_homes in one transaction.

-- ── Purchased-only debit / reserve ─────────────────────────────────────────

drop function if exists public.debit_credits(uuid, bigint, text, text, uuid);

create or replace function public.debit_credits(
  p_creed_id uuid,
  p_amount_micro bigint,
  p_feature text,
  p_model_id text,
  p_spent_by uuid,
  p_purchased_only boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted bigint;
  v_purchased bigint;
  v_from_granted bigint;
  v_from_purchased bigint;
  v_new_granted bigint;
  v_new_purchased bigint;
  v_bucket text;
begin
  if p_amount_micro <= 0 then
    raise exception 'invalid_debit_amount';
  end if;

  insert into public.creed_credits (creed_id)
  values (p_creed_id)
  on conflict (creed_id) do nothing;

  select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  if coalesce(p_purchased_only, false) then
    if v_purchased < p_amount_micro then
      raise exception 'insufficient_credits';
    end if;
    v_from_granted := 0;
    v_from_purchased := p_amount_micro;
  else
    if v_granted + v_purchased < p_amount_micro then
      raise exception 'insufficient_credits';
    end if;
    v_from_granted := least(greatest(v_granted, 0), p_amount_micro);
    v_from_purchased := p_amount_micro - v_from_granted;
  end if;

  v_new_granted := v_granted - v_from_granted;
  v_new_purchased := v_purchased - v_from_purchased;

  update public.creed_credits
    set granted_micro_usd = v_new_granted,
        purchased_micro_usd = v_new_purchased,
        updated_at = timezone('utc'::text, now())
    where creed_id = p_creed_id;

  if v_from_granted > 0 and v_from_purchased > 0 then
    v_bucket := 'mixed';
  elsif v_from_granted > 0 then
    v_bucket := 'granted';
  else
    v_bucket := 'purchased';
  end if;

  insert into public.creed_credit_transactions (
    id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
    feature, model_id, bucket, spent_by_user_id
  )
  values (
    gen_random_uuid()::text, p_creed_id, 'debit', p_amount_micro,
    v_new_granted + v_new_purchased, p_feature, p_model_id, v_bucket, p_spent_by
  );

  return v_new_granted + v_new_purchased;
end;
$$;

revoke all on function public.debit_credits(uuid, bigint, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.debit_credits(uuid, bigint, text, text, uuid, boolean)
  to service_role;

drop function if exists public.reserve_credits(uuid, bigint, text, text, uuid);

create or replace function public.reserve_credits(
  p_creed_id uuid,
  p_amount_micro bigint,
  p_feature text,
  p_model_id text,
  p_spent_by uuid,
  p_purchased_only boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_granted bigint;
  v_purchased bigint;
  v_from_granted bigint;
  v_from_purchased bigint;
  stale record;
begin
  if p_amount_micro <= 0 then raise exception 'invalid_reservation_amount'; end if;
  insert into public.creed_credits (creed_id) values (p_creed_id)
    on conflict (creed_id) do nothing;
  select granted_micro_usd, purchased_micro_usd into v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  for stale in
    select * from public.creed_credit_reservations
    where creed_id = p_creed_id and status = 'reserved'
      and created_at < now() - interval '10 minutes'
    for update
  loop
    v_granted := v_granted + stale.reserved_granted_micro_usd;
    v_purchased := v_purchased + stale.reserved_purchased_micro_usd;
    update public.creed_credit_reservations set status = 'cancelled', settled_at = now()
      where id = stale.id;
  end loop;

  if coalesce(p_purchased_only, false) then
    if v_purchased < p_amount_micro then
      raise exception 'insufficient_credits';
    end if;
    v_from_granted := 0;
    v_from_purchased := p_amount_micro;
  else
    if v_granted + v_purchased < p_amount_micro then
      raise exception 'insufficient_credits';
    end if;
    v_from_granted := least(v_granted, p_amount_micro);
    v_from_purchased := p_amount_micro - v_from_granted;
  end if;

  update public.creed_credits set
    granted_micro_usd = v_granted - v_from_granted,
    purchased_micro_usd = v_purchased - v_from_purchased,
    updated_at = now()
    where creed_id = p_creed_id;
  insert into public.creed_credit_reservations (
    id, creed_id, reserved_granted_micro_usd, reserved_purchased_micro_usd,
    feature, model_id, spent_by_user_id
  ) values (v_id, p_creed_id, v_from_granted, v_from_purchased, p_feature, p_model_id, p_spent_by);
  return v_id;
end;
$$;

revoke all on function public.reserve_credits(uuid, bigint, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, bigint, text, text, uuid, boolean)
  to service_role;

-- ── Atomic home assignment + granted consolidation ─────────────────────────

create or replace function public.set_credit_home(
  p_user_id uuid,
  p_creed_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  r record;
begin
  if p_user_id is null or p_creed_id is null then
    raise exception 'credit_home_missing_args';
  end if;

  -- Serialize home moves per user so concurrent assigns cannot deadlock on
  -- wallet row locks taken in different orders.
  perform pg_advisory_xact_lock(hashtext('creed_credit_home:' || p_user_id::text));

  select owner_user_id into v_owner
    from public.creeds
   where id = p_creed_id
   for share;
  if v_owner is distinct from p_user_id then
    raise exception 'credit_home_not_owner';
  end if;

  insert into public.creed_credits (creed_id)
  values (p_creed_id)
  on conflict (creed_id) do nothing;

  -- Pull granted (Bonus) from every other owned Creed onto the new home.
  for r in
    select c.id as creed_id
      from public.creeds c
     where c.owner_user_id = p_user_id
       and c.id <> p_creed_id
     order by c.id
  loop
    perform public.transfer_credit_home(r.creed_id, p_creed_id);
  end loop;

  insert into public.creed_credit_homes as homes (user_id, creed_id, updated_at)
  values (p_user_id, p_creed_id, timezone('utc'::text, now()))
  on conflict (user_id) do update
    set creed_id = excluded.creed_id,
        updated_at = excluded.updated_at;

  return p_creed_id;
end;
$$;

revoke all on function public.set_credit_home(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_credit_home(uuid, uuid) to service_role;

comment on function public.set_credit_home(uuid, uuid) is
  'Point Cloud Bonus at an owned Creed, consolidating granted balances and updating creed_credit_homes atomically.';
