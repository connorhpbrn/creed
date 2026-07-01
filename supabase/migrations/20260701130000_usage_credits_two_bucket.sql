-- Two-bucket usage credits: a granted monthly allowance + purchased top-ups.
--
-- The wallet was a single balance (creed_credits.balance_micro_usd). It now
-- splits into two buckets, both in integer micro-USD ($1 = 1_000_000), stored
-- in MARKED-UP dollars (what the user can spend), so a debit of realCost x
-- markup and a $5 allowance are measured in the same units:
--
--   granted_micro_usd   the plan's allowance. RESETS each period (use it or
--                       lose it). Spent FIRST. Lifetime's one-time grant lives
--                       here too, with a non-advancing period key so it never
--                       resets.
--   purchased_micro_usd top-ups. Roll over, never expire. Spent SECOND.
--
-- All mutations stay behind service-role-only security-definer RPCs; without
-- that lockdown any authenticated user could mint their own allowance.
--
-- Column drop of the old balance_micro_usd is deferred to a later migration
-- (deploy-buffer rule): this migration stops writing it, a follow-up drops it.

-- ── creed_credits: add the two buckets + grant bookkeeping ──────────────────
alter table public.creed_credits
  add column if not exists granted_micro_usd   bigint not null default 0,
  add column if not exists purchased_micro_usd bigint not null default 0,
  -- The period the current granted balance was issued for. For monthly/yearly
  -- plans this is 'YYYY-MM'; for a lifetime grant it is a fixed key ('lifetime')
  -- that never advances, so the one-time grant is issued once and never resets.
  add column if not exists grant_period_key    text,
  add column if not exists grant_period_start  timestamptz;

-- Backfill: the old single balance was all effectively purchased (top-ups roll
-- over), so move it into the purchased bucket with no forfeiture.
update public.creed_credits
  set purchased_micro_usd = balance_micro_usd
  where purchased_micro_usd = 0 and balance_micro_usd <> 0;

-- ── creed_credit_transactions: allow 'grant' + record which bucket moved ─────
alter table public.creed_credit_transactions
  drop constraint if exists creed_credit_transactions_type_check;
alter table public.creed_credit_transactions
  add constraint creed_credit_transactions_type_check
  check (type in ('topup', 'debit', 'grant'));

alter table public.creed_credit_transactions
  add column if not exists bucket           text
    check (bucket is null or bucket in ('granted', 'purchased', 'mixed')),
  -- Idempotency anchor for grants: one grant row per (user, period).
  add column if not exists grant_period_key text;

-- A re-entrant lazy refresh in the same period must be a no-op, so a grant row
-- is unique per user+period. NULLs (topup/debit rows) are exempt.
create unique index if not exists creed_credit_transactions_grant_period_idx
  on public.creed_credit_transactions (user_id, grant_period_key)
  where type = 'grant';

-- ── creed_ai_usage: store the real charged (marked-up) amount per call ───────
-- The spend chart used to store at-cost and multiply by the markup at read
-- time, so changing the markup silently re-priced history. Storing the actual
-- charged micro makes the chart truthful and immune to markup changes.
alter table public.creed_ai_usage
  add column if not exists charged_micro_usd bigint;

-- Backfill so historical rows keep the amount they were BILLED at, not the new
-- rate. Credits rows were billed at the old 1.5x markup; byok rows are at-cost
-- (the user paid their own key). Chart then just sums charged_micro_usd.
update public.creed_ai_usage
  set charged_micro_usd = round(estimated_cost_usd * 1.5 * 1000000)
  where charged_micro_usd is null and ai_mode = 'credits';
update public.creed_ai_usage
  set charged_micro_usd = round(estimated_cost_usd * 1000000)
  where charged_micro_usd is null and ai_mode = 'byok';

-- ── creed_ai_settings: retire the per-user model pick ───────────────────────
-- The model is now server-selected per feature (hidden from the user), so
-- selected_model_id is no longer written. Drop its NOT NULL so new settings
-- rows insert without it; the column itself is dropped in a later migration
-- once no deployed code references it (deploy-buffer rule).
alter table public.creed_ai_settings
  alter column selected_model_id drop not null;

-- ── credit_topup: money-in lands in PURCHASED only ──────────────────────────
-- Same signature + idempotency (dedupe on the Stripe PaymentIntent id) as
-- before; only the target bucket changes.
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
  v_granted bigint;
  v_purchased bigint;
begin
  insert into public.creed_credit_transactions (
    id, user_id, type, amount_micro_usd, balance_after_micro_usd,
    stripe_payment_intent_id, bucket
  )
  values (
    gen_random_uuid()::text, p_user_id, 'topup', p_amount_micro, 0,
    p_payment_intent_id, 'purchased'
  )
  on conflict (stripe_payment_intent_id) do nothing;

  if not found then
    -- Duplicate delivery: already credited. Return current combined balance.
    select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
      into v_granted, v_purchased
      from public.creed_credits where user_id = p_user_id;
    return coalesce(v_granted, 0) + coalesce(v_purchased, 0);
  end if;

  insert into public.creed_credits (user_id, purchased_micro_usd, updated_at)
  values (p_user_id, p_amount_micro, timezone('utc'::text, now()))
  on conflict (user_id) do update
    set purchased_micro_usd = public.creed_credits.purchased_micro_usd + excluded.purchased_micro_usd,
        updated_at = timezone('utc'::text, now())
  returning granted_micro_usd, purchased_micro_usd into v_granted, v_purchased;

  update public.creed_credit_transactions
    set balance_after_micro_usd = v_granted + v_purchased
    where stripe_payment_intent_id = p_payment_intent_id;

  return v_granted + v_purchased;
end;
$$;

-- ── debit_credits: money-out drains GRANTED first, then PURCHASED ────────────
-- Signature unchanged (p_user_id, p_amount_micro, p_feature, p_model_id) so the
-- deductCredits caller is stable. Returns the combined post-debit balance.
-- Granted floors at 0; only the purchased bucket may go slightly negative on
-- the last run (the pre-call gate is on combined > 0), matching the old
-- single-balance tolerance.
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
  v_granted bigint;
  v_purchased bigint;
  v_from_granted bigint;
  v_from_purchased bigint;
  v_new_granted bigint;
  v_new_purchased bigint;
  v_bucket text;
begin
  -- Ensure a row exists, then lock it so concurrent debits serialise.
  insert into public.creed_credits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_granted, v_purchased
    from public.creed_credits where user_id = p_user_id for update;

  v_from_granted := least(greatest(v_granted, 0), p_amount_micro);
  v_from_purchased := p_amount_micro - v_from_granted;
  v_new_granted := v_granted - v_from_granted;
  v_new_purchased := v_purchased - v_from_purchased;

  update public.creed_credits
    set granted_micro_usd = v_new_granted,
        purchased_micro_usd = v_new_purchased,
        updated_at = timezone('utc'::text, now())
    where user_id = p_user_id;

  if v_from_granted > 0 and v_from_purchased > 0 then
    v_bucket := 'mixed';
  elsif v_from_granted > 0 then
    v_bucket := 'granted';
  else
    v_bucket := 'purchased';
  end if;

  insert into public.creed_credit_transactions (
    id, user_id, type, amount_micro_usd, balance_after_micro_usd,
    feature, model_id, bucket
  )
  values (
    gen_random_uuid()::text, p_user_id, 'debit', p_amount_micro,
    v_new_granted + v_new_purchased, p_feature, p_model_id, v_bucket
  );

  return v_new_granted + v_new_purchased;
end;
$$;

-- ── grant_allowance: reset the granted bucket to the plan allowance ──────────
-- Lazy, just-in-time, idempotent per period. When the caller's period key
-- differs from the stored one (a new month, or the first grant), granted is
-- SET to the allowance (a reset, so unused allowance does NOT roll over) and a
-- 'grant' ledger row is written. Same period key -> no-op. Lifetime passes a
-- fixed key so its one-time grant is issued once and never advances.
create or replace function public.grant_allowance(
  p_user_id uuid,
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
  insert into public.creed_credits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select grant_period_key, coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_current_key, v_granted, v_purchased
    from public.creed_credits where user_id = p_user_id for update;

  if v_current_key is distinct from p_period_key then
    update public.creed_credits
      set granted_micro_usd = p_allowance_micro,
          grant_period_key = p_period_key,
          grant_period_start = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      where user_id = p_user_id;

    insert into public.creed_credit_transactions (
      id, user_id, type, amount_micro_usd, balance_after_micro_usd, bucket, grant_period_key
    )
    values (
      gen_random_uuid()::text, p_user_id, 'grant', p_allowance_micro,
      p_allowance_micro + v_purchased, 'granted', p_period_key
    )
    on conflict do nothing;

    return p_allowance_micro + v_purchased;
  end if;

  return v_granted + v_purchased;
end;
$$;

-- Lock all three RPCs to service_role only (SECURITY DEFINER is PUBLIC-exec by
-- default; revoke before granting, mirroring the shipped migrations).
revoke all on function public.credit_topup(uuid, bigint, text) from public;
revoke all on function public.credit_topup(uuid, bigint, text) from anon;
revoke all on function public.credit_topup(uuid, bigint, text) from authenticated;
grant execute on function public.credit_topup(uuid, bigint, text) to service_role;

revoke all on function public.debit_credits(uuid, bigint, text, text) from public;
revoke all on function public.debit_credits(uuid, bigint, text, text) from anon;
revoke all on function public.debit_credits(uuid, bigint, text, text) from authenticated;
grant execute on function public.debit_credits(uuid, bigint, text, text) to service_role;

revoke all on function public.grant_allowance(uuid, bigint, text) from public;
revoke all on function public.grant_allowance(uuid, bigint, text) from anon;
revoke all on function public.grant_allowance(uuid, bigint, text) from authenticated;
grant execute on function public.grant_allowance(uuid, bigint, text) to service_role;
