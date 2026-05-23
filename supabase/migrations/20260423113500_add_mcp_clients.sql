create table if not exists public.creed_mcp_clients (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  client_name text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, client_id)
);
create index if not exists creed_mcp_clients_user_last_seen_idx
  on public.creed_mcp_clients (user_id, last_seen_at desc);
alter table public.creed_mcp_clients enable row level security;
drop policy if exists "users can manage their creed mcp clients" on public.creed_mcp_clients;
create policy "users can manage their creed mcp clients"
  on public.creed_mcp_clients
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
