-- Keep SECURITY DEFINER RLS helpers out of the Data API's exposed schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.creed_role(p_creed_id uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select role
  from public.creed_members
  where creed_id = p_creed_id and user_id = (select auth.uid());
$$;

create or replace function private.creed_type(p_creed_id uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select type from public.creeds where id = p_creed_id;
$$;

create or replace function private.creed_section_permission(p_creed_id uuid, p_section_id text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_role text;
  v_perm text;
begin
  v_role := private.creed_role(p_creed_id);
  if v_role is null then return null; end if;
  if v_role in ('owner', 'admin') then return 'direct'; end if;
  select permission into v_perm
  from public.creed_member_section_permissions
  where creed_id = p_creed_id
    and user_id = (select auth.uid())
    and section_id = p_section_id;
  return coalesce(v_perm, 'direct');
end;
$$;

revoke all on function private.creed_role(uuid) from public, anon;
revoke all on function private.creed_type(uuid) from public, anon;
revoke all on function private.creed_section_permission(uuid, text) from public, anon;
grant execute on function private.creed_role(uuid) to authenticated, service_role;
grant execute on function private.creed_type(uuid) to authenticated, service_role;
grant execute on function private.creed_section_permission(uuid, text) to authenticated, service_role;

-- Preserve every existing policy verb and role while changing only helper refs.
do $$
declare
  p record;
  new_qual text;
  new_check text;
  statement text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and concat(qual, with_check) ~ 'creed_(role|type|section_permission)\('
  loop
    new_qual := regexp_replace(regexp_replace(regexp_replace(
      replace(replace(replace(p.qual,
        'public.creed_section_permission(', 'private.creed_section_permission('),
        'public.creed_role(', 'private.creed_role('),
        'public.creed_type(', 'private.creed_type('),
      '(^|[^.[:alnum:]_])creed_section_permission\(', '\1private.creed_section_permission(', 'g'),
      '(^|[^.[:alnum:]_])creed_role\(', '\1private.creed_role(', 'g'),
      '(^|[^.[:alnum:]_])creed_type\(', '\1private.creed_type(', 'g');
    new_check := regexp_replace(regexp_replace(regexp_replace(
      replace(replace(replace(p.with_check,
        'public.creed_section_permission(', 'private.creed_section_permission('),
        'public.creed_role(', 'private.creed_role('),
        'public.creed_type(', 'private.creed_type('),
      '(^|[^.[:alnum:]_])creed_section_permission\(', '\1private.creed_section_permission(', 'g'),
      '(^|[^.[:alnum:]_])creed_role\(', '\1private.creed_role(', 'g'),
      '(^|[^.[:alnum:]_])creed_type\(', '\1private.creed_type(', 'g');

    statement := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_qual is not null then statement := statement || format(' using (%s)', new_qual); end if;
    if new_check is not null then statement := statement || format(' with check (%s)', new_check); end if;
    execute statement;
  end loop;
end;
$$;

drop function public.creed_section_permission(uuid, text);
drop function public.creed_role(uuid);
drop function public.creed_type(uuid);

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and concat(qual, with_check) ~ '(^|[^.])creed_(role|type|section_permission)\('
  ) then
    raise exception 'RLS helper migration left an exposed-schema reference';
  end if;
end;
$$;
