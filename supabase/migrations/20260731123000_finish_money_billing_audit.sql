create table if not exists public.creed_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  creed_id uuid not null references public.creeds(id) on delete cascade,
  reserved_granted_micro_usd bigint not null check (reserved_granted_micro_usd >= 0),
  reserved_purchased_micro_usd bigint not null check (reserved_purchased_micro_usd >= 0),
  feature text not null,
  model_id text not null,
  spent_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'cancelled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

alter table public.creed_credit_reservations enable row level security;
revoke all on table public.creed_credit_reservations from public, anon, authenticated;

create index if not exists creed_credit_reservations_open_idx
  on public.creed_credit_reservations (creed_id, created_at)
  where status = 'reserved';

create unique index if not exists creeds_one_company_per_owner_idx
  on public.creeds (owner_user_id)
  where type = 'company' and owner_user_id is not null;

create or replace function public.accept_company_invite(
  p_invite_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.creed_invites%rowtype;
  b public.creed_company_billing%rowtype;
  v_used integer;
begin
  select * into i from public.creed_invites where id = p_invite_id for update;
  if not found or i.status <> 'pending' or i.expires_at <= now() then return 'invalid'; end if;
  select * into b from public.creed_company_billing where creed_id = i.creed_id for update;
  if not found then return 'no_seats'; end if;
  select
    (select count(*) from public.creed_members where creed_id = i.creed_id) +
    (select count(*) from public.creed_invites where creed_id = i.creed_id and status = 'pending' and id <> i.id)
    into v_used;
  if v_used >= b.seats_included + b.extra_seats then return 'no_seats'; end if;
  insert into public.creed_members (creed_id, user_id, role)
    values (i.creed_id, p_user_id, i.role)
    on conflict (creed_id, user_id) do nothing;
  update public.creed_invites set status = 'accepted', updated_at = now() where id = i.id;
  return 'accepted';
end;
$$;

create or replace function public.reserve_credits(
  p_creed_id uuid,
  p_amount_micro bigint,
  p_feature text,
  p_model_id text,
  p_spent_by uuid
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

  if v_granted + v_purchased < p_amount_micro then
    raise exception 'insufficient_credits';
  end if;
  v_from_granted := least(v_granted, p_amount_micro);
  v_from_purchased := p_amount_micro - v_from_granted;
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

create or replace function public.settle_credit_reservation(
  p_reservation_id uuid,
  p_actual_micro bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.creed_credit_reservations%rowtype;
  v_reserved bigint;
  v_actual bigint;
  v_used_granted bigint;
  v_used_purchased bigint;
  v_balance bigint;
  v_bucket text;
begin
  select * into r from public.creed_credit_reservations
    where id = p_reservation_id for update;
  if not found or r.status <> 'reserved' then raise exception 'invalid_reservation'; end if;
  v_reserved := r.reserved_granted_micro_usd + r.reserved_purchased_micro_usd;
  v_actual := greatest(p_actual_micro, 0);
  v_used_granted := least(r.reserved_granted_micro_usd, v_actual);
  v_used_purchased := least(r.reserved_purchased_micro_usd, v_actual - v_used_granted);
  update public.creed_credits set
    granted_micro_usd = granted_micro_usd + (r.reserved_granted_micro_usd - v_used_granted),
    purchased_micro_usd = purchased_micro_usd + (r.reserved_purchased_micro_usd - v_used_purchased)
      - greatest(v_actual - v_reserved, 0),
    updated_at = now()
    where creed_id = r.creed_id
    returning granted_micro_usd + purchased_micro_usd into v_balance;
  update public.creed_credit_reservations set status = 'settled', settled_at = now()
    where id = r.id;
  if v_actual > 0 then
    v_bucket := case when v_used_granted > 0 and v_used_purchased > 0 then 'mixed'
      when v_used_granted > 0 then 'granted' else 'purchased' end;
    insert into public.creed_credit_transactions (
      id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
      feature, model_id, bucket, spent_by_user_id
    ) values (
      gen_random_uuid()::text, r.creed_id, 'debit', v_actual, v_balance,
      r.feature, r.model_id, v_bucket, r.spent_by_user_id
    );
  end if;
  return v_balance;
end;
$$;

create or replace function public.cancel_credit_reservation(p_reservation_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select public.settle_credit_reservation(p_reservation_id, 0);
$$;

create or replace function public.refund_credit_topup(p_payment_intent_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.creed_credit_transactions%rowtype;
  v_refund_id text := 'refund:' || p_payment_intent_id;
begin
  if exists (select 1 from public.creed_credit_transactions where id = v_refund_id) then return false; end if;
  select * into t from public.creed_credit_transactions
    where stripe_payment_intent_id = p_payment_intent_id and type = 'topup'
    for update;
  if not found then return false; end if;
  update public.creed_credits set
    purchased_micro_usd = greatest(0, purchased_micro_usd - t.amount_micro_usd),
    updated_at = now()
    where creed_id = t.creed_id;
  insert into public.creed_credit_transactions (
    id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
    bucket
  ) select v_refund_id, t.creed_id, 'refund', t.amount_micro_usd,
    granted_micro_usd + purchased_micro_usd, 'purchased'
    from public.creed_credits where creed_id = t.creed_id;
  return true;
end;
$$;

alter table public.creed_credit_transactions drop constraint if exists creed_credit_transactions_type_check;
alter table public.creed_credit_transactions add constraint creed_credit_transactions_type_check
  check (type in ('topup', 'debit', 'grant', 'refund'));

revoke all on function public.reserve_credits(uuid, bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, bigint, text, text, uuid) to service_role;
revoke all on function public.settle_credit_reservation(uuid, bigint) from public, anon, authenticated;
grant execute on function public.settle_credit_reservation(uuid, bigint) to service_role;
revoke all on function public.cancel_credit_reservation(uuid) from public, anon, authenticated;
grant execute on function public.cancel_credit_reservation(uuid) to service_role;
revoke all on function public.refund_credit_topup(text) from public, anon, authenticated;
grant execute on function public.refund_credit_topup(text) to service_role;
revoke all on function public.accept_company_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_company_invite(uuid, uuid) to service_role;
