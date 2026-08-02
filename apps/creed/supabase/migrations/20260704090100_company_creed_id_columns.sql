-- Company plan, part 2 of 3 (SAFE TO APPLY NOW - additive, backward compatible).
--
-- Adds a nullable creed_id to every content table and backfills it to the
-- owner's personal Creed (created in part 1). The column is nullable and the
-- existing primary keys, indexes, and RLS policies are left untouched, so the
-- current single-user app keeps working exactly as before: it simply ignores a
-- column it does not read.
--
-- The tightening (creed_id NOT NULL, primary-key swaps to (creed_id, ...),
-- membership-based RLS) is a later, gated migration that ships with the loader/
-- persist/write-path code, because those changes only make sense once the code
-- sets creed_id on writes. See the company plan doc, "Phase 2 / gated keys".
--
-- Every backfill maps a row to its owner's personal Creed via user_id, is
-- guarded by `creed_id is null`, and is therefore idempotent.
--
-- PRECONDITION FOR THE GATED BATCH B (do not lose this): the backfills below run
-- ONCE. The live single-user app keeps inserting content rows with creed_id NULL
-- after this migration applies (debit_credits/grant_allowance into creed_credits
-- by user_id, increment_mcp_read into creed_mcp_read_events, and every section/
-- proposal/activity/usage write). So Batch B (which does SET NOT NULL + PK swaps
-- on creed_id) MUST, as its first step, RE-RUN this same `set creed_id = personal
-- creed where creed_id is null` update for every table here, or it will abort on
-- the rows created in the interim. This is documented in the company plan doc,
-- Phase 1 "Batch B".

-- Helper note: each block is (add column) + (backfill) + (index). The FK uses
-- ON DELETE CASCADE so deleting a company Creed later removes its content.

-- ── creed_sections ──────────────────────────────────────────────────────────
alter table public.creed_sections
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_sections s
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = s.user_id and c.type = 'personal' and s.creed_id is null;
create index if not exists creed_sections_creed_position_idx
  on public.creed_sections (creed_id, position);

-- ── creed_proposals ─────────────────────────────────────────────────────────
alter table public.creed_proposals
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_proposals p
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = p.user_id and c.type = 'personal' and p.creed_id is null;
create index if not exists creed_proposals_creed_status_idx
  on public.creed_proposals (creed_id, status);

-- ── creed_activity ──────────────────────────────────────────────────────────
alter table public.creed_activity
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_activity a
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = a.user_id and c.type = 'personal' and a.creed_id is null;
create index if not exists creed_activity_creed_created_idx
  on public.creed_activity (creed_id, created_at desc);

-- ── creed_connections ───────────────────────────────────────────────────────
alter table public.creed_connections
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_connections cn
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = cn.user_id and c.type = 'personal' and cn.creed_id is null;
create index if not exists creed_connections_creed_updated_idx
  on public.creed_connections (creed_id, updated_at desc);

-- ── creed_mcp_clients ───────────────────────────────────────────────────────
alter table public.creed_mcp_clients
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_mcp_clients m
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = m.user_id and c.type = 'personal' and m.creed_id is null;
create index if not exists creed_mcp_clients_creed_last_seen_idx
  on public.creed_mcp_clients (creed_id, last_seen_at desc);

-- ── creed_mcp_read_events ───────────────────────────────────────────────────
alter table public.creed_mcp_read_events
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_mcp_read_events e
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = e.user_id and c.type = 'personal' and e.creed_id is null;
create index if not exists creed_mcp_read_events_creed_day_idx
  on public.creed_mcp_read_events (creed_id, day desc);

-- ── creed_credits ───────────────────────────────────────────────────────────
alter table public.creed_credits
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_credits cr
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = cr.user_id and c.type = 'personal' and cr.creed_id is null;
create unique index if not exists creed_credits_creed_id_key
  on public.creed_credits (creed_id);

-- ── creed_credit_transactions ───────────────────────────────────────────────
alter table public.creed_credit_transactions
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_credit_transactions t
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = t.user_id and c.type = 'personal' and t.creed_id is null;
create index if not exists creed_credit_transactions_creed_created_idx
  on public.creed_credit_transactions (creed_id, created_at desc);

-- ── creed_ai_usage (spend chart, scoped per Creed) ──────────────────────────
alter table public.creed_ai_usage
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_ai_usage u
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = u.user_id and c.type = 'personal' and u.creed_id is null;
create index if not exists creed_ai_usage_creed_created_idx
  on public.creed_ai_usage (creed_id, created_at desc);

-- ── creed_quality_reports (shared company analysis report) ──────────────────
alter table public.creed_quality_reports
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_quality_reports q
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = q.user_id and c.type = 'personal' and q.creed_id is null;
create index if not exists creed_quality_reports_creed_hash_idx
  on public.creed_quality_reports (creed_id, content_hash);

-- ── creed_audit_log (creed_id stays nullable: some rows have no user) ────────
alter table public.creed_audit_log
  add column if not exists creed_id uuid references public.creeds(id) on delete cascade;
update public.creed_audit_log al
  set creed_id = c.id
  from public.creeds c
  where c.owner_user_id = al.user_id and c.type = 'personal' and al.creed_id is null;
create index if not exists creed_audit_log_creed_created_idx
  on public.creed_audit_log (creed_id, created_at desc);
