-- Per-Creed "Get started" checklist. Progress (and dismiss) is one row per
-- user per Creed so a new Creed always shows a fresh card.
drop trigger if exists touch_personal_creed_sync_tick on public.creed_getting_started;

drop table if exists public.creed_getting_started;

create table public.creed_getting_started (
  user_id uuid not null references auth.users(id) on delete cascade,
  creed_id uuid not null references public.creeds(id) on delete cascade,
  steps jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, creed_id)
);

create index if not exists creed_getting_started_creed_idx
  on public.creed_getting_started (creed_id);

alter table public.creed_getting_started enable row level security;

create policy "Users read own getting started"
  on public.creed_getting_started for select
  using ((select auth.uid()) = user_id);

create policy "Users insert own getting started"
  on public.creed_getting_started for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.creed_members as membership
      where membership.creed_id = creed_getting_started.creed_id
        and membership.user_id = (select auth.uid())
    )
  );

create policy "Users update own getting started"
  on public.creed_getting_started for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.creed_getting_started is
  'Per-user, per-Creed Get started checklist progress and dismiss state.';

create or replace function private.touch_getting_started_creed_sync_tick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_creed_id uuid;
begin
  target_creed_id := case
    when tg_op = 'DELETE' then old.creed_id
    else new.creed_id
  end;
  update public.creeds
  set sync_updated_at = timezone('utc'::text, clock_timestamp())
  where id = target_creed_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.touch_getting_started_creed_sync_tick()
  from public, anon, authenticated;

create trigger touch_getting_started_creed_sync_tick
after insert or update or delete on public.creed_getting_started
for each row execute function private.touch_getting_started_creed_sync_tick();
