-- Merge the company credit wallet into the shared creed_credits table, so personal
-- and company credits are ONE wallet + ONE RPC set keyed by creed_id. The ledger
-- (creed_credit_transactions) was already unified. Company billing + AI settings
-- stay in their own tables (they genuinely differ); only the wallet merges.
-- GATED: ship with the credits code that points company reads/writes at
-- creed_credits + the unified RPCs.

-- 1. Move company wallet rows into creed_credits (keyed by creed_id; user_id stays
--    null for a company wallet). Idempotent via the creed_id PK.
insert into public.creed_credits (
  creed_id, granted_micro_usd, purchased_micro_usd, grant_period_key, grant_period_start, updated_at
)
select creed_id, granted_micro_usd, purchased_micro_usd, grant_period_key, grant_period_start, updated_at
from public.creed_company_credits
on conflict (creed_id) do update set
  granted_micro_usd = excluded.granted_micro_usd,
  purchased_micro_usd = excluded.purchased_micro_usd,
  grant_period_key = excluded.grant_period_key,
  grant_period_start = excluded.grant_period_start,
  updated_at = excluded.updated_at;

-- 2. The company wallet table + its duplicate RPC set are now redundant.
drop table if exists public.creed_company_credits;
drop function if exists public.company_grant_allowance(uuid, bigint, text);
drop function if exists public.company_debit_credits(uuid, bigint, text, text, uuid);
drop function if exists public.company_credit_topup(uuid, bigint, text);
drop function if exists public.company_credit_spend_total(uuid);

-- 3. credit_spend_total now serves both paths. Personal reads it via the session
--    client (auth.uid() present -> member check). Company reads it via the admin
--    (service-role) client, where auth.uid() is null; allow that trusted caller
--    through (the route already gated on company membership) while still blocking
--    an authenticated user from reading a Creed they don't belong to.
create or replace function public.credit_spend_total(p_creed_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or exists (
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
