-- ChatGPT / Claude / Cursor cache Dynamic Client Registration client_ids.
-- Pruning unused oauth_clients after 7 days made reconnect fail with
-- "couldn't verify the app" until the user deleted and recreated the connector.
-- Keep pruning expired codes and stale tokens; stop deleting registered clients.

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

  if (select count(*) from public.oauth_clients) >= 10000 then
    raise exception 'OAuth client registration capacity reached';
  end if;
  return null;
end;
$$;

comment on function public.guard_oauth_client_registration() is
  'Caps oauth_clients and prunes expired codes/tokens. Does not delete clients; MCP hosts cache client_id across reconnects.';
