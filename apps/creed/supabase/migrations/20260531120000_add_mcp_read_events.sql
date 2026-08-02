-- Daily rollup of Creed MCP reads, per agent. Powers the MCP health dashboard
-- on /connections. We deliberately store a per-day counter (not one row per
-- read) so growth is bounded to (agents x days) and the time-series queries
-- stay cheap. Reads from unnamed/generic clients are not counted here, matching
-- the creed_mcp_clients gate, so every counted read maps to a known agent.
create table if not exists public.creed_mcp_read_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  day date not null,
  read_count integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, client_id, day)
);

create index if not exists creed_mcp_read_events_user_day_idx
  on public.creed_mcp_read_events (user_id, day desc);

alter table public.creed_mcp_read_events enable row level security;

-- Users read their own rollups. Writes happen only through the security-definer
-- function below (called by the service-role admin client on each MCP read), so
-- no insert/update policy is exposed to end users.
drop policy if exists "creed_mcp_read_events_select_own" on public.creed_mcp_read_events;
create policy "creed_mcp_read_events_select_own"
  on public.creed_mcp_read_events
  for select
  using (auth.uid() = user_id);

-- Atomic upsert-increment for one read on a given day. SECURITY DEFINER so the
-- single write path is auditable and RLS-independent.
create or replace function public.increment_mcp_read(
  p_user_id uuid,
  p_client_id text,
  p_day date
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.creed_mcp_read_events (user_id, client_id, day, read_count)
  values (p_user_id, p_client_id, p_day, 1)
  on conflict (user_id, client_id, day)
  do update set
    read_count = public.creed_mcp_read_events.read_count + 1,
    updated_at = timezone('utc'::text, now());
$$;
