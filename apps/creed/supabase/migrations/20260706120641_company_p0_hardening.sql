-- Company P0 hardening.
--
-- This migration fixes correctness issues found in the Company review without
-- changing the user-facing product model:
--
-- 1. Lifetime extra-seat purchases are applied through one transactional RPC.
-- 2. Ownership transfer validates row counts inside the RPC before committing.
-- 3. Service-only tables get explicit deny-all RLS policies so the intended
--    access model is documented in the database.
-- 4. Missing foreign-key indexes flagged by the advisor are added.

-- Transactionally apply a one-time lifetime seat purchase. The purchase row and
-- extra seat increment commit together, or neither commits.
create or replace function public.apply_company_lifetime_seat_purchase(
  p_stripe_session_id text,
  p_creed_id uuid,
  p_seats integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
  v_updated integer;
begin
  if p_stripe_session_id is null or length(trim(p_stripe_session_id)) = 0 then
    raise exception 'stripe session id is required';
  end if;

  if p_creed_id is null then
    raise exception 'creed id is required';
  end if;

  if p_seats is null or p_seats <= 0 then
    raise exception 'seat count must be positive';
  end if;

  insert into public.creed_seat_purchases (stripe_session_id, creed_id, seats)
  values (p_stripe_session_id, p_creed_id, p_seats)
  on conflict (stripe_session_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  update public.creed_company_billing
    set extra_seats = coalesce(extra_seats, 0) + p_seats,
        updated_at = timezone('utc'::text, now())
    where creed_id = p_creed_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'company billing row not found for creed %', p_creed_id;
  end if;

  return true;
end;
$$;

revoke all on function public.apply_company_lifetime_seat_purchase(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.apply_company_lifetime_seat_purchase(text, uuid, integer)
  to service_role;

-- Recreate ownership transfer with internal validation. App-side checks are
-- still useful for friendly errors, but the database is the final boundary.
create or replace function public.transfer_creed_ownership(
  p_creed_id uuid,
  p_from uuid,
  p_to uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_creed_id is null or p_from is null or p_to is null then
    raise exception 'creed id, source owner, and target owner are required';
  end if;

  if p_from = p_to then
    raise exception 'target already owns this creed';
  end if;

  if not exists (
    select 1
    from public.creeds c
    where c.id = p_creed_id
      and c.type = 'company'
      and c.owner_user_id = p_from
  ) then
    raise exception 'source user is not the company owner';
  end if;

  if not exists (
    select 1
    from public.creed_members m
    where m.creed_id = p_creed_id
      and m.user_id = p_to
      and m.role in ('admin', 'member')
  ) then
    raise exception 'target user is not an active non-owner member';
  end if;

  update public.creed_members
    set role = 'admin'
    where creed_id = p_creed_id
      and user_id = p_from
      and role = 'owner';

  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'expected exactly one outgoing owner, got %', v_count;
  end if;

  update public.creed_members
    set role = 'owner'
    where creed_id = p_creed_id
      and user_id = p_to
      and role in ('admin', 'member');

  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'expected exactly one incoming owner, got %', v_count;
  end if;

  update public.creeds
    set owner_user_id = p_to,
        updated_at = timezone('utc'::text, now())
    where id = p_creed_id
      and owner_user_id = p_from;

  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'expected exactly one creed owner row, got %', v_count;
  end if;

  update public.creed_company_billing
    set owner_user_id = p_to,
        updated_at = timezone('utc'::text, now())
    where creed_id = p_creed_id;
end;
$$;

revoke all on function public.transfer_creed_ownership(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_creed_ownership(uuid, uuid, uuid)
  to service_role;

-- Service-only or manager-read tables should not be accidentally exposed
-- through a future Data API grant. Deny-all policies make the intent explicit
-- while the service role continues to bypass RLS for trusted server routes.
do $$
begin
  if to_regclass('public.creed_company_github_integration') is not null then
    drop policy if exists "deny client access to company github integration" on public.creed_company_github_integration;
    create policy "deny client access to company github integration"
      on public.creed_company_github_integration
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.creed_company_version_control') is not null then
    drop policy if exists "deny client writes to company version control" on public.creed_company_version_control;
    create policy "deny client writes to company version control"
      on public.creed_company_version_control
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.creed_seat_purchases') is not null then
    drop policy if exists "deny client access to seat purchases" on public.creed_seat_purchases;
    create policy "deny client access to seat purchases"
      on public.creed_seat_purchases
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.oauth_authorization_codes') is not null then
    drop policy if exists "deny client access to oauth authorization codes" on public.oauth_authorization_codes;
    create policy "deny client access to oauth authorization codes"
      on public.oauth_authorization_codes
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.oauth_clients') is not null then
    drop policy if exists "deny client access to oauth clients" on public.oauth_clients;
    create policy "deny client access to oauth clients"
      on public.oauth_clients
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

-- Advisor-reported missing foreign-key indexes.
create index if not exists creed_activity_proposal_id_idx
  on public.creed_activity (proposal_id);

create index if not exists creed_credits_user_id_idx
  on public.creed_credits (user_id);

create index if not exists creed_member_agent_permissions_user_id_idx
  on public.creed_member_agent_permissions (user_id);

-- rls_auto_enable is an internal helper and should not be callable by clients.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
