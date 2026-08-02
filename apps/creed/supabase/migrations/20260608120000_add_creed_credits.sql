-- Prepaid credits: managed AI without a BYOK OpenRouter key.
--
-- Users buy a dollar balance (Stripe), Creed runs the AI on its own platform
-- key, and deducts realCost x markup per call. Money is stored in integer
-- micro-USD (bigint) to avoid float entirely ($1 = 1_000_000 micro).
--
-- Two tables: creed_credits (the balance, one row per user) and
-- creed_credit_transactions (an append-only ledger of top-ups and debits).
-- Both are READ-only to the user via RLS; every WRITE happens through the two
-- security-definer RPCs below, which are EXECUTE-granted to service_role only.
-- That lockdown is load-bearing: without it any authenticated user could call
-- credit_topup() for their own id and mint themselves free balance.

create table if not exists public.creed_credits (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  balance_micro_usd bigint not null default 0,
  created_at        timestamptz not null default timezone('utc'::text, now()),
  updated_at        timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.creed_credit_transactions (
  id                       text primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  type                     text not null check (type in ('topup', 'debit')),
  -- Always positive; `type` carries the direction. Keeps the ledger unambiguous.
  amount_micro_usd         bigint not null check (amount_micro_usd >= 0),
  balance_after_micro_usd  bigint not null,
  feature                  text,
  model_id                 text,
  -- Idempotency anchor for top-ups (Stripe can redeliver an event). NULLs are
  -- allowed by UNIQUE, so the CHECK forces every topup row to carry a PI id -
  -- otherwise two NULL-pi topups could both insert and double-credit.
  stripe_payment_intent_id text unique,
  created_at               timestamptz not null default timezone('utc'::text, now()),
  check (type <> 'topup' or stripe_payment_intent_id is not null)
);

create index if not exists creed_credit_transactions_user_created_idx
  on public.creed_credit_transactions (user_id, created_at desc);

-- Per-user AI billing mode. Default 'credits' for everyone (existing rows
-- backfill to 'credits'); saved BYOK keys are preserved so flipping back to
-- 'byok' restores the user's old setup with no re-entry.
alter table public.creed_ai_settings
  add column if not exists ai_mode text not null default 'credits'
  check (ai_mode in ('credits', 'byok'));

-- RLS: the user may READ their own balance + ledger (so server components and
-- the settings UI can show them via the session client, no admin needed). No
-- insert/update policy exists, so the only write path is the service-role RPCs.
alter table public.creed_credits enable row level security;
drop policy if exists "Read own credits" on public.creed_credits;
create policy "Read own credits"
  on public.creed_credits
  for select
  using (auth.uid() = user_id);

alter table public.creed_credit_transactions enable row level security;
drop policy if exists "Read own credit transactions" on public.creed_credit_transactions;
create policy "Read own credit transactions"
  on public.creed_credit_transactions
  for select
  using (auth.uid() = user_id);

-- credit_topup: idempotent money-in. Insert the ledger row FIRST with
-- `on conflict do nothing`; if Stripe redelivered the same PaymentIntent the
-- unique constraint makes this a no-op and we return the unchanged balance
-- without crediting twice. Only when a fresh row was inserted do we bump the
-- balance, then backfill balance_after on that row. One transaction, atomic.
create or replace function public.credit_topup(
  p_user_id uuid,
  p_amount_micro bigint,
  p_payment_intent_id text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  insert into public.creed_credit_transactions (
    id, user_id, type, amount_micro_usd, balance_after_micro_usd, stripe_payment_intent_id
  )
  values (
    gen_random_uuid()::text, p_user_id, 'topup', p_amount_micro, 0, p_payment_intent_id
  )
  on conflict (stripe_payment_intent_id) do nothing;

  if not found then
    -- Duplicate delivery: already credited. Return current balance untouched.
    return coalesce(
      (select balance_micro_usd from public.creed_credits where user_id = p_user_id),
      0
    );
  end if;

  insert into public.creed_credits (user_id, balance_micro_usd, updated_at)
  values (p_user_id, p_amount_micro, timezone('utc'::text, now()))
  on conflict (user_id) do update
    set balance_micro_usd = public.creed_credits.balance_micro_usd + excluded.balance_micro_usd,
        updated_at = timezone('utc'::text, now())
  returning balance_micro_usd into v_balance;

  update public.creed_credit_transactions
    set balance_after_micro_usd = v_balance
    where stripe_payment_intent_id = p_payment_intent_id;

  return v_balance;
end;
$$;

-- debit_credits: atomic money-out. The upsert takes a row lock on conflict, so
-- concurrent debits serialise (no lost update). The caller gates on balance > 0
-- before the AI call; the post-call debit may leave the balance slightly
-- negative on the last run, which is accepted (next call is blocked).
create or replace function public.debit_credits(
  p_user_id uuid,
  p_amount_micro bigint,
  p_feature text,
  p_model_id text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  insert into public.creed_credits (user_id, balance_micro_usd, updated_at)
  values (p_user_id, -p_amount_micro, timezone('utc'::text, now()))
  on conflict (user_id) do update
    set balance_micro_usd = public.creed_credits.balance_micro_usd - p_amount_micro,
        updated_at = timezone('utc'::text, now())
  returning balance_micro_usd into v_balance;

  insert into public.creed_credit_transactions (
    id, user_id, type, amount_micro_usd, balance_after_micro_usd, feature, model_id
  )
  values (
    gen_random_uuid()::text, p_user_id, 'debit', p_amount_micro, v_balance, p_feature, p_model_id
  );

  return v_balance;
end;
$$;

-- Lock both RPCs to service_role only. SECURITY DEFINER functions are
-- PUBLIC-executable by default; revoke that before granting, mirroring
-- 20260531130000_secure_increment_mcp_read.sql.
revoke all on function public.credit_topup(uuid, bigint, text) from public;
revoke all on function public.credit_topup(uuid, bigint, text) from anon;
revoke all on function public.credit_topup(uuid, bigint, text) from authenticated;
grant execute on function public.credit_topup(uuid, bigint, text) to service_role;

revoke all on function public.debit_credits(uuid, bigint, text, text) from public;
revoke all on function public.debit_credits(uuid, bigint, text, text) from anon;
revoke all on function public.debit_credits(uuid, bigint, text, text) from authenticated;
grant execute on function public.debit_credits(uuid, bigint, text, text) to service_role;
