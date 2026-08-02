-- Company plan hardening (SAFE TO APPLY NOW). Clears the advisor findings that
-- the part 1-3 migrations introduced, so the DB stays immaculate.
--
--   1. Revoke `anon` EXECUTE on the three helper functions. Supabase's default
--      privileges grant EXECUTE to anon + authenticated on every new function;
--      `revoke ... from public` does not remove that explicit anon grant, so
--      creed_type() was reachable by anon over PostgREST RPC (a minor
--      Creed-type enumeration leak) and creed_role()/creed_section_permission()
--      tripped the anon-security-definer lint. This mirrors the clean posture of
--      the shipped credit_spend_total() (authenticated + service_role only). The
--      functions are only ever needed by authenticated RLS evaluation and the
--      service-role server routes, so anon loses nothing.
--   2. Rewrite the two new policies that call auth.uid() directly to use
--      (select auth.uid()), so the planner evaluates it once per query instead
--      of once per row (the auth_rls_initplan lint). Policies that go through
--      creed_role() are already fine (the call is inside a STABLE function).
--   3. Index creed_member_section_permissions.user_id: the PK leads with
--      creed_id, so the user_id foreign key had no covering index.

-- 1. Lock the helpers to authenticated + service_role only.
revoke all on function public.creed_role(uuid) from anon;
revoke all on function public.creed_type(uuid) from anon;
revoke all on function public.creed_section_permission(uuid, text) from anon;

-- 2a. Member section permissions: (select auth.uid()) + unchanged role check.
drop policy if exists "read member section permissions" on public.creed_member_section_permissions;
create policy "read member section permissions"
  on public.creed_member_section_permissions
  for select
  using (
    user_id = (select auth.uid())
    or public.creed_role(creed_id) in ('owner', 'admin')
  );

-- 2b. Token grants: (select auth.uid()) inside the ownership subquery.
drop policy if exists "users read own token grants" on public.oauth_token_creeds;
create policy "users read own token grants"
  on public.oauth_token_creeds
  for select
  using (exists (
    select 1 from public.oauth_tokens t
    where t.id = token_id and t.user_id = (select auth.uid())
  ));

-- 3. Covering index for the user_id foreign key.
create index if not exists creed_member_section_permissions_user_idx
  on public.creed_member_section_permissions (user_id);
