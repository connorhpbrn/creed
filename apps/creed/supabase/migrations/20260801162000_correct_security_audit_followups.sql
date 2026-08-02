-- The first resource rollout backfilled a hosted domain into every existing
-- row. Legacy rows were never actually bound to that resource, and hardcoding
-- the hosted domain breaks preview and self-hosted deployments. Return only
-- those backfilled values to the legacy/unbound state. The next successful
-- code exchange or refresh binds the replacement token to the request's exact
-- deployment-derived MCP resource.
update public.oauth_authorization_codes
set resource = null
where resource = 'https://creed.md/mcp';

update public.oauth_tokens
set resource = null
where resource = 'https://creed.md/mcp';

create or replace function public.guard_oauth_client_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Serialize the prune + ceiling check so concurrent registrations cannot
  -- race past the global cap.
  perform pg_advisory_xact_lock(hashtext('creed:oauth-client-registration'));

  delete from public.oauth_authorization_codes
  where expires_at < now()
     or (used_at is not null and used_at < now() - interval '1 day');

  delete from public.oauth_tokens
  where (revoked_at is not null and revoked_at < now() - interval '7 days')
     or refresh_expires_at < now() - interval '7 days';

  delete from public.oauth_clients c
  where c.created_at < now() - interval '7 days'
    and coalesce(c.last_used_at, c.created_at) < now() - interval '7 days'
    and not exists (select 1 from public.oauth_tokens t where t.client_id = c.client_id)
    and not exists (select 1 from public.oauth_authorization_codes a where a.client_id = c.client_id);

  if (select count(*) from public.oauth_clients) >= 10000 then
    raise exception 'OAuth client registration capacity reached';
  end if;
  return null;
end;
$$;

revoke all on function public.guard_oauth_client_registration() from public, anon, authenticated;
grant execute on function public.guard_oauth_client_registration() to service_role;
