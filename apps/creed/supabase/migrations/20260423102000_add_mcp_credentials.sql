create table if not exists public.creed_mcp_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mcp_token text not null unique,
  last_seen_at timestamptz,
  last_client_name text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists creed_mcp_credentials_token_idx
  on public.creed_mcp_credentials (mcp_token);
alter table public.creed_mcp_credentials enable row level security;
drop policy if exists "users can manage their creed mcp credentials" on public.creed_mcp_credentials;
create policy "users can manage their creed mcp credentials"
  on public.creed_mcp_credentials
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
