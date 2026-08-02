-- OAuth 2.1 authorization-server tables for the Creed MCP endpoint. These power
-- the "click Allow" connect flow: a client self-registers (Dynamic Client
-- Registration), the user authorizes at /authorize, and the client exchanges a
-- PKCE-bound code at /token for opaque access + refresh tokens. Tokens are
-- stored as a SHA-256 hash (for lookup) plus an AES-256-GCM ciphertext, the
-- same pattern as creed_tokens, so a DB dump cannot replay them.
--
-- This migration also drops creed_mcp_credentials: the static MCP bearer token
-- it held is fully superseded by OAuth, and the connection status it tracked is
-- now derived from creed_mcp_clients (the per-agent roster). No fallback path
-- remains, so the table is removed rather than retired in place.

-- Registered OAuth clients. Global (not per user): one client registration is
-- shared across every Creed user who authorizes that client. Public clients,
-- so no client_secret is stored. RLS is enabled with no policy, meaning only
-- the service-role admin client can touch these rows.
create table if not exists public.oauth_clients (
  client_id text primary key,
  client_name text not null default 'MCP Client',
  redirect_uris text[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.oauth_clients enable row level security;

-- Short-lived, single-use authorization codes, bound to a client, a user, the
-- exact redirect_uri, and a PKCE challenge. Redeemed by flipping used_at, so a
-- replayed code finds nothing to claim.
create table if not exists public.oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null default 'read propose',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists oauth_authorization_codes_user_idx
  on public.oauth_authorization_codes (user_id);

alter table public.oauth_authorization_codes enable row level security;

-- Issued access + refresh tokens. Both are stored hashed (unique lookup) and
-- encrypted. client_id preserves agent attribution for the MCP health
-- dashboard when a JSON-RPC clientInfo.name is absent. revoked_at supports
-- per-client disconnect and refresh-token rotation.
create table if not exists public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null,
  refresh_token_hash text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'read propose',
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists oauth_tokens_access_hash_idx
  on public.oauth_tokens (access_token_hash);
create unique index if not exists oauth_tokens_refresh_hash_idx
  on public.oauth_tokens (refresh_token_hash);
create index if not exists oauth_tokens_user_client_idx
  on public.oauth_tokens (user_id, client_id);

alter table public.oauth_tokens enable row level security;

-- Users may view and revoke their own issued tokens from the app. Inserts and
-- rotation happen only through the service-role admin client.
drop policy if exists "oauth_tokens_select_own" on public.oauth_tokens;
create policy "oauth_tokens_select_own"
  on public.oauth_tokens
  for select
  using (auth.uid() = user_id);

drop policy if exists "oauth_tokens_delete_own" on public.oauth_tokens;
create policy "oauth_tokens_delete_own"
  on public.oauth_tokens
  for delete
  using (auth.uid() = user_id);

-- Drop the superseded static MCP credential table. The MCP endpoint is now
-- OAuth-only; connection status is derived from creed_mcp_clients.
drop table if exists public.creed_mcp_credentials cascade;
