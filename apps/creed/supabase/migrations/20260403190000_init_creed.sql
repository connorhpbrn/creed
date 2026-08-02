create table if not exists public.creed_sections (
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id text not null,
  position integer not null default 0,
  kind text not null,
  name text not null,
  accent text not null,
  payload jsonb not null default '{}'::jsonb,
  last_edited_by text not null,
  last_edited_type text not null,
  last_edited_at timestamptz not null default timezone('utc'::text, now()),
  revision integer not null default 1,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, section_id)
);
create table if not exists public.creed_proposals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id text not null,
  section_name text not null,
  accent text not null,
  agent_name text not null,
  change_type text not null,
  reason text not null,
  impact text not null,
  confidence text not null,
  draft jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  base_revision integer,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create table if not exists public.creed_activity (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  proposal_id text references public.creed_proposals(id) on delete set null,
  section_id text not null,
  section_name text not null,
  accent text not null,
  actor text not null,
  actor_type text not null,
  summary text not null,
  status text not null,
  change_type text not null,
  reason text not null,
  impact text not null,
  confidence text not null,
  before_text text,
  after_text text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);
create table if not exists public.creed_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id text not null,
  status text not null default 'not-connected',
  last_seen_at timestamptz,
  last_agent_name text,
  observed_via text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, connection_id)
);
create table if not exists public.creed_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  read_token text not null,
  proposal_token text not null,
  require_approval boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists creed_sections_user_position_idx
  on public.creed_sections (user_id, position);
create index if not exists creed_proposals_user_created_idx
  on public.creed_proposals (user_id, created_at desc);
create index if not exists creed_activity_user_created_idx
  on public.creed_activity (user_id, created_at desc);
create index if not exists creed_connections_user_updated_idx
  on public.creed_connections (user_id, updated_at desc);
alter table public.creed_sections enable row level security;
alter table public.creed_proposals enable row level security;
alter table public.creed_activity enable row level security;
alter table public.creed_connections enable row level security;
alter table public.creed_tokens enable row level security;
drop policy if exists "users can manage their creed sections" on public.creed_sections;
create policy "users can manage their creed sections"
  on public.creed_sections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "users can manage their creed proposals" on public.creed_proposals;
create policy "users can manage their creed proposals"
  on public.creed_proposals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "users can manage their creed activity" on public.creed_activity;
create policy "users can manage their creed activity"
  on public.creed_activity
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "users can manage their creed connections" on public.creed_connections;
create policy "users can manage their creed connections"
  on public.creed_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "users can manage their creed tokens" on public.creed_tokens;
create policy "users can manage their creed tokens"
  on public.creed_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
