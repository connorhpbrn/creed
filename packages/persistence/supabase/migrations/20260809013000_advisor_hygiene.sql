-- Schema hygiene from Supabase advisors:
-- 1. create_owned_creed: service_role only (explicit user id), not PostgREST-callable
-- 2. Wrap auth.uid() as (select auth.uid()) on hot RLS policies
-- 3. Drop duplicate unique indexes that mirror primary keys
-- 4. Collapse overlapping permissive SELECT policies

-- ---------------------------------------------------------------------------
-- 1. create_owned_creed: service_role + explicit owner
-- ---------------------------------------------------------------------------

drop function if exists public.create_owned_creed(text, text);

create or replace function public.create_owned_creed(
  p_user_id uuid,
  p_name text,
  p_type text
)
returns table (id uuid, type text, name text, onboarding_stage text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creed_id uuid;
  v_section_id text;
  v_section_name text;
begin
  if p_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  p_name := btrim(p_name);
  if p_name = '' or char_length(p_name) > 80 then
    raise exception 'invalid creed name' using errcode = '22023';
  end if;
  if p_type not in ('personal', 'shared') then
    raise exception 'invalid creed type' using errcode = '22023';
  end if;

  insert into public.creeds (type, name, owner_user_id, onboarding_stage)
  values (p_type, p_name, p_user_id, null)
  returning creeds.id into v_creed_id;

  insert into public.creed_members (creed_id, user_id, role)
  values (v_creed_id, p_user_id, 'owner');

  v_section_id := case when p_type = 'shared' then 'shared' else 'identity' end;
  v_section_name := case when p_type = 'shared' then 'Shared' else 'Identity' end;

  insert into public.creed_sections (
    user_id,
    section_id,
    position,
    kind,
    name,
    accent,
    payload,
    last_edited_by,
    last_edited_type,
    agent_writable,
    template,
    agent_permission,
    creed_id
  )
  values (
    p_user_id,
    v_section_id,
    0,
    'rich-text',
    v_section_name,
    'identity',
    jsonb_build_object(
      'content', '<p></p>',
      'template', 'identity',
      'agentWritable', true,
      'agentPermission', 'propose'
    ),
    'You',
    'user',
    true,
    'identity',
    'propose',
    v_creed_id
  );

  return query
  select created.id, created.type, created.name, created.onboarding_stage
  from public.creeds as created
  where created.id = v_creed_id;
end;
$$;

revoke all on function public.create_owned_creed(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_owned_creed(uuid, text, text)
  to service_role;

comment on function public.create_owned_creed(uuid, text, text) is
  'Atomically creates an owned Creed ready for the file. Service role only; caller must pass the authenticated user id.';

-- ---------------------------------------------------------------------------
-- 2 + 4. RLS initplan wraps + overlapping SELECT cleanup
-- ---------------------------------------------------------------------------

-- creed_credit_homes
drop policy if exists "users read own credit home" on public.creed_credit_homes;
create policy "users read own credit home"
  on public.creed_credit_homes
  for select
  using ((select auth.uid()) = user_id);

-- creed_entitlements
drop policy if exists "users read their cloud entitlement" on public.creed_entitlements;
create policy "users read their cloud entitlement"
  on public.creed_entitlements
  for select
  using ((select auth.uid()) = user_id);

-- creed_ai_usage: one SELECT policy covers own rows + shared owner/admin reads
drop policy if exists "users can read their creed ai usage" on public.creed_ai_usage;
drop policy if exists "members read shared ai usage" on public.creed_ai_usage;
drop policy if exists "users and managers can read creed ai usage" on public.creed_ai_usage;
create policy "users and managers can read creed ai usage"
  on public.creed_ai_usage
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      creed_id is not null
      and private.creed_role(creed_id) in ('owner', 'admin')
    )
  );

-- creed_quality_reports: SELECT via membership; mutations via own-user policies
drop policy if exists "users can manage their creed quality reports" on public.creed_quality_reports;
drop policy if exists "members read quality reports" on public.creed_quality_reports;
create policy "members read quality reports"
  on public.creed_quality_reports
  for select
  using (private.creed_role(creed_id) is not null);
create policy "users can insert their creed quality reports"
  on public.creed_quality_reports
  for insert
  with check ((select auth.uid()) = user_id);
create policy "users can update their creed quality reports"
  on public.creed_quality_reports
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users can delete their creed quality reports"
  on public.creed_quality_reports
  for delete
  using ((select auth.uid()) = user_id);

-- creed_mcp_read_events: one SELECT policy
drop policy if exists "creed_mcp_read_events_select_own" on public.creed_mcp_read_events;
drop policy if exists "members read mcp read events" on public.creed_mcp_read_events;
create policy "members read mcp read events"
  on public.creed_mcp_read_events
  for select
  using (
    (select auth.uid()) = user_id
    or private.creed_role(creed_id) is not null
  );

-- creed_ai_settings: ALL already covers SELECT
drop policy if exists "owners read creed ai settings" on public.creed_ai_settings;

-- creed_integrations: ALL covers SELECT for managers; keep members read for non-managers
drop policy if exists "managers manage creed integrations" on public.creed_integrations;
create policy "managers manage creed integrations"
  on public.creed_integrations
  for insert
  to authenticated
  with check (private.creed_role(creed_id) in ('owner', 'admin'));
create policy "managers update creed integrations"
  on public.creed_integrations
  for update
  to authenticated
  using (private.creed_role(creed_id) in ('owner', 'admin'))
  with check (private.creed_role(creed_id) in ('owner', 'admin'));
create policy "managers delete creed integrations"
  on public.creed_integrations
  for delete
  to authenticated
  using (private.creed_role(creed_id) in ('owner', 'admin'));

-- creed_version_control: same pattern
drop policy if exists "managers manage creed version control" on public.creed_version_control;
create policy "managers insert creed version control"
  on public.creed_version_control
  for insert
  to authenticated
  with check (private.creed_role(creed_id) in ('owner', 'admin'));
create policy "managers update creed version control"
  on public.creed_version_control
  for update
  to authenticated
  using (private.creed_role(creed_id) in ('owner', 'admin'))
  with check (private.creed_role(creed_id) in ('owner', 'admin'));
create policy "managers delete creed version control"
  on public.creed_version_control
  for delete
  to authenticated
  using (private.creed_role(creed_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Duplicate indexes that mirror primary keys
-- ---------------------------------------------------------------------------

drop index if exists public.creed_credits_creed_id_key;
drop index if exists public.creed_sections_creed_section_unique;
