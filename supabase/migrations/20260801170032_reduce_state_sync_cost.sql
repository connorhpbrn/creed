-- One cheap, indexed state version replaces the full company-state fan-out on
-- unchanged sync polls. Child-table triggers advance it transactionally.
alter table public.creeds
  add column if not exists sync_updated_at timestamptz not null
  default timezone('utc'::text, now());

create or replace function private.touch_creed_sync_tick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_creed_id uuid;
begin
  target_creed_id := case when tg_op = 'DELETE' then old.creed_id else new.creed_id end;
  update public.creeds
  set sync_updated_at = timezone('utc'::text, clock_timestamp())
  where id = target_creed_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.touch_creed_sync_tick() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'creed_sections', 'creed_proposals', 'creed_activity', 'creed_members',
    'creed_invites', 'creed_member_section_permissions', 'creed_company_billing',
    'creed_connections', 'creed_mcp_clients', 'creed_member_agent_permissions',
    'creed_company_version_control'
  ]
  loop
    execute format('drop trigger if exists touch_creed_sync_tick on public.%I', table_name);
    execute format(
      'create trigger touch_creed_sync_tick after insert or update or delete on public.%I for each row execute function private.touch_creed_sync_tick()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.get_creed_state_tick(p_creed_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select floor(extract(epoch from greatest(updated_at, sync_updated_at)) * 1000)::bigint
  from public.creeds
  where id = p_creed_id;
$$;
revoke all on function public.get_creed_state_tick(uuid) from public, anon, authenticated;
grant execute on function public.get_creed_state_tick(uuid) to service_role;

-- Resolve an entire company roster in one database call. The privileged join
-- stays private; the exposed wrapper is SECURITY INVOKER and service-role only.
create or replace function private.get_member_profiles(p_creed_id uuid)
returns table(user_id uuid, role text, email text, raw_user_meta_data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.role, coalesce(u.email, ''), coalesce(u.raw_user_meta_data, '{}'::jsonb)
  from public.creed_members m
  join auth.users u on u.id = m.user_id
  where m.creed_id = p_creed_id
  order by m.created_at;
$$;
revoke all on function private.get_member_profiles(uuid) from public, anon, authenticated;
grant execute on function private.get_member_profiles(uuid) to service_role;

create or replace function public.get_member_profiles(p_creed_id uuid)
returns table(user_id uuid, role text, email text, raw_user_meta_data jsonb)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.get_member_profiles(p_creed_id); $$;
revoke all on function public.get_member_profiles(uuid) from public, anon, authenticated;
grant execute on function public.get_member_profiles(uuid) to service_role;
