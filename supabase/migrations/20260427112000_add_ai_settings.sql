create table if not exists public.creed_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'openrouter',
  selected_model_id text not null,
  encrypted_api_key text,
  api_key_last_four text,
  key_status text not null default 'missing',
  last_validated_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create table if not exists public.creed_ai_usage (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  provider text not null default 'openrouter',
  model_id text not null,
  model_quality text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now())
);
create table if not exists public.creed_quality_reports (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content_hash text not null,
  model_id text not null,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists creed_ai_usage_user_created_idx
  on public.creed_ai_usage (user_id, created_at desc);
create index if not exists creed_quality_reports_user_hash_idx
  on public.creed_quality_reports (user_id, content_hash);
alter table public.creed_ai_settings enable row level security;
alter table public.creed_ai_usage enable row level security;
alter table public.creed_quality_reports enable row level security;
drop policy if exists "users can manage their creed ai settings" on public.creed_ai_settings;
create policy "users can manage their creed ai settings"
  on public.creed_ai_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "users can read their creed ai usage" on public.creed_ai_usage;
create policy "users can read their creed ai usage"
  on public.creed_ai_usage
  for select
  using (auth.uid() = user_id);
drop policy if exists "users can insert their creed ai usage" on public.creed_ai_usage;
create policy "users can insert their creed ai usage"
  on public.creed_ai_usage
  for insert
  with check (auth.uid() = user_id);
drop policy if exists "users can manage their creed quality reports" on public.creed_quality_reports;
create policy "users can manage their creed quality reports"
  on public.creed_quality_reports
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
