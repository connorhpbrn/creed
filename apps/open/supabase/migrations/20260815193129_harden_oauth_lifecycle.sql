alter table public.oauth_tokens
  add column if not exists authorization_code_hash text,
  add column if not exists parent_token_id uuid references public.oauth_tokens(id) on delete set null,
  add column if not exists ready_at timestamptz;

update public.oauth_tokens
set ready_at = created_at
where ready_at is null;

create unique index if not exists oauth_tokens_authorization_code_hash_idx
  on public.oauth_tokens (authorization_code_hash)
  where authorization_code_hash is not null;

create unique index if not exists oauth_tokens_parent_token_id_idx
  on public.oauth_tokens (parent_token_id)
  where parent_token_id is not null;

comment on column public.oauth_tokens.authorization_code_hash is
  'Idempotency key that lets a valid authorization-code exchange return its already-issued token pair after a lost response.';
comment on column public.oauth_tokens.parent_token_id is
  'The refresh-token row replaced by this row; unique to prevent concurrent refreshes from minting competing successors.';
comment on column public.oauth_tokens.ready_at is
  'Set only after the token row and its Creed grants are fully persisted, so retries never observe a partial token.';
