-- Company plan, part 1 of 3 (SAFE TO APPLY NOW - additive, backward compatible).
--
-- Introduces the Creed/workspace entity that sits between a user and their
-- content. Today "one user = one Creed" is assumed everywhere (every table is
-- keyed by user_id). This migration adds:
--
--   creeds         one row per Creed. type 'personal' (the existing single-user
--                  file, one per user) or 'company' (a shared team file).
--   creed_members  who belongs to a Creed and their role. Personal Creeds get
--                  exactly one row (the user, role 'owner').
--
-- It then backfills a personal Creed + owner membership for every existing user,
-- so the rest of the system can start attaching a creed_id to content (part 2)
-- without any user losing data. Existing code keeps working: it never reads
-- these tables, and the content tables are untouched here.
--
-- The PK/RLS re-key of the content tables and the credit-RPC re-key are
-- deliberately NOT in this batch. Those are coupled to the loader/persist/write
-- code and must deploy atomically with it (a later, gated migration), so this
-- batch stays safe to apply against the live single-user app.

-- ── creeds ──────────────────────────────────────────────────────────────────
create table if not exists public.creeds (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('personal', 'company')),
  name             text not null,
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  -- Company onboarding resume pointer. Null once onboarding is finished (and
  -- always null for personal Creeds).
  onboarding_stage text,
  created_at       timestamptz not null default timezone('utc'::text, now()),
  updated_at       timestamptz not null default timezone('utc'::text, now())
);

create index if not exists creeds_owner_idx on public.creeds (owner_user_id);
-- A user has at most one personal Creed; company Creeds have no such limit.
create unique index if not exists creeds_one_personal_per_owner
  on public.creeds (owner_user_id) where type = 'personal';

-- ── creed_members ───────────────────────────────────────────────────────────
create table if not exists public.creed_members (
  creed_id   uuid not null references public.creeds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (creed_id, user_id)
);

create index if not exists creed_members_user_idx on public.creed_members (user_id);
-- Exactly one owner per Creed, enforced in the schema (non-negotiable #3).
create unique index if not exists creed_members_one_owner_per_creed
  on public.creed_members (creed_id) where role = 'owner';

-- ── creed_role() helper ─────────────────────────────────────────────────────
-- Returns the caller's role on a Creed, or null if they are not a member.
--
-- SECURITY DEFINER is load-bearing: membership-aware RLS policies on
-- creed_members (and every content table, later) need to ask "is auth.uid() a
-- member of this Creed?" A policy that queried creed_members directly from a
-- policy ON creed_members would recurse. Routing the check through a definer
-- function that bypasses RLS breaks the recursion. STABLE: one lookup per row
-- set within a statement.
create or replace function public.creed_role(p_creed_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.creed_members
  where creed_id = p_creed_id and user_id = auth.uid();
$$;

revoke all on function public.creed_role(uuid) from public;
grant execute on function public.creed_role(uuid) to authenticated;
grant execute on function public.creed_role(uuid) to service_role;

-- ── creed_type() helper ─────────────────────────────────────────────────────
-- Returns a Creed's type ('personal' | 'company'), or null if it does not
-- exist. Shipped now so the later gated RLS can branch on it cleanly: personal
-- sections stay writable by the owner via the session client, company sections
-- are service-role only. Without this primitive, every content-table write
-- policy would embed the same `exists (select ... from creeds ...)` subquery and
-- drift table to table. SECURITY DEFINER + STABLE, same posture as creed_role.
create or replace function public.creed_type(p_creed_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select type from public.creeds where id = p_creed_id;
$$;

revoke all on function public.creed_type(uuid) from public;
grant execute on function public.creed_type(uuid) to authenticated;
grant execute on function public.creed_type(uuid) to service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Reads are member-scoped via the helper; every write (create Creed, add member,
-- change role) flows through server routes on the service-role admin client
-- after an app-level role check, so no write policy is exposed.
alter table public.creeds enable row level security;
drop policy if exists "members read their creeds" on public.creeds;
create policy "members read their creeds"
  on public.creeds
  for select
  using (public.creed_role(id) is not null);

alter table public.creed_members enable row level security;
drop policy if exists "members read their creed roster" on public.creed_members;
create policy "members read their creed roster"
  on public.creed_members
  for select
  using (public.creed_role(creed_id) is not null);

-- ── Backfill: a personal Creed + owner membership for every existing user ────
-- Idempotent via NOT EXISTS, so a re-run is a no-op. Name is the user's display
-- name where known (the switcher shows "Personal" anyway), falling back to the
-- email local-part and finally a neutral label.
insert into public.creeds (id, type, name, owner_user_id)
select
  gen_random_uuid(),
  'personal',
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Your Creed'
  ),
  u.id
from auth.users u
where not exists (
  select 1 from public.creeds c
  where c.owner_user_id = u.id and c.type = 'personal'
);

insert into public.creed_members (creed_id, user_id, role)
select c.id, c.owner_user_id, 'owner'
from public.creeds c
where c.type = 'personal'
  and not exists (
    select 1 from public.creed_members m
    where m.creed_id = c.id and m.user_id = c.owner_user_id
  );
