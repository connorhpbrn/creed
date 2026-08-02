-- Company settings features (SAFE TO APPLY NOW - additive, backward compatible).
--
-- Two new tables backing the rebuilt company /settings screen:
--
-- 1. creed_member_agent_permissions - each member's OWN per-section agent
--    ceiling on a company Creed (the company twin of the personal
--    creed_sections.agent_permission, which is global to the shared file and so
--    cannot express per-member agent behaviour). No row = 'propose' (matches the
--    consent screen's proposal-only default for company spaces). 'hidden' is
--    enforced today by stripping the section from that member's MCP payload;
--    the write levels become live ceilings when company MCP writes ship.
--
-- 2. creed_company_version_control - the company Creed's GitHub sync target
--    (repo/branch/path + last-sync bookkeeping), configured by an owner/admin.
--    Pushes run on the acting owner/admin's personal GitHub connection; only
--    the TARGET is company-level, so no shared tokens exist.
--
-- RLS: both tables are written exclusively through server routes on the
-- service-role client after app-level permission checks (the Batch-A pattern
-- for all company tables). Members may read their own agent-permission rows.

create table if not exists public.creed_member_agent_permissions (
  creed_id   uuid not null references public.creeds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  section_id text not null,
  permission text not null default 'propose'
    check (permission in ('hidden', 'read-only', 'propose', 'direct')),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (creed_id, user_id, section_id)
);

alter table public.creed_member_agent_permissions enable row level security;

drop policy if exists "members read own agent permissions" on public.creed_member_agent_permissions;
create policy "members read own agent permissions"
  on public.creed_member_agent_permissions
  for select
  using (auth.uid() = user_id);

create table if not exists public.creed_company_version_control (
  creed_id                 uuid primary key references public.creeds(id) on delete cascade,
  provider                 text not null default 'github',
  configured_by            uuid,
  repo_owner               text,
  repo_name                text,
  branch                   text,
  path                     text not null default 'creed.md',
  last_remote_sha          text,
  last_remote_message      text,
  last_remote_committed_at timestamptz,
  last_synced_content_hash text,
  sync_status              text not null default 'not-configured',
  created_at               timestamptz not null default timezone('utc'::text, now()),
  updated_at               timestamptz not null default timezone('utc'::text, now())
);

alter table public.creed_company_version_control enable row level security;
-- No client policies: reads flow through the company state loader (admin client,
-- owner/admin only) and writes through the company version-control route.
