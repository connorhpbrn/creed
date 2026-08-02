-- Company credits (SAFE TO APPLY NOW - additive).
--
-- Company AI (panel, analysis) meters on a pooled per-Creed allowance. The
-- personal creed_credits table is keyed by user_id (one row per user), so it
-- cannot also hold a company's pooled balance without the Batch B PK swap. To
-- keep personal untouched and avoid Batch B, company balances live in their own
-- table keyed by creed_id. The ledger is the shared creed_credit_transactions
-- (it already has creed_id + spent_by_user_id from Batch A); company debits set
-- creed_id + spent_by_user_id, personal debits leave creed_id null.
--
-- Same two-bucket semantics as personal: granted (monthly allowance, resets, no
-- rollover) drained first, then purchased (top-ups, roll over). Marked-up
-- micro-USD ($1 = 1_000_000). All writes go through the service-role RPCs below.

create table if not exists public.creed_company_credits (
  creed_id            uuid primary key references public.creeds(id) on delete cascade,
  granted_micro_usd   bigint not null default 0,
  purchased_micro_usd bigint not null default 0,
  grant_period_key    text,
  grant_period_start  timestamptz,
  created_at          timestamptz not null default timezone('utc'::text, now()),
  updated_at          timestamptz not null default timezone('utc'::text, now())
);

alter table public.creed_company_credits enable row level security;
-- Members read their company's balance; writes via the service-role RPCs only.
drop policy if exists "members read company credits" on public.creed_company_credits;
create policy "members read company credits"
  on public.creed_company_credits
  for select
  using (public.creed_role(creed_id) is not null);

-- company_grant_allowance: lazy monthly reset of the granted bucket, idempotent
-- per (creed, period). Lifetime passes a fixed key so its one-time grant never
-- resets. Returns the combined balance.
create or replace function public.company_grant_allowance(
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
  insert into public.creed_company_credits (creed_id) values (p_creed_id)
    on conflict (creed_id) do nothing;
  select grant_period_key, coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_current_key, v_granted, v_purchased
    from public.creed_company_credits where creed_id = p_creed_id for update;
  if v_current_key is distinct from p_period_key then
    update public.creed_company_credits
      set granted_micro_usd = p_allowance_micro, grant_period_key = p_period_key,
          grant_period_start = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
      where creed_id = p_creed_id;
    insert into public.creed_credit_transactions (
      id, creed_id, user_id, type, amount_micro_usd, balance_after_micro_usd, bucket, grant_period_key
    )
    values (
      gen_random_uuid()::text, p_creed_id, (select owner_user_id from public.creeds where id = p_creed_id),
      'grant', p_allowance_micro, p_allowance_micro + v_purchased, 'granted', 'company:' || p_period_key
    )
    on conflict do nothing;
    return p_allowance_micro + v_purchased;
  end if;
  return v_granted + v_purchased;
end;
$$;

-- company_debit_credits: drain granted then purchased, record which member spent.
create or replace function public.company_debit_credits(
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
  insert into public.creed_company_credits (creed_id) values (p_creed_id)
    on conflict (creed_id) do nothing;
  select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_granted, v_purchased
    from public.creed_company_credits where creed_id = p_creed_id for update;
  v_from_granted := least(greatest(v_granted, 0), p_amount_micro);
  v_from_purchased := p_amount_micro - v_from_granted;
  v_new_granted := v_granted - v_from_granted;
  v_new_purchased := v_purchased - v_from_purchased;
  update public.creed_company_credits
    set granted_micro_usd = v_new_granted, purchased_micro_usd = v_new_purchased,
        updated_at = timezone('utc'::text, now())
    where creed_id = p_creed_id;
  if v_from_granted > 0 and v_from_purchased > 0 then v_bucket := 'mixed';
  elsif v_from_granted > 0 then v_bucket := 'granted';
  else v_bucket := 'purchased'; end if;
  insert into public.creed_credit_transactions (
    id, creed_id, user_id, type, amount_micro_usd, balance_after_micro_usd,
    feature, model_id, bucket, spent_by_user_id
  )
  values (
    gen_random_uuid()::text, p_creed_id, p_spent_by, 'debit', p_amount_micro,
    v_new_granted + v_new_purchased, p_feature, p_model_id, v_bucket, p_spent_by
  );
  return v_new_granted + v_new_purchased;
end;
$$;

-- company_credit_topup: money-in -> purchased bucket, idempotent on the PI id.
create or replace function public.company_credit_topup(
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
    id, creed_id, user_id, type, amount_micro_usd, balance_after_micro_usd,
    stripe_payment_intent_id, bucket
  )
  values (
    gen_random_uuid()::text, p_creed_id, (select owner_user_id from public.creeds where id = p_creed_id),
    'topup', p_amount_micro, 0, p_payment_intent_id, 'purchased'
  )
  on conflict (stripe_payment_intent_id) do nothing;
  if not found then
    select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
      into v_granted, v_purchased from public.creed_company_credits where creed_id = p_creed_id;
    return coalesce(v_granted, 0) + coalesce(v_purchased, 0);
  end if;
  insert into public.creed_company_credits (creed_id, purchased_micro_usd, updated_at)
  values (p_creed_id, p_amount_micro, timezone('utc'::text, now()))
  on conflict (creed_id) do update
    set purchased_micro_usd = public.creed_company_credits.purchased_micro_usd + excluded.purchased_micro_usd,
        updated_at = timezone('utc'::text, now())
  returning granted_micro_usd, purchased_micro_usd into v_granted, v_purchased;
  update public.creed_credit_transactions
    set balance_after_micro_usd = v_granted + v_purchased
    where stripe_payment_intent_id = p_payment_intent_id;
  return v_granted + v_purchased;
end;
$$;

revoke all on function public.company_grant_allowance(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.company_grant_allowance(uuid, bigint, text) to service_role;
revoke all on function public.company_debit_credits(uuid, bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function public.company_debit_credits(uuid, bigint, text, text, uuid) to service_role;
revoke all on function public.company_credit_topup(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.company_credit_topup(uuid, bigint, text) to service_role;
