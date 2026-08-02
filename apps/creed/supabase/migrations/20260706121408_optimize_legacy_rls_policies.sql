-- Optimize legacy user-scoped RLS policies.
--
-- Supabase advisors recommend wrapping auth.uid() in a scalar subquery so it is
-- evaluated once per statement instead of once per row. Keep the same access
-- model, but add explicit `to authenticated` clauses while touching the policy.

drop policy if exists "users can manage their creed tokens" on public.creed_tokens;
create policy "users can manage their creed tokens"
  on public.creed_tokens
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can manage their creed integrations" on public.creed_integrations;
create policy "users can manage their creed integrations"
  on public.creed_integrations
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can manage their creed version control" on public.creed_version_control;
create policy "users can manage their creed version control"
  on public.creed_version_control
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can manage their creed ai settings" on public.creed_ai_settings;
create policy "users can manage their creed ai settings"
  on public.creed_ai_settings
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can read their creed ai usage" on public.creed_ai_usage;
drop policy if exists "members read company ai usage" on public.creed_ai_usage;
create policy "users and managers can read creed ai usage"
  on public.creed_ai_usage
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      creed_id is not null
      and public.creed_role(creed_id) in ('owner', 'admin')
    )
  );

drop policy if exists "users can insert their creed ai usage" on public.creed_ai_usage;
create policy "users can insert their creed ai usage"
  on public.creed_ai_usage
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "creed_audit_log_select_own" on public.creed_audit_log;
create policy "creed_audit_log_select_own"
  on public.creed_audit_log
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Read own entitlement" on public.creed_entitlements;
create policy "Read own entitlement"
  on public.creed_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "oauth_tokens_select_own" on public.oauth_tokens;
create policy "oauth_tokens_select_own"
  on public.oauth_tokens
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "oauth_tokens_delete_own" on public.oauth_tokens;
create policy "oauth_tokens_delete_own"
  on public.oauth_tokens
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "members read own agent permissions" on public.creed_member_agent_permissions;
create policy "members read own agent permissions"
  on public.creed_member_agent_permissions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
