-- Company plan, part 3 of 3 (SAFE TO APPLY NOW - additive, backward compatible).
--
-- The company-only tables (permissions, invites, section versions, billing, AI
-- settings, per-Creed MCP grants) plus the additive columns that company events
-- need on existing tables. All new tables start empty (no company Creeds exist
-- yet), and every column add / NOT NULL relaxation is backward compatible, so
-- this is safe to apply against the live single-user app.

-- ── creed_member_section_permissions ────────────────────────────────────────
-- Per-member, per-section access override. NO ROW = Direct edit (the permissive
-- default), so a fresh company has an empty table. Only consulted for role
-- 'member'; owner/admin are always 'direct'. Values reuse the existing
-- AgentPermission vocabulary so the member ceiling and the agent ceiling share
-- one lattice (hidden < read-only < propose < direct).
create table if not exists public.creed_member_section_permissions (
  creed_id   uuid not null references public.creeds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  section_id text not null,
  permission text not null check (permission in ('hidden', 'read-only', 'propose', 'direct')),
  updated_by uuid,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (creed_id, user_id, section_id)
);

-- ── creed_section_permission() helper ───────────────────────────────────────
-- The single source of truth for "what can auth.uid() do to this section?".
-- Owner/admin always 'direct'; a member gets their override row or the 'direct'
-- default; a non-member gets null. Used by RLS on sections and the derived
-- tables (versions, proposals, activity, quality) to enforce Hidden at the DB,
-- and re-used in the server payload builders. SECURITY DEFINER to avoid RLS
-- recursion (same rationale as creed_role).
create or replace function public.creed_section_permission(p_creed_id uuid, p_section_id text)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
  v_perm text;
begin
  v_role := public.creed_role(p_creed_id);
  if v_role is null then
    return null;
  end if;
  if v_role in ('owner', 'admin') then
    return 'direct';
  end if;
  select permission into v_perm
    from public.creed_member_section_permissions
    where creed_id = p_creed_id and user_id = auth.uid() and section_id = p_section_id;
  return coalesce(v_perm, 'direct');
end;
$$;

revoke all on function public.creed_section_permission(uuid, text) from public;
grant execute on function public.creed_section_permission(uuid, text) to authenticated;
grant execute on function public.creed_section_permission(uuid, text) to service_role;

alter table public.creed_member_section_permissions enable row level security;
-- A member may read their own overrides; owner/admin may read all of a Creed's.
-- Writes are service-role only (owner/admin routes on the admin client).
drop policy if exists "read member section permissions" on public.creed_member_section_permissions;
create policy "read member section permissions"
  on public.creed_member_section_permissions
  for select
  using (
    user_id = auth.uid()
    or public.creed_role(creed_id) in ('owner', 'admin')
  );

-- ── creed_invites ───────────────────────────────────────────────────────────
create table if not exists public.creed_invites (
  id         uuid primary key default gen_random_uuid(),
  creed_id   uuid not null references public.creeds(id) on delete cascade,
  email      text not null,
  role       text not null default 'member' check (role in ('admin', 'member')),
  -- hashSecret(token); the raw token only ever lives in the emailed link.
  token_hash text not null unique,
  invited_by uuid not null,
  status     text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- At most one live invite per email per Creed (a resend revokes/replaces).
create unique index if not exists creed_invites_one_pending_per_email
  on public.creed_invites (creed_id, lower(email)) where status = 'pending';
create index if not exists creed_invites_creed_idx on public.creed_invites (creed_id);

alter table public.creed_invites enable row level security;
-- Owner/admin manage invites; all writes go through server routes (admin client).
-- The invite-accept page resolves an invite by token hash on the server, so it
-- does not need a client SELECT policy.
drop policy if exists "owners and admins read invites" on public.creed_invites;
create policy "owners and admins read invites"
  on public.creed_invites
  for select
  using (public.creed_role(creed_id) in ('owner', 'admin'));

-- ── creed_section_versions ──────────────────────────────────────────────────
-- Restorable history. One row per content-changing edit (manual, MCP, accepted
-- proposal, restore, import, onboarding), for both personal and company Creeds.
-- Company restore UI ships in V1; personal history accrues for free (no restore
-- UI yet). Written by the section write paths; the latest 200 per section are
-- kept (older pruned lazily on insert).
create table if not exists public.creed_section_versions (
  id            bigint generated always as identity primary key,
  creed_id      uuid not null references public.creeds(id) on delete cascade,
  section_id    text not null,
  revision      integer not null,
  name          text not null,
  accent        text not null,
  content       text not null,
  actor_user_id uuid,
  actor_type    text not null check (actor_type in ('user', 'agent')),
  agent_name    text,
  cause         text not null
    check (cause in ('manual', 'mcp', 'proposal', 'restore', 'import', 'onboarding')),
  created_at    timestamptz not null default timezone('utc'::text, now())
);

create index if not exists creed_section_versions_lookup_idx
  on public.creed_section_versions (creed_id, section_id, id desc);

alter table public.creed_section_versions enable row level security;
-- Members read history for sections they can see; Hidden sections are filtered
-- at the DB. Writes are service-role (company) or the section write paths.
drop policy if exists "members read visible section versions" on public.creed_section_versions;
create policy "members read visible section versions"
  on public.creed_section_versions
  for select
  using (public.creed_section_permission(creed_id, section_id) is distinct from 'hidden'
         and public.creed_role(creed_id) is not null);

-- ── creed_company_billing ───────────────────────────────────────────────────
-- Company billing is keyed by creed_id, separate from creed_entitlements (whose
-- PK is user_id and would collide for a user who has a personal plan AND owns a
-- company). Personal billing is untouched.
create table if not exists public.creed_company_billing (
  creed_id               uuid primary key references public.creeds(id) on delete cascade,
  owner_user_id          uuid not null,
  stripe_customer_id     text,
  stripe_session_id      text unique,
  stripe_subscription_id text,
  billing_mode           text not null check (billing_mode in ('subscription', 'lifetime')),
  billing_interval       text check (billing_interval in ('month', 'year')),
  status                 text not null
    check (status in ('paid', 'refunded', 'active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  seats_included         integer not null default 10,
  extra_seats            integer not null default 0,
  amount_cents           integer,
  currency               text default 'usd',
  paid_at                timestamptz,
  created_at             timestamptz not null default timezone('utc'::text, now()),
  updated_at             timestamptz not null default timezone('utc'::text, now())
);

alter table public.creed_company_billing enable row level security;
-- Owner-only read (money). Admin gets seat capacity via a dedicated server route
-- that returns a minimal shape, not this row. Writes are service-role (webhook).
drop policy if exists "owner reads company billing" on public.creed_company_billing;
create policy "owner reads company billing"
  on public.creed_company_billing
  for select
  using (public.creed_role(creed_id) = 'owner');

-- ── creed_company_ai_settings ───────────────────────────────────────────────
-- Owner-managed, company-wide AI mode + BYOK key (encrypted, never rendered).
-- Personal AI settings stay in creed_ai_settings, untouched.
create table if not exists public.creed_company_ai_settings (
  creed_id              uuid primary key references public.creeds(id) on delete cascade,
  ai_mode               text not null default 'credits' check (ai_mode in ('credits', 'byok')),
  encrypted_openrouter_key text,
  openrouter_key_hash   text,
  api_key_last_four     text,
  key_status            text not null default 'missing',
  updated_by            uuid,
  created_at            timestamptz not null default timezone('utc'::text, now()),
  updated_at            timestamptz not null default timezone('utc'::text, now())
);

alter table public.creed_company_ai_settings enable row level security;
-- Owner-only read (holds the key material). Admin/members learn BYOK status via
-- a server route that returns only key_status + ai_mode.
drop policy if exists "owner reads company ai settings" on public.creed_company_ai_settings;
create policy "owner reads company ai settings"
  on public.creed_company_ai_settings
  for select
  using (public.creed_role(creed_id) = 'owner');

-- ── oauth_token_creeds ──────────────────────────────────────────────────────
-- Per-Creed MCP grant. The oauth_tokens row keeps user identity + coarse scope;
-- this narrows which Creeds a grant can touch and the agent's ceiling mode.
create table if not exists public.oauth_token_creeds (
  token_id uuid not null references public.oauth_tokens(id) on delete cascade,
  creed_id uuid not null references public.creeds(id) on delete cascade,
  mode     text not null default 'proposal-only'
    check (mode in ('read-only', 'proposal-only', 'direct')),
  primary key (token_id, creed_id)
);

create index if not exists oauth_token_creeds_creed_idx on public.oauth_token_creeds (creed_id);

alter table public.oauth_token_creeds enable row level security;
-- A user may read/manage the grants on their own tokens; writes are service-role
-- (issued at consent, mode changed via a server route).
drop policy if exists "users read own token grants" on public.oauth_token_creeds;
create policy "users read own token grants"
  on public.oauth_token_creeds
  for select
  using (exists (
    select 1 from public.oauth_tokens t
    where t.id = token_id and t.user_id = auth.uid()
  ));

-- Backfill one grant per existing token -> the owner's personal Creed, so
-- existing MCP connections keep working once the per-Creed enforcement code
-- lands. Mode matches creed_tokens.require_approval when a row exists; a token
-- with no creed_tokens row (OAuth tokens do not depend on creed_tokens) falls
-- back to the restrictive 'proposal-only'. Idempotent.
insert into public.oauth_token_creeds (token_id, creed_id, mode)
select
  t.id,
  c.id,
  case when coalesce(tok.require_approval, true) then 'proposal-only' else 'direct' end
from public.oauth_tokens t
join public.creeds c on c.owner_user_id = t.user_id and c.type = 'personal'
left join public.creed_tokens tok on tok.user_id = t.user_id
where not exists (
  select 1 from public.oauth_token_creeds otc
  where otc.token_id = t.id and otc.creed_id = c.id
);

-- ── Additive columns for company events on existing tables ──────────────────
-- Proposals: who authored it (the member, whose agent). Personal rows leave it
-- null (attribution falls back to the single owner).
alter table public.creed_proposals
  add column if not exists author_user_id uuid;

-- Credit ledger: which member spent it (per-member attribution in company usage).
alter table public.creed_credit_transactions
  add column if not exists spent_by_user_id uuid;

-- Activity: broaden beyond section edits to membership/billing/permission/etc.
-- Add actor_user_id + event_kind, and relax the section-specific NOT NULLs so a
-- non-section event (e.g. "invited X") can omit them. 'edit' default keeps every
-- existing row valid and unchanged.
alter table public.creed_activity
  add column if not exists actor_user_id uuid;
alter table public.creed_activity
  add column if not exists event_kind text not null default 'edit';
alter table public.creed_activity
  drop constraint if exists creed_activity_event_kind_check;
alter table public.creed_activity
  add constraint creed_activity_event_kind_check
  check (event_kind in (
    'edit', 'proposal', 'membership', 'role', 'permission',
    'billing', 'usage', 'byok', 'ownership', 'section-trash', 'restore'
  ));
alter table public.creed_activity alter column section_id drop not null;
alter table public.creed_activity alter column section_name drop not null;
alter table public.creed_activity alter column accent drop not null;
alter table public.creed_activity alter column change_type drop not null;
alter table public.creed_activity alter column reason drop not null;
alter table public.creed_activity alter column impact drop not null;
alter table public.creed_activity alter column confidence drop not null;
alter table public.creed_activity alter column after_text drop not null;

-- Sections: soft-delete to a 30-day trash (distinct from archive, which is a
-- user-facing "hide" that already exists). Owner/admin restore.
alter table public.creed_sections
  add column if not exists deleted_at timestamptz;
