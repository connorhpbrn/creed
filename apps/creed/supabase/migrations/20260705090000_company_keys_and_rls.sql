-- Company plan, Batch B part 1 of 2 - GATED.
--
-- DO NOT APPLY THIS UNTIL the loader/persist/write-path code that sets creed_id
-- on every write and reads per creed_id is deployed in the SAME release. It
-- swaps primary keys and replaces RLS, which the current single-user code paths
-- do not satisfy; applying it against the live old app would break saves.
--
-- Steps:
--   1. Re-run the Batch A creed_id backfill (rows created between Batch A and
--      now by the still-running old app have creed_id NULL and would abort the
--      NOT NULL / PK swap).
--   2. creed_id NOT NULL on the content tables.
--   3. Primary-key swaps to be per Creed (a company Creed and a personal Creed
--      can both have a section_id 'ethos', so section_id alone is not unique).
--   4. Replace the auth.uid()=user_id RLS with membership-based policies:
--      personal Creeds stay writable by their owner via the session client;
--      company section writes go through the service role after an app-level
--      permission check; Hidden sections are filtered at the DB.
--   5. Add sections/proposals/activity to the Realtime publication for live
--      company collaboration.
--
-- Personal behaviour is preserved: a personal owner has creed_role = 'owner'
-- and creed_type = 'personal', so the personal write policies below admit
-- exactly the rows auth.uid()=user_id did before.

-- ── 0. Re-backfill missing personal Creed shells ────────────────────────────
-- Some legacy users may have content rows but no personal Creed row if they
-- arrived between the original Batch A backfill and this gated migration. Create
-- the missing shell first so every user_id-keyed row below can resolve a
-- canonical creed_id.
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
where exists (
    select 1 from public.creed_sections s
    where s.user_id = u.id and s.creed_id is null
  )
  and not exists (
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

-- ── 1. Re-backfill (idempotent) ─────────────────────────────────────────────
update public.creed_sections s set creed_id = c.id from public.creeds c
  where c.owner_user_id = s.user_id and c.type='personal' and s.creed_id is null;
update public.creed_proposals p set creed_id = c.id from public.creeds c
  where c.owner_user_id = p.user_id and c.type='personal' and p.creed_id is null;
update public.creed_activity a set creed_id = c.id from public.creeds c
  where c.owner_user_id = a.user_id and c.type='personal' and a.creed_id is null;
update public.creed_connections cn set creed_id = c.id from public.creeds c
  where c.owner_user_id = cn.user_id and c.type='personal' and cn.creed_id is null;
update public.creed_mcp_clients m set creed_id = c.id from public.creeds c
  where c.owner_user_id = m.user_id and c.type='personal' and m.creed_id is null;
update public.creed_mcp_read_events e set creed_id = c.id from public.creeds c
  where c.owner_user_id = e.user_id and c.type='personal' and e.creed_id is null;
update public.creed_credits cr set creed_id = c.id from public.creeds c
  where c.owner_user_id = cr.user_id and c.type='personal' and cr.creed_id is null;
update public.creed_credit_transactions t set creed_id = c.id from public.creeds c
  where c.owner_user_id = t.user_id and c.type='personal' and t.creed_id is null;
update public.creed_quality_reports q set creed_id = c.id from public.creeds c
  where c.owner_user_id = q.user_id and c.type='personal' and q.creed_id is null;

-- ── 2 + 3. NOT NULL + primary-key swaps ─────────────────────────────────────
alter table public.creed_sections alter column creed_id set not null;
alter table public.creed_sections drop constraint if exists creed_sections_pkey;
alter table public.creed_sections add constraint creed_sections_pkey primary key (creed_id, section_id);

alter table public.creed_connections alter column creed_id set not null;
alter table public.creed_connections drop constraint if exists creed_connections_pkey;
alter table public.creed_connections add constraint creed_connections_pkey primary key (creed_id, connection_id);

alter table public.creed_mcp_clients alter column creed_id set not null;
alter table public.creed_mcp_clients drop constraint if exists creed_mcp_clients_pkey;
alter table public.creed_mcp_clients add constraint creed_mcp_clients_pkey primary key (creed_id, client_id);

alter table public.creed_mcp_read_events alter column creed_id set not null;
alter table public.creed_mcp_read_events drop constraint if exists creed_mcp_read_events_pkey;
alter table public.creed_mcp_read_events add constraint creed_mcp_read_events_pkey primary key (creed_id, client_id, day);

alter table public.creed_credits alter column creed_id set not null;
alter table public.creed_credits drop constraint if exists creed_credits_pkey;
alter table public.creed_credits add constraint creed_credits_pkey primary key (creed_id);

-- NOTE: the creed_quality_reports re-key was extracted to
-- 20260706110000_quality_report_creed_key.sql so company analysis could ship
-- ahead of this batch. These drop-then-create statements stay safe to apply
-- after it (idempotent re-creation).
alter table public.creed_quality_reports alter column creed_id set not null;
alter table public.creed_quality_reports drop constraint if exists creed_quality_reports_pkey;
alter table public.creed_quality_reports add constraint creed_quality_reports_pkey primary key (creed_id);

-- creed_proposals / creed_activity keep their text id PK; creed_id is a filter.
alter table public.creed_proposals alter column creed_id set not null;
alter table public.creed_activity alter column creed_id set not null;

-- ── 4. Membership-based RLS ─────────────────────────────────────────────────
-- Content-write tables (sections/proposals/activity): personal owner writes via
-- session client; everyone reads what they may see; company writes via service
-- role (bypasses RLS after an app-level permission check).

-- creed_sections
drop policy if exists "users can manage their creed sections" on public.creed_sections;
drop policy if exists "members read visible sections" on public.creed_sections;
create policy "members read visible sections" on public.creed_sections for select
  using (
    public.creed_role(creed_id) is not null
    and public.creed_section_permission(creed_id, section_id) is distinct from 'hidden'
    and (deleted_at is null or public.creed_role(creed_id) in ('owner','admin'))
  );
drop policy if exists "personal owner writes sections" on public.creed_sections;
create policy "personal owner writes sections" on public.creed_sections for all
  using (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner')
  with check (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');

-- creed_proposals
drop policy if exists "users can manage their creed proposals" on public.creed_proposals;
drop policy if exists "members read visible proposals" on public.creed_proposals;
create policy "members read visible proposals" on public.creed_proposals for select
  using (
    public.creed_role(creed_id) is not null
    and public.creed_section_permission(creed_id, section_id) is distinct from 'hidden'
  );
drop policy if exists "personal owner writes proposals" on public.creed_proposals;
create policy "personal owner writes proposals" on public.creed_proposals for all
  using (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner')
  with check (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');

-- creed_activity (non-section events have section_id NULL: visible to all members
-- except billing-kind rows, which are owner/admin only)
drop policy if exists "users can manage their creed activity" on public.creed_activity;
drop policy if exists "members read visible activity" on public.creed_activity;
create policy "members read visible activity" on public.creed_activity for select
  using (
    public.creed_role(creed_id) is not null
    and (section_id is null or public.creed_section_permission(creed_id, section_id) is distinct from 'hidden')
    and (event_kind <> 'billing' or public.creed_role(creed_id) in ('owner','admin'))
  );
drop policy if exists "personal owner writes activity" on public.creed_activity;
create policy "personal owner writes activity" on public.creed_activity for all
  using (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner')
  with check (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');

-- Read-only-to-client tables: membership SELECT; writes stay service-role only.
drop policy if exists "users can manage their creed connections" on public.creed_connections;
drop policy if exists "members read connections" on public.creed_connections;
create policy "members read connections" on public.creed_connections for select
  using (public.creed_role(creed_id) is not null);

drop policy if exists "users can manage their creed mcp clients" on public.creed_mcp_clients;
drop policy if exists "members read mcp clients" on public.creed_mcp_clients;
create policy "members read mcp clients" on public.creed_mcp_clients for select
  using (public.creed_role(creed_id) is not null);

drop policy if exists "creed_mcp_read_events_select_own" on public.creed_mcp_read_events;
drop policy if exists "members read mcp read events" on public.creed_mcp_read_events;
create policy "members read mcp read events" on public.creed_mcp_read_events for select
  using (public.creed_role(creed_id) is not null);

drop policy if exists "Read own credits" on public.creed_credits;
drop policy if exists "members read credits" on public.creed_credits;
create policy "members read credits" on public.creed_credits for select
  using (public.creed_role(creed_id) is not null);

drop policy if exists "Read own credit transactions" on public.creed_credit_transactions;
drop policy if exists "members read credit transactions" on public.creed_credit_transactions;
create policy "members read credit transactions" on public.creed_credit_transactions for select
  using (public.creed_role(creed_id) is not null);

drop policy if exists "users can manage their creed quality reports" on public.creed_quality_reports;
drop policy if exists "members read quality reports" on public.creed_quality_reports;
create policy "members read quality reports" on public.creed_quality_reports for select
  using (public.creed_role(creed_id) is not null);

-- creed_ai_usage keeps user-scoped RLS (spend is attributed per user); add a
-- membership read so owner/admin can see company spend in the usage card.
drop policy if exists "members read company ai usage" on public.creed_ai_usage;
create policy "members read company ai usage" on public.creed_ai_usage for select
  using (creed_id is not null and public.creed_role(creed_id) in ('owner','admin'));

-- ── 5. Realtime for live company collaboration ──────────────────────────────
-- Wrapped so a re-run (table already in publication) does not error.
do $$
begin
  begin
    alter publication supabase_realtime add table public.creed_sections;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.creed_proposals;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.creed_activity;
  exception when duplicate_object then null; end;
end $$;
