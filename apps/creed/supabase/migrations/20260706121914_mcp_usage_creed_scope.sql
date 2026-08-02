create or replace function public.increment_mcp_read_for_creed(
  p_creed_id uuid,
  p_reader_user_id uuid,
  p_client_id text,
  p_day date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_creed_id is null or p_reader_user_id is null then
    raise exception 'creed id and reader user id are required';
  end if;

  if not exists (
    select 1
    from public.creed_members
    where creed_id = p_creed_id
      and user_id = p_reader_user_id
      and status = 'active'
  ) then
    raise exception 'reader is not an active member of this creed';
  end if;

  insert into public.creed_mcp_read_events (creed_id, user_id, client_id, day, read_count)
  values (p_creed_id, p_reader_user_id, p_client_id, p_day, 1)
  on conflict (creed_id, client_id, day)
  do update set
    read_count = public.creed_mcp_read_events.read_count + 1,
    updated_at = timezone('utc'::text, now());
end;
$$;

revoke all on function public.increment_mcp_read_for_creed(uuid, uuid, text, date) from public, anon, authenticated;
grant execute on function public.increment_mcp_read_for_creed(uuid, uuid, text, date) to service_role;

create or replace function public.increment_mcp_read(
  p_user_id uuid,
  p_client_id text,
  p_day date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creed_id uuid;
begin
  select id
    into v_creed_id
    from public.creeds
    where owner_user_id = p_user_id
      and type = 'personal';

  if v_creed_id is null then
    raise exception 'personal creed not found for user %', p_user_id;
  end if;

  perform public.increment_mcp_read_for_creed(v_creed_id, p_user_id, p_client_id, p_day);
end;
$$;

revoke all on function public.increment_mcp_read(uuid, text, date) from public, anon, authenticated;
grant execute on function public.increment_mcp_read(uuid, text, date) to service_role;
