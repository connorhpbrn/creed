-- Bonus credits (Cloud granted bucket) are assignable to one Creed.
-- Lasting purchased balances stay on each Creed and do not move with Bonus.

comment on table public.creed_credit_homes is
  'Which owned Creed holds the account Cloud Bonus (granted) credits.';

-- Move only granted + period metadata. Purchased stays on each Creed.
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
  v_period_key text;
  v_period_start timestamptz;
  v_to_granted bigint;
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

  select coalesce(granted_micro_usd, 0), grant_period_key, grant_period_start
    into v_granted, v_period_key, v_period_start
    from public.creed_credits
    where creed_id = p_from_creed_id
    for update;

  select coalesce(granted_micro_usd, 0)
    into v_to_granted
    from public.creed_credits
    where creed_id = p_to_creed_id
    for update;

  if v_granted = 0 then
    if v_period_key is not null and v_to_granted = 0 then
      update public.creed_credits
        set grant_period_key = v_period_key,
            grant_period_start = v_period_start,
            updated_at = timezone('utc'::text, now())
        where creed_id = p_to_creed_id;
    end if;

    update public.creed_credits
      set grant_period_key = null,
          grant_period_start = null,
          updated_at = timezone('utc'::text, now())
      where creed_id = p_from_creed_id;

    return;
  end if;

  update public.creed_credits
    set granted_micro_usd = v_to_granted + v_granted,
        grant_period_key = coalesce(v_period_key, grant_period_key),
        grant_period_start = coalesce(v_period_start, grant_period_start),
        updated_at = timezone('utc'::text, now())
    where creed_id = p_to_creed_id;

  update public.creed_credits
    set granted_micro_usd = 0,
        grant_period_key = null,
        grant_period_start = null,
        updated_at = timezone('utc'::text, now())
    where creed_id = p_from_creed_id;
end;
$$;

revoke all on function public.transfer_credit_home(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_credit_home(uuid, uuid) to service_role;

-- Collapse any granted balance left on non-home Creed wallets onto the home.
-- Purchased balances are left untouched.
do $$
declare
  r record;
begin
  for r in
    select
      h.user_id,
      h.creed_id as home_id,
      c.creed_id as stray_id,
      c.granted_micro_usd as stray_granted,
      c.grant_period_key as stray_period_key,
      c.grant_period_start as stray_period_start
    from public.creed_credit_homes h
    join public.creed_credits c
      on c.creed_id <> h.creed_id
     and coalesce(c.granted_micro_usd, 0) > 0
    join public.creeds g
      on g.id = c.creed_id
     and g.owner_user_id = h.user_id
  loop
    insert into public.creed_credits (creed_id)
    values (r.home_id)
    on conflict (creed_id) do nothing;

    update public.creed_credits
      set granted_micro_usd = coalesce(granted_micro_usd, 0) + r.stray_granted,
          grant_period_key = coalesce(grant_period_key, r.stray_period_key),
          grant_period_start = coalesce(grant_period_start, r.stray_period_start),
          updated_at = timezone('utc'::text, now())
      where creed_id = r.home_id;

    update public.creed_credits
      set granted_micro_usd = 0,
          grant_period_key = null,
          grant_period_start = null,
          updated_at = timezone('utc'::text, now())
      where creed_id = r.stray_id;
  end loop;
end;
$$;
