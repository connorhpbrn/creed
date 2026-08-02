create extension if not exists pgcrypto;

alter table public.creed_tokens
  add column if not exists read_token_hash text,
  add column if not exists proposal_token_hash text,
  add column if not exists direct_edit_token text,
  add column if not exists direct_edit_token_hash text,
  add column if not exists encrypted_read_token text,
  add column if not exists encrypted_proposal_token text,
  add column if not exists encrypted_direct_edit_token text;

update public.creed_tokens
set
  read_token_hash = coalesce(read_token_hash, encode(digest(read_token, 'sha256'), 'hex')),
  proposal_token_hash = coalesce(proposal_token_hash, encode(digest(proposal_token, 'sha256'), 'hex')),
  direct_edit_token = coalesce(direct_edit_token, 'xt_direct_' || encode(gen_random_bytes(24), 'hex'))
where read_token is not null or proposal_token is not null or direct_edit_token is null;

update public.creed_tokens
set direct_edit_token_hash = coalesce(direct_edit_token_hash, encode(digest(direct_edit_token, 'sha256'), 'hex'))
where direct_edit_token is not null;

create unique index if not exists creed_tokens_read_token_hash_idx
  on public.creed_tokens (read_token_hash)
  where read_token_hash is not null;

create unique index if not exists creed_tokens_proposal_token_hash_idx
  on public.creed_tokens (proposal_token_hash)
  where proposal_token_hash is not null;

create unique index if not exists creed_tokens_direct_edit_token_hash_idx
  on public.creed_tokens (direct_edit_token_hash)
  where direct_edit_token_hash is not null;

alter table public.creed_mcp_credentials
  add column if not exists mcp_token_hash text,
  add column if not exists encrypted_mcp_token text;

update public.creed_mcp_credentials
set mcp_token_hash = coalesce(mcp_token_hash, encode(digest(mcp_token, 'sha256'), 'hex'))
where mcp_token is not null;

create unique index if not exists creed_mcp_credentials_token_hash_idx
  on public.creed_mcp_credentials (mcp_token_hash)
  where mcp_token_hash is not null;

alter table public.creed_integrations
  add column if not exists encrypted_access_token text,
  add column if not exists encrypted_refresh_token text;;
