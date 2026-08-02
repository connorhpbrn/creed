-- Post-onboarding "Get started" checklist. One row per user; steps is a
-- flat map of step key -> true (absent = not done). completed_at is stamped
-- server-side when every step is done, and the card never renders again.
create table if not exists public.creed_getting_started (
  user_id uuid primary key references auth.users(id) on delete cascade,
  steps jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.creed_getting_started enable row level security;

create policy "Users read own getting started"
  on public.creed_getting_started for select
  using ((select auth.uid()) = user_id);

create policy "Users insert own getting started"
  on public.creed_getting_started for insert
  with check ((select auth.uid()) = user_id);

create policy "Users update own getting started"
  on public.creed_getting_started for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
