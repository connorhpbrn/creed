-- Account credits home: Cloud $5/mo + top-ups + giveaways live on one owned
-- Creed wallet the user picks. Spend can still happen from any owned Creed;
-- this row only chooses where the pot is kept.

create table if not exists public.creed_credit_homes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creed_id uuid not null references public.creeds(id) on delete restrict,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.creed_credit_homes is
  'Which owned Creed holds the account Cloud/bonus credit pot.';

create index if not exists creed_credit_homes_creed_id_idx
  on public.creed_credit_homes (creed_id);

alter table public.creed_credit_homes enable row level security;

drop policy if exists "users read own credit home" on public.creed_credit_homes;
create policy "users read own credit home"
  on public.creed_credit_homes for select
  using (auth.uid() = user_id);

-- Writes go through service-role helpers so ownership can be checked server-side.
revoke all on table public.creed_credit_homes from anon;
grant select on table public.creed_credit_homes to authenticated;

-- Backfill: each entitled or credited user gets their oldest owned Creed
-- (Personal first when present).
insert into public.creed_credit_homes (user_id, creed_id)
select distinct on (c.owner_user_id)
  c.owner_user_id,
  c.id
from public.creeds c
where c.owner_user_id is not null
  and (
    exists (
      select 1 from public.creed_entitlements e
      where e.user_id = c.owner_user_id
        and e.status in ('active', 'trialing', 'past_due')
    )
    or exists (
      select 1 from public.creed_credits cc where cc.creed_id = c.id
        and (cc.granted_micro_usd > 0 or cc.purchased_micro_usd > 0)
    )
  )
order by
  c.owner_user_id,
  case when c.type = 'personal' then 0 else 1 end,
  c.created_at asc
on conflict (user_id) do nothing;

-- Move the whole pot (granted + purchased + period key) from one Creed wallet
-- to another. Used when the account home Creed changes.
create or replace function public.transfer_credit_home(
  p_from_creed_id uuid,
  p_to_creed_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted bigint;
  v_purchased bigint;
  v_period_key text;
  v_period_start timestamptz;
  v_to_granted bigint;
  v_to_purchased bigint;
begin
  if p_from_creed_id is null or p_to_creed_id is null then
    raise exception 'credit_home_missing_creed';
  end if;
  if p_from_creed_id = p_to_creed_id then
    return;
  end if;

  insert into public.creed_credits (creed_id)
  values (p_from_creed_id)
  on conflict (creed_id) do nothing;

  insert into public.creed_credits (creed_id)
  values (p_to_creed_id)
  on conflict (creed_id) do nothing;

  select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0),
         grant_period_key, grant_period_start
    into v_granted, v_purchased, v_period_key, v_period_start
    from public.creed_credits
    where creed_id = p_from_creed_id
    for update;

  select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_to_granted, v_to_purchased
    from public.creed_credits
    where creed_id = p_to_creed_id
    for update;

  if v_granted = 0 and v_purchased = 0 then
    -- Still copy period metadata if the source had a fresh empty grant period.
    if v_period_key is not null and v_to_granted = 0 then
      update public.creed_credits
        set grant_period_key = v_period_key,
            grant_period_start = v_period_start,
            updated_at = timezone('utc'::text, now())
        where creed_id = p_to_creed_id;
    end if;
    return;
  end if;

  update public.creed_credits
    set granted_micro_usd = v_to_granted + v_granted,
        purchased_micro_usd = v_to_purchased + v_purchased,
        grant_period_key = coalesce(v_period_key, grant_period_key),
        grant_period_start = coalesce(v_period_start, grant_period_start),
        updated_at = timezone('utc'::text, now())
    where creed_id = p_to_creed_id;

  update public.creed_credits
    set granted_micro_usd = 0,
        purchased_micro_usd = 0,
        grant_period_key = null,
        grant_period_start = null,
        updated_at = timezone('utc'::text, now())
    where creed_id = p_from_creed_id;
end;
$$;

revoke all on function public.transfer_credit_home(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_credit_home(uuid, uuid) to service_role;
