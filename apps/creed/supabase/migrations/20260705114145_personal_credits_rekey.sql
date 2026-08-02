-- Re-key the PERSONAL credit wallet from user_id to creed_id, so personal and
-- company credits share one creed_id-keyed model: creed_credits now mirrors
-- creed_company_credits, and the personal RPCs mirror the company_* twins
-- one-for-one. A personal Creed already has a creeds row + a backfilled creed_id,
-- so this only finishes the keying that the company batch started.
--
-- GATED: the credits code that passes creed_id (lib/ai/credits.ts) must ship with
-- this. The old user_id-keyed signatures are dropped, so old code breaks the
-- moment this lands - apply it together with the deploy and restart the app.

-- 1. Backfill any wallet row still missing creed_id (rows written after the
--    Batch A backfill), from the owner's personal Creed. After this there must be
--    no NULLs, or the NOT NULL below aborts the whole migration (safe: no partial).
update public.creed_credits cc
  set creed_id = c.id
  from public.creeds c
  where cc.creed_id is null
    and c.owner_user_id = cc.user_id
    and c.type = 'personal';

-- 2. Swap the primary key user_id -> creed_id (one wallet row per Creed). user_id
--    is retained (now nullable) so the existing RLS policy (auth.uid() = user_id)
--    and any historical reads keep working.
alter table public.creed_credits alter column creed_id set not null;
-- Drop the old PK first: a column can't lose NOT NULL while it's still part of a
-- primary key, so user_id's NOT NULL is only droppable after the PK is gone.
alter table public.creed_credits drop constraint if exists creed_credits_pkey;
alter table public.creed_credits alter column user_id drop not null;
alter table public.creed_credits add constraint creed_credits_pkey primary key (creed_id);

-- 3. Re-key the wallet RPCs to creed_id. Bodies are identical to the company_*
--    twins (creed-keyed, spent_by threaded), so the two paths stay in lockstep.

-- credit_topup(creed_id, amount, payment_intent) -> purchased bucket
drop function if exists public.credit_topup(uuid, bigint, text);
create or replace function public.credit_topup(
  p_creed_id uuid,
  p_amount_micro bigint,
  p_payment_intent_id text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted bigint;
  v_purchased bigint;
begin
  insert into public.creed_credit_transactions (
    id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
    stripe_payment_intent_id, bucket
  )
  values (
    gen_random_uuid()::text, p_creed_id, 'topup', p_amount_micro, 0,
    p_payment_intent_id, 'purchased'
  )
  on conflict (stripe_payment_intent_id) do nothing;

  if not found then
    select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
      into v_granted, v_purchased
      from public.creed_credits where creed_id = p_creed_id;
    return coalesce(v_granted, 0) + coalesce(v_purchased, 0);
  end if;

  insert into public.creed_credits (creed_id, purchased_micro_usd, updated_at)
  values (p_creed_id, p_amount_micro, timezone('utc'::text, now()))
  on conflict (creed_id) do update
    set purchased_micro_usd = public.creed_credits.purchased_micro_usd + excluded.purchased_micro_usd,
        updated_at = timezone('utc'::text, now())
  returning granted_micro_usd, purchased_micro_usd into v_granted, v_purchased;

  update public.creed_credit_transactions
    set balance_after_micro_usd = v_granted + v_purchased
    where stripe_payment_intent_id = p_payment_intent_id;

  return v_granted + v_purchased;
end;
$$;

-- debit_credits(creed_id, amount, feature, model, spent_by): granted then purchased
drop function if exists public.debit_credits(uuid, bigint, text, text);
create or replace function public.debit_credits(
  p_creed_id uuid,
  p_amount_micro bigint,
  p_feature text,
  p_model_id text,
  p_spent_by uuid
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
  insert into public.creed_credits (creed_id)
  values (p_creed_id)
  on conflict (creed_id) do nothing;

  select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  v_from_granted := least(greatest(v_granted, 0), p_amount_micro);
  v_from_purchased := p_amount_micro - v_from_granted;
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

-- grant_allowance(creed_id, allowance, period_key): reset granted bucket per period
drop function if exists public.grant_allowance(uuid, bigint, text);
create or replace function public.grant_allowance(
  p_creed_id uuid,
  p_allowance_micro bigint,
  p_period_key text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_key text;
  v_granted bigint;
  v_purchased bigint;
begin
  insert into public.creed_credits (creed_id)
  values (p_creed_id)
  on conflict (creed_id) do nothing;

  select grant_period_key, coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_current_key, v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  if v_current_key is distinct from p_period_key then
    update public.creed_credits
      set granted_micro_usd = p_allowance_micro,
          grant_period_key = p_period_key,
          grant_period_start = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      where creed_id = p_creed_id;

    insert into public.creed_credit_transactions (
      id, creed_id, type, amount_micro_usd, balance_after_micro_usd, bucket, grant_period_key
    )
    values (
      gen_random_uuid()::text, p_creed_id, 'grant', p_allowance_micro,
      p_allowance_micro + v_purchased, 'granted', p_period_key
    )
    on conflict do nothing;

    return p_allowance_micro + v_purchased;
  end if;

  return v_granted + v_purchased;
end;
$$;

-- credit_spend_total(creed_id): member-scoped all-time debit sum (mirrors the
-- company twin), replacing the old no-arg user-scoped version.
drop function if exists public.credit_spend_total();
create or replace function public.credit_spend_total(p_creed_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.creed_members m
      where m.creed_id = p_creed_id and m.user_id = auth.uid()
    )
    then coalesce((
      select sum(amount_micro_usd)
      from public.creed_credit_transactions
      where creed_id = p_creed_id and type = 'debit'
    ), 0)::bigint
    else 0::bigint
  end;
$$;

-- Lock down: mutating RPCs are service-role only; the read is member-callable.
revoke all on function public.credit_topup(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.credit_topup(uuid, bigint, text) to service_role;

revoke all on function public.debit_credits(uuid, bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function public.debit_credits(uuid, bigint, text, text, uuid) to service_role;

revoke all on function public.grant_allowance(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.grant_allowance(uuid, bigint, text) to service_role;

revoke all on function public.credit_spend_total(uuid) from public, anon;
grant execute on function public.credit_spend_total(uuid) to authenticated, service_role;
