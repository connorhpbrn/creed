-- Workspace proposal-based versioning (Model S: Supabase-only).
-- Adds: workspace edit-policy settings, workspace-shared document proposals,
-- and an append-only document version history. Writes are performed server-side
-- with the service-role (admin) client, so only SELECT policies are granted to
-- authenticated users, matching the existing shared-document tables.

-- 1. Workspace edit-policy settings (singleton, mirrors the dashboard-global-prefs pattern).
create table if not exists public.creed_workspace_settings (
  id boolean primary key default true check (id),
  human_edit_policy text not null default 'propose',
  agent_edit_policy text not null default 'propose',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'creed_workspace_settings_human_policy_check'
      and conrelid = 'public.creed_workspace_settings'::regclass
  ) then
    alter table public.creed_workspace_settings
      add constraint creed_workspace_settings_human_policy_check
      check (human_edit_policy in ('cant-edit', 'propose', 'direct'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'creed_workspace_settings_agent_policy_check'
      and conrelid = 'public.creed_workspace_settings'::regclass
  ) then
    alter table public.creed_workspace_settings
      add constraint creed_workspace_settings_agent_policy_check
      check (agent_edit_policy in ('cant-edit', 'propose', 'direct'));
  end if;
end $$;

insert into public.creed_workspace_settings (id)
values (true)
on conflict (id) do nothing;

-- 2. Workspace-shared document proposals.
create table if not exists public.creed_document_proposals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.creed_documents(id) on delete cascade,
  actor_type text not null,
  author_user_id uuid references auth.users(id) on delete set null,
  author_agent_label text,
  draft jsonb not null,
  family_id uuid not null,
  hunk_index integer not null,
  classification text not null default '',
  conflict_status text not null default 'clean',
  summary text not null default '',
  base_revision integer not null default 1,
  status text not null default 'pending',
  resolving boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint creed_document_proposals_actor_type_check check (actor_type in ('human', 'agent')),
  constraint creed_document_proposals_status_check check (status in ('pending', 'accepted', 'rejected')),
  constraint creed_document_proposals_conflict_status_check check (conflict_status in ('clean', 'conflict', 'resolved'))
);

create index if not exists creed_document_proposals_document_status_idx
  on public.creed_document_proposals (document_id, status, created_at desc);

create index if not exists creed_document_proposals_family_idx
  on public.creed_document_proposals (document_id, family_id, hunk_index, created_at);

create index if not exists creed_document_proposals_conflict_idx
  on public.creed_document_proposals (document_id, status, conflict_status, created_at desc);

-- 3. Append-only document version history.
create table if not exists public.creed_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.creed_documents(id) on delete cascade,
  revision integer not null,
  content text not null default '',
  change_hunks jsonb not null default '[]'::jsonb,
  actor_type text not null,
  author_user_id uuid references auth.users(id) on delete set null,
  author_agent_label text,
  summary text not null default '',
  source_proposal_id uuid references public.creed_document_proposals(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint creed_document_versions_actor_type_check check (actor_type in ('human', 'agent'))
);

create index if not exists creed_document_versions_document_idx
  on public.creed_document_versions (document_id, revision desc);

-- RLS: signed-in users may read; all writes go through the service-role client.
alter table public.creed_workspace_settings enable row level security;
alter table public.creed_document_proposals enable row level security;
alter table public.creed_document_versions enable row level security;

drop policy if exists "signed in users can read workspace settings" on public.creed_workspace_settings;
create policy "signed in users can read workspace settings"
  on public.creed_workspace_settings
  for select
  to authenticated
  using (true);

drop policy if exists "signed in users can read document proposals" on public.creed_document_proposals;
create policy "signed in users can read document proposals"
  on public.creed_document_proposals
  for select
  to authenticated
  using (true);

drop policy if exists "signed in users can read document versions" on public.creed_document_versions;
create policy "signed in users can read document versions"
  on public.creed_document_versions
  for select
  to authenticated
  using (true);

grant select on public.creed_workspace_settings to authenticated;
grant select on public.creed_document_proposals to authenticated;
grant select on public.creed_document_versions to authenticated;
