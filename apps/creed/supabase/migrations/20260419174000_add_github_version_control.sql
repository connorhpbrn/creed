create table if not exists public.creed_integrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  provider_account_id text,
  provider_login text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, provider)
);
create table if not exists public.creed_version_control (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'github',
  repo_owner text,
  repo_name text,
  branch text,
  path text not null default 'creed.md',
  last_remote_sha text,
  last_remote_message text,
  last_remote_committed_at timestamptz,
  last_synced_content_hash text,
  sync_status text not null default 'not-configured',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists creed_integrations_user_provider_idx
  on public.creed_integrations (user_id, provider);
alter table public.creed_integrations enable row level security;
alter table public.creed_version_control enable row level security;
drop policy if exists "users can manage their creed integrations" on public.creed_integrations;
create policy "users can manage their creed integrations"
  on public.creed_integrations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "users can manage their creed version control" on public.creed_version_control;
create policy "users can manage their creed version control"
  on public.creed_version_control
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
