alter table public.oauth_authorization_codes add column if not exists resource text;
alter table public.oauth_tokens add column if not exists resource text;
alter table public.oauth_clients add column if not exists last_used_at timestamptz;

create or replace function public.guard_oauth_client_registration()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.oauth_clients c
  where c.created_at < now() - interval '7 days'
    and coalesce(c.last_used_at, c.created_at) < now() - interval '7 days'
    and not exists (select 1 from public.oauth_tokens t where t.client_id = c.client_id)
    and not exists (select 1 from public.oauth_authorization_codes a where a.client_id = c.client_id);
  if (select count(*) from public.oauth_clients) >= 10000 then
    raise exception 'OAuth client registration capacity reached';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_oauth_client_registration on public.oauth_clients;
create trigger guard_oauth_client_registration before insert on public.oauth_clients
for each statement execute function public.guard_oauth_client_registration();
revoke all on function public.guard_oauth_client_registration() from public, anon, authenticated;
grant execute on function public.guard_oauth_client_registration() to service_role;
