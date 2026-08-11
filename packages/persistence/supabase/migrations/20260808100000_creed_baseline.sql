-- Creed pre-v1 baseline
-- Final schema for Personal and Shared Creeds. Fresh databases only.

create schema if not exists private;

-- Tables

create table public.creeds (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('personal', 'shared')),
  name             text not null,
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  onboarding_stage text,
  created_at       timestamptz not null default timezone('utc'::text, now()),
  updated_at       timestamptz not null default timezone('utc'::text, now()),
  shared_email text,
  avatar_url text,
  sync_updated_at timestamptz not null
  default timezone('utc'::text, now())
);

create table public.creed_members (
  creed_id   uuid not null references public.creeds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (creed_id, user_id)
);

create table public.creed_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive' check (status in ('inactive', 'active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  billing_interval text check (billing_interval is null or billing_interval in ('month', 'year')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  welcomed_at timestamptz,
  welcomed_personal_at timestamptz,
  welcomed_shared_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table public.creed_sections (
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
  agent_writable boolean not null default false,
  template text not null default 'freeform',
  agent_permission text not null default 'propose',
  archived_at timestamptz null,
  creed_id uuid references public.creeds(id) on delete cascade not null,
  deleted_at timestamptz,
  constraint creed_sections_agent_permission_check check (agent_permission in ('hidden', 'read-only', 'propose', 'direct')),
  constraint creed_sections_pkey primary key (creed_id, section_id)
);

create table public.creed_proposals (
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
  updated_at timestamptz not null default timezone('utc'::text, now()),
  creed_id uuid references public.creeds(id) on delete cascade not null,
  author_user_id uuid
);

create table public.creed_activity (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  proposal_id text references public.creed_proposals(id) on delete set null,
  section_id text,
  section_name text,
  accent text,
  actor text not null,
  actor_type text not null,
  summary text not null,
  status text not null,
  change_type text,
  reason text,
  impact text,
  confidence text,
  before_text text,
  after_text text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  creed_id uuid references public.creeds(id) on delete cascade not null,
  actor_user_id uuid,
  event_kind text not null default 'edit',
  constraint creed_activity_event_kind_check check (event_kind in (
    'edit', 'proposal', 'membership', 'role', 'permission',
    'billing', 'usage', 'byok', 'ownership', 'section-trash', 'restore'
  ))
);

create table public.creed_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id text not null,
  status text not null default 'not-connected',
  last_seen_at timestamptz,
  last_agent_name text,
  observed_via text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  creed_id uuid references public.creeds(id) on delete cascade not null,
  constraint creed_connections_pkey primary key (creed_id, connection_id)
);

create table public.creed_tokens (
  creed_id uuid primary key references public.creeds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_token text,
  proposal_token text,
  require_approval boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  read_token_hash text,
  proposal_token_hash text,
  direct_edit_token text,
  direct_edit_token_hash text,
  encrypted_read_token text,
  encrypted_proposal_token text,
  encrypted_direct_edit_token text
);

create table public.creed_integrations (
  creed_id uuid not null references public.creeds(id) on delete cascade,
  provider text not null default 'github',
  status text not null default 'not-connected'
    check (status in ('connected', 'not-connected', 'disconnected')),
  provider_account_id text,
  provider_login text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (creed_id, provider)
);

create table public.creed_version_control (
  creed_id uuid primary key references public.creeds(id) on delete cascade,
  provider text not null default 'github',
  configured_by uuid references auth.users(id) on delete set null,
  repo_owner text,
  repo_name text,
  branch text,
  path text not null default 'creed.md',
  last_remote_sha text,
  last_remote_message text,
  last_remote_committed_at timestamptz,
  last_synced_content_hash text,
  sync_status text not null default 'not-configured',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table public.creed_mcp_clients (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  client_name text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  creed_id uuid references public.creeds(id) on delete cascade not null,
  constraint creed_mcp_clients_pkey primary key (creed_id, client_id)
);

create table public.creed_ai_settings (
  creed_id uuid primary key references public.creeds(id) on delete cascade,
  provider text not null default 'openrouter',
  encrypted_api_key text,
  api_key_hash text,
  api_key_last_four text,
  key_status text not null default 'missing'
    check (key_status in ('missing', 'valid', 'invalid')),
  ai_mode text not null default 'credits'
    check (ai_mode in ('credits', 'byok')),
  last_validated_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table public.creed_ai_usage (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  provider text not null default 'openrouter',
  model_id text not null,
  model_quality text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  ai_mode text not null default 'byok'
  check (ai_mode in ('credits', 'byok')),
  charged_micro_usd bigint,
  creed_id uuid references public.creeds(id) on delete cascade
);

create table public.creed_quality_reports (
  user_id uuid references auth.users(id) on delete cascade,
  content_hash text not null,
  model_id text not null,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  creed_id uuid references public.creeds(id) on delete cascade not null,
  constraint creed_quality_reports_pkey primary key (creed_id)
);

create table public.creed_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  creed_id uuid references public.creeds(id) on delete cascade
);

create table public.creed_mcp_read_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  day date not null,
  read_count integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  creed_id uuid references public.creeds(id) on delete cascade not null,
  constraint creed_mcp_read_events_pkey primary key (creed_id, client_id, day)
);

create table public.oauth_clients (
  client_id text primary key,
  client_name text not null default 'MCP Client',
  redirect_uris text[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now()),
  last_used_at timestamptz
);

create table public.oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null default 'read propose',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  creed_grants jsonb,
  resource text
);

create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null,
  refresh_token_hash text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'read propose',
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  resource text
);

create table public.creed_credits (
  balance_micro_usd bigint not null default 0,
  created_at        timestamptz not null default timezone('utc'::text, now()),
  updated_at        timestamptz not null default timezone('utc'::text, now()),
  granted_micro_usd bigint not null default 0,
  purchased_micro_usd bigint not null default 0,
  grant_period_key text,
  grant_period_start timestamptz,
  creed_id uuid references public.creeds(id) on delete cascade not null,
  constraint creed_credits_pkey primary key (creed_id)
);

create table public.creed_credit_transactions (
  id                       text primary key,
  type                     text not null,
  amount_micro_usd         bigint not null check (amount_micro_usd >= 0),
  balance_after_micro_usd  bigint not null,
  feature                  text,
  model_id                 text,
  stripe_payment_intent_id text unique,
  created_at               timestamptz not null default timezone('utc'::text, now()),
  bucket text
    check (bucket is null or bucket in ('granted', 'purchased', 'mixed')),
  grant_period_key text,
  creed_id uuid references public.creeds(id) on delete cascade not null,
  spent_by_user_id uuid,
  check (type <> 'topup' or stripe_payment_intent_id is not null),
  constraint creed_credit_transactions_type_check check (type in ('topup', 'debit', 'grant', 'refund'))
);

create table public.creed_member_section_permissions (
  creed_id   uuid not null references public.creeds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  section_id text not null,
  permission text not null check (permission in ('hidden', 'read-only', 'propose', 'direct')),
  updated_by uuid,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (creed_id, user_id, section_id)
);

create table public.creed_invites (
  id         uuid primary key default gen_random_uuid(),
  creed_id   uuid not null references public.creeds(id) on delete cascade,
  email      text not null,
  role       text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by uuid not null,
  status     text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint creed_invites_status_check check (status = any (array['pending', 'accepted', 'revoked', 'expired', 'declined']))
);

create table public.creed_section_versions (
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



create table public.oauth_token_creeds (
  token_id uuid not null references public.oauth_tokens(id) on delete cascade,
  creed_id uuid not null references public.creeds(id) on delete cascade,
  mode     text not null default 'proposal-only'
    check (mode in ('read-only', 'proposal-only', 'direct')),
  primary key (token_id, creed_id)
);

create table public.creed_member_agent_permissions (
  creed_id   uuid not null references public.creeds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  section_id text not null,
  permission text not null default 'propose'
    check (permission in ('hidden', 'read-only', 'propose', 'direct')),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (creed_id, user_id, section_id)
);





create table public.creed_getting_started (
  user_id uuid primary key references auth.users(id) on delete cascade,
  steps jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table public.rate_limit_hits (
  key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count >= 0),
  updated_at timestamptz not null default now()
);

create table public.creed_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  creed_id uuid not null references public.creeds(id) on delete cascade,
  reserved_granted_micro_usd bigint not null check (reserved_granted_micro_usd >= 0),
  reserved_purchased_micro_usd bigint not null check (reserved_purchased_micro_usd >= 0),
  feature text not null,
  model_id text not null,
  spent_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'cancelled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

-- Membership helpers

create or replace function private.creed_role(p_creed_id uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select role
  from public.creed_members
  where creed_id = p_creed_id and user_id = (select auth.uid());
$$;

create or replace function private.creed_type(p_creed_id uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select type from public.creeds where id = p_creed_id;
$$;

create or replace function private.creed_section_permission(p_creed_id uuid, p_section_id text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_role text;
  v_perm text;
begin
  v_role := private.creed_role(p_creed_id);
  if v_role is null then return null; end if;
  if v_role in ('owner', 'admin') then return 'direct'; end if;
  select permission into v_perm
  from public.creed_member_section_permissions
  where creed_id = p_creed_id
    and user_id = (select auth.uid())
    and section_id = p_section_id;
  return coalesce(v_perm, 'direct');
end;
$$;

-- Access, indexes, functions, and triggers

alter table public.creed_entitlements enable row level security;

create policy "users read their cloud entitlement" on public.creed_entitlements for select using (auth.uid() = user_id);

revoke all on table public.creed_entitlements from anon;

grant select on table public.creed_entitlements to authenticated;

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

create index if not exists creed_integrations_creed_provider_idx
  on public.creed_integrations (creed_id, provider);

alter table public.creed_integrations enable row level security;

alter table public.creed_version_control enable row level security;

create index if not exists creed_mcp_clients_user_last_seen_idx
  on public.creed_mcp_clients (user_id, last_seen_at desc);

alter table public.creed_mcp_clients enable row level security;

create index if not exists creed_ai_usage_user_created_idx
  on public.creed_ai_usage (user_id, created_at desc);

create index if not exists creed_quality_reports_user_hash_idx
  on public.creed_quality_reports (user_id, content_hash);

alter table public.creed_ai_settings enable row level security;

alter table public.creed_ai_usage enable row level security;

alter table public.creed_quality_reports enable row level security;

create policy "users can read their creed ai usage"
  on public.creed_ai_usage
  for select
  using (auth.uid() = user_id);

create policy "users can manage their creed quality reports"
  on public.creed_quality_reports
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create extension if not exists pgcrypto;

create unique index if not exists creed_tokens_read_token_hash_idx
  on public.creed_tokens (read_token_hash)
  where read_token_hash is not null;

create unique index if not exists creed_tokens_proposal_token_hash_idx
  on public.creed_tokens (proposal_token_hash)
  where proposal_token_hash is not null;

create unique index if not exists creed_tokens_direct_edit_token_hash_idx
  on public.creed_tokens (direct_edit_token_hash)
  where direct_edit_token_hash is not null;

create index if not exists creed_audit_log_user_id_created_at_idx
  on public.creed_audit_log (user_id, created_at desc);

create index if not exists creed_audit_log_action_created_at_idx
  on public.creed_audit_log (action, created_at desc);

alter table public.creed_audit_log enable row level security;

truncate table
  public.creed_sections,
  public.creed_proposals,
  public.creed_activity
cascade;

create index if not exists creed_sections_template_idx
  on public.creed_sections (template);

create index if not exists creed_mcp_read_events_user_day_idx
  on public.creed_mcp_read_events (user_id, day desc);

alter table public.creed_mcp_read_events enable row level security;

create policy "creed_mcp_read_events_select_own"
  on public.creed_mcp_read_events
  for select
  using (auth.uid() = user_id);

alter table public.oauth_clients enable row level security;

create index if not exists oauth_authorization_codes_user_idx
  on public.oauth_authorization_codes (user_id);

alter table public.oauth_authorization_codes enable row level security;

create unique index if not exists oauth_tokens_access_hash_idx
  on public.oauth_tokens (access_token_hash);

create unique index if not exists oauth_tokens_refresh_hash_idx
  on public.oauth_tokens (refresh_token_hash);

create index if not exists oauth_tokens_user_client_idx
  on public.oauth_tokens (user_id, client_id);

alter table public.oauth_tokens enable row level security;

alter table public.creed_credits enable row level security;

alter table public.creed_credit_transactions enable row level security;

create index if not exists creeds_owner_idx on public.creeds (owner_user_id);

create index if not exists creed_members_user_idx on public.creed_members (user_id);

create unique index if not exists creed_members_one_owner_per_creed
  on public.creed_members (creed_id) where role = 'owner';

alter table public.creeds enable row level security;

create policy "members read their creeds"
  on public.creeds
  for select
  using (private.creed_role(id) is not null);

alter table public.creed_members enable row level security;

create policy "members read their creed roster"
  on public.creed_members
  for select
  using (private.creed_role(creed_id) is not null);

create index if not exists creed_sections_creed_position_idx
  on public.creed_sections (creed_id, position);

create index if not exists creed_proposals_creed_status_idx
  on public.creed_proposals (creed_id, status);

create index if not exists creed_activity_creed_created_idx
  on public.creed_activity (creed_id, created_at desc);

create index if not exists creed_connections_creed_updated_idx
  on public.creed_connections (creed_id, updated_at desc);

create index if not exists creed_mcp_clients_creed_last_seen_idx
  on public.creed_mcp_clients (creed_id, last_seen_at desc);

create index if not exists creed_mcp_read_events_creed_day_idx
  on public.creed_mcp_read_events (creed_id, day desc);

create unique index if not exists creed_credits_creed_id_key
  on public.creed_credits (creed_id);

create index if not exists creed_credit_transactions_creed_created_idx
  on public.creed_credit_transactions (creed_id, created_at desc);

create unique index if not exists creed_credit_transactions_grant_period_idx
  on public.creed_credit_transactions (creed_id, grant_period_key)
  where type = 'grant';

create index if not exists creed_ai_usage_creed_created_idx
  on public.creed_ai_usage (creed_id, created_at desc);

create index if not exists creed_quality_reports_creed_hash_idx
  on public.creed_quality_reports (creed_id, content_hash);

create index if not exists creed_audit_log_creed_created_idx
  on public.creed_audit_log (creed_id, created_at desc);

alter table public.creed_member_section_permissions enable row level security;

create unique index if not exists creed_invites_one_pending_per_email
  on public.creed_invites (creed_id, lower(email)) where status = 'pending';

create index if not exists creed_invites_creed_idx on public.creed_invites (creed_id);

alter table public.creed_invites enable row level security;

create policy "owners and admins read invites"
  on public.creed_invites
  for select
  using (private.creed_role(creed_id) in ('owner', 'admin'));

create index if not exists creed_section_versions_lookup_idx
  on public.creed_section_versions (creed_id, section_id, id desc);

alter table public.creed_section_versions enable row level security;

create policy "members read visible section versions"
  on public.creed_section_versions
  for select
  using (private.creed_section_permission(creed_id, section_id) is distinct from 'hidden'
         and private.creed_role(creed_id) is not null);

create index if not exists oauth_token_creeds_creed_idx on public.oauth_token_creeds (creed_id);

alter table public.oauth_token_creeds enable row level security;

create policy "read member section permissions"
  on public.creed_member_section_permissions
  for select
  using (
    user_id = (select auth.uid())
    or private.creed_role(creed_id) in ('owner', 'admin')
  );

create policy "users read own token grants"
  on public.oauth_token_creeds
  for select
  using (exists (
    select 1 from public.oauth_tokens t
    where t.id = token_id and t.user_id = (select auth.uid())
  ));

create index if not exists creed_member_section_permissions_user_idx
  on public.creed_member_section_permissions (user_id);

create unique index if not exists creed_sections_creed_section_unique
  on public.creed_sections (creed_id, section_id);

alter table public.creed_member_agent_permissions enable row level security;

create policy "members read visible sections" on public.creed_sections for select
  using (
    private.creed_role(creed_id) is not null
    and private.creed_section_permission(creed_id, section_id) is distinct from 'hidden'
    and (deleted_at is null or private.creed_role(creed_id) in ('owner','admin'))
  );

create policy "members read visible proposals" on public.creed_proposals for select
  using (
    private.creed_role(creed_id) is not null
    and private.creed_section_permission(creed_id, section_id) is distinct from 'hidden'
  );

create policy "members read visible activity" on public.creed_activity for select
  using (
    private.creed_role(creed_id) is not null
    and (section_id is null or private.creed_section_permission(creed_id, section_id) is distinct from 'hidden')
    and (event_kind <> 'billing' or private.creed_role(creed_id) in ('owner','admin'))
  );

create policy "members read connections" on public.creed_connections for select
  using (private.creed_role(creed_id) is not null);

create policy "members read mcp clients" on public.creed_mcp_clients for select
  using (private.creed_role(creed_id) is not null);

create policy "members read mcp read events" on public.creed_mcp_read_events for select
  using (private.creed_role(creed_id) is not null);

create policy "members read credits" on public.creed_credits for select
  using (private.creed_role(creed_id) is not null);

create policy "members read credit transactions" on public.creed_credit_transactions for select
  using (private.creed_role(creed_id) is not null);

create policy "members read shared ai usage" on public.creed_ai_usage for select
  using (creed_id is not null and private.creed_role(creed_id) in ('owner','admin'));

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

create or replace function public.credit_topup(
  p_creed_id uuid,
  p_amount_micro bigint,
  p_payment_intent_id text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted bigint;
  v_purchased bigint;
begin
  insert into public.creed_credit_transactions (
    id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
    stripe_payment_intent_id, bucket
  )
  values (
    gen_random_uuid()::text, p_creed_id, 'topup', p_amount_micro, 0,
    p_payment_intent_id, 'purchased'
  )
  on conflict (stripe_payment_intent_id) do nothing;

  if not found then
    select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
      into v_granted, v_purchased
      from public.creed_credits where creed_id = p_creed_id;
    return coalesce(v_granted, 0) + coalesce(v_purchased, 0);
  end if;

  insert into public.creed_credits (creed_id, purchased_micro_usd, updated_at)
  values (p_creed_id, p_amount_micro, timezone('utc'::text, now()))
  on conflict (creed_id) do update
    set purchased_micro_usd = public.creed_credits.purchased_micro_usd + excluded.purchased_micro_usd,
        updated_at = timezone('utc'::text, now())
  returning granted_micro_usd, purchased_micro_usd into v_granted, v_purchased;

  update public.creed_credit_transactions
    set balance_after_micro_usd = v_granted + v_purchased
    where stripe_payment_intent_id = p_payment_intent_id;

  return v_granted + v_purchased;
end;
$$;

create or replace function public.debit_credits(
  p_creed_id uuid,
  p_amount_micro bigint,
  p_feature text,
  p_model_id text,
  p_spent_by uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted bigint;
  v_purchased bigint;
  v_from_granted bigint;
  v_from_purchased bigint;
  v_new_granted bigint;
  v_new_purchased bigint;
  v_bucket text;
begin
  insert into public.creed_credits (creed_id)
  values (p_creed_id)
  on conflict (creed_id) do nothing;

  select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  v_from_granted := least(greatest(v_granted, 0), p_amount_micro);
  v_from_purchased := p_amount_micro - v_from_granted;
  v_new_granted := v_granted - v_from_granted;
  v_new_purchased := v_purchased - v_from_purchased;

  update public.creed_credits
    set granted_micro_usd = v_new_granted,
        purchased_micro_usd = v_new_purchased,
        updated_at = timezone('utc'::text, now())
    where creed_id = p_creed_id;

  if v_from_granted > 0 and v_from_purchased > 0 then
    v_bucket := 'mixed';
  elsif v_from_granted > 0 then
    v_bucket := 'granted';
  else
    v_bucket := 'purchased';
  end if;

  insert into public.creed_credit_transactions (
    id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
    feature, model_id, bucket, spent_by_user_id
  )
  values (
    gen_random_uuid()::text, p_creed_id, 'debit', p_amount_micro,
    v_new_granted + v_new_purchased, p_feature, p_model_id, v_bucket, p_spent_by
  );

  return v_new_granted + v_new_purchased;
end;
$$;

create or replace function public.grant_allowance(
  p_creed_id uuid,
  p_allowance_micro bigint,
  p_period_key text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_key text;
  v_granted bigint;
  v_purchased bigint;
begin
  insert into public.creed_credits (creed_id)
  values (p_creed_id)
  on conflict (creed_id) do nothing;

  select grant_period_key, coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_current_key, v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  if v_current_key is distinct from p_period_key then
    update public.creed_credits
      set granted_micro_usd = p_allowance_micro,
          grant_period_key = p_period_key,
          grant_period_start = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      where creed_id = p_creed_id;

    insert into public.creed_credit_transactions (
      id, creed_id, type, amount_micro_usd, balance_after_micro_usd, bucket, grant_period_key
    )
    values (
      gen_random_uuid()::text, p_creed_id, 'grant', p_allowance_micro,
      p_allowance_micro + v_purchased, 'granted', p_period_key
    )
    on conflict do nothing;

    return p_allowance_micro + v_purchased;
  end if;

  return v_granted + v_purchased;
end;
$$;

revoke all on function public.credit_topup(uuid, bigint, text) from public, anon, authenticated;

grant execute on function public.credit_topup(uuid, bigint, text) to service_role;

revoke all on function public.debit_credits(uuid, bigint, text, text, uuid) from public, anon, authenticated;

grant execute on function public.debit_credits(uuid, bigint, text, text, uuid) to service_role;

revoke all on function public.grant_allowance(uuid, bigint, text) from public, anon, authenticated;

grant execute on function public.grant_allowance(uuid, bigint, text) to service_role;

create or replace function public.credit_spend_total(p_creed_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or exists (
      select 1 from public.creed_members m
      where m.creed_id = p_creed_id and m.user_id = auth.uid()
    )
    then coalesce((
      select sum(amount_micro_usd)
      from public.creed_credit_transactions
      where creed_id = p_creed_id and type = 'debit'
    ), 0)::bigint
    else 0::bigint
  end;
$$;

create policy "members read quality reports" on public.creed_quality_reports
  for select using (private.creed_role(creed_id) is not null);

create index if not exists creed_activity_proposal_id_idx
  on public.creed_activity (proposal_id);

create index if not exists creed_member_agent_permissions_user_id_idx
  on public.creed_member_agent_permissions (user_id);

create policy "personal owner inserts sections"
  on public.creed_sections
  for insert
  to authenticated
  with check (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner');

create policy "personal owner updates sections"
  on public.creed_sections
  for update
  to authenticated
  using (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner')
  with check (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner');

create policy "personal owner deletes sections"
  on public.creed_sections
  for delete
  to authenticated
  using (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner');

create policy "personal owner inserts proposals"
  on public.creed_proposals
  for insert
  to authenticated
  with check (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner');

create policy "personal owner updates proposals"
  on public.creed_proposals
  for update
  to authenticated
  using (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner')
  with check (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner');

create policy "personal owner deletes proposals"
  on public.creed_proposals
  for delete
  to authenticated
  using (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner');

create policy "personal owner inserts activity"
  on public.creed_activity
  for insert
  to authenticated
  with check (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner');

create policy "personal owner updates activity"
  on public.creed_activity
  for update
  to authenticated
  using (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner')
  with check (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner');

create policy "personal owner deletes activity"
  on public.creed_activity
  for delete
  to authenticated
  using (private.creed_type(creed_id) = 'personal' and private.creed_role(creed_id) = 'owner');

create policy "users can manage their creed tokens"
  on public.creed_tokens
  for all
  to authenticated
  using (private.creed_role(creed_id) = 'owner')
  with check (private.creed_role(creed_id) = 'owner' and (select auth.uid()) = user_id);

create policy "members read creed integrations"
  on public.creed_integrations for select to authenticated
  using (private.creed_role(creed_id) is not null);

create policy "managers manage creed integrations"
  on public.creed_integrations for all to authenticated
  using (private.creed_role(creed_id) in ('owner', 'admin'))
  with check (private.creed_role(creed_id) in ('owner', 'admin'));

create policy "members read creed version control"
  on public.creed_version_control for select to authenticated
  using (private.creed_role(creed_id) is not null);

create policy "managers manage creed version control"
  on public.creed_version_control for all to authenticated
  using (private.creed_role(creed_id) in ('owner', 'admin'))
  with check (private.creed_role(creed_id) in ('owner', 'admin'));

create policy "owners read creed ai settings"
  on public.creed_ai_settings for select to authenticated
  using (private.creed_role(creed_id) = 'owner');

create policy "owners manage creed ai settings"
  on public.creed_ai_settings for all to authenticated
  using (private.creed_role(creed_id) = 'owner')
  with check (private.creed_role(creed_id) = 'owner');

create policy "users and managers can read creed ai usage"
  on public.creed_ai_usage
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      creed_id is not null
      and private.creed_role(creed_id) in ('owner', 'admin')
    )
  );

create policy "users can insert their creed ai usage"
  on public.creed_ai_usage
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "creed_audit_log_select_own"
  on public.creed_audit_log
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "oauth_tokens_select_own"
  on public.oauth_tokens
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "oauth_tokens_delete_own"
  on public.oauth_tokens
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "members read own agent permissions"
  on public.creed_member_agent_permissions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on function public.credit_spend_total(uuid) from public, anon, authenticated;

grant execute on function public.credit_spend_total(uuid) to service_role;

create or replace function public.increment_mcp_read_for_creed(
  p_creed_id uuid,
  p_reader_user_id uuid,
  p_client_id text,
  p_day date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_creed_id is null or p_reader_user_id is null then
    raise exception 'creed id and reader user id are required';
  end if;

  if not exists (
    select 1
    from public.creed_members
    where creed_id = p_creed_id
      and user_id = p_reader_user_id
  ) then
    raise exception 'reader is not an active member of this creed';
  end if;

  insert into public.creed_mcp_read_events (creed_id, user_id, client_id, day, read_count)
  values (p_creed_id, p_reader_user_id, p_client_id, p_day, 1)
  on conflict (creed_id, client_id, day)
  do update set
    read_count = public.creed_mcp_read_events.read_count + 1,
    updated_at = timezone('utc'::text, now());
end;
$$;

revoke all on function public.increment_mcp_read_for_creed(uuid, uuid, text, date) from public, anon, authenticated;

grant execute on function public.increment_mcp_read_for_creed(uuid, uuid, text, date) to service_role;

create or replace function public.increment_mcp_read(
  p_user_id uuid,
  p_client_id text,
  p_day date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creed_id uuid;
begin
  select id
    into v_creed_id
    from public.creeds
    where owner_user_id = p_user_id
      and type = 'personal';

  if v_creed_id is null then
    raise exception 'personal creed not found for user %', p_user_id;
  end if;

  perform public.increment_mcp_read_for_creed(v_creed_id, p_user_id, p_client_id, p_day);
end;
$$;

revoke all on function public.increment_mcp_read(uuid, text, date) from public, anon, authenticated;

grant execute on function public.increment_mcp_read(uuid, text, date) to service_role;

create policy "public read creed avatars"
  on storage.objects
  for select
  to public
  using (bucket_id = 'creed-avatars');

create extension if not exists pg_cron with schema pg_catalog;

create index if not exists creed_activity_created_idx
  on public.creed_activity (created_at);

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

create index if not exists creed_proposals_creed_created_idx
  on public.creed_proposals (creed_id, created_at desc);

alter table public.rate_limit_hits enable row level security;

revoke all on table public.rate_limit_hits from public, anon, authenticated;

create index if not exists rate_limit_hits_updated_at_idx
  on public.rate_limit_hits (updated_at);

alter table public.creed_credit_reservations enable row level security;

revoke all on table public.creed_credit_reservations from public, anon, authenticated;

create index if not exists creed_credit_reservations_open_idx
  on public.creed_credit_reservations (creed_id, created_at)
  where status = 'reserved';

create or replace function public.reserve_credits(
  p_creed_id uuid,
  p_amount_micro bigint,
  p_feature text,
  p_model_id text,
  p_spent_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_granted bigint;
  v_purchased bigint;
  v_from_granted bigint;
  v_from_purchased bigint;
  stale record;
begin
  if p_amount_micro <= 0 then raise exception 'invalid_reservation_amount'; end if;
  insert into public.creed_credits (creed_id) values (p_creed_id)
    on conflict (creed_id) do nothing;
  select granted_micro_usd, purchased_micro_usd into v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  for stale in
    select * from public.creed_credit_reservations
    where creed_id = p_creed_id and status = 'reserved'
      and created_at < now() - interval '10 minutes'
    for update
  loop
    v_granted := v_granted + stale.reserved_granted_micro_usd;
    v_purchased := v_purchased + stale.reserved_purchased_micro_usd;
    update public.creed_credit_reservations set status = 'cancelled', settled_at = now()
      where id = stale.id;
  end loop;

  if v_granted + v_purchased < p_amount_micro then
    raise exception 'insufficient_credits';
  end if;
  v_from_granted := least(v_granted, p_amount_micro);
  v_from_purchased := p_amount_micro - v_from_granted;
  update public.creed_credits set
    granted_micro_usd = v_granted - v_from_granted,
    purchased_micro_usd = v_purchased - v_from_purchased,
    updated_at = now()
    where creed_id = p_creed_id;
  insert into public.creed_credit_reservations (
    id, creed_id, reserved_granted_micro_usd, reserved_purchased_micro_usd,
    feature, model_id, spent_by_user_id
  ) values (v_id, p_creed_id, v_from_granted, v_from_purchased, p_feature, p_model_id, p_spent_by);
  return v_id;
end;
$$;

create or replace function public.settle_credit_reservation(
  p_reservation_id uuid,
  p_actual_micro bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.creed_credit_reservations%rowtype;
  v_reserved bigint;
  v_actual bigint;
  v_used_granted bigint;
  v_used_purchased bigint;
  v_balance bigint;
  v_bucket text;
begin
  select * into r from public.creed_credit_reservations
    where id = p_reservation_id for update;
  if not found or r.status <> 'reserved' then raise exception 'invalid_reservation'; end if;
  v_reserved := r.reserved_granted_micro_usd + r.reserved_purchased_micro_usd;
  v_actual := greatest(p_actual_micro, 0);
  v_used_granted := least(r.reserved_granted_micro_usd, v_actual);
  v_used_purchased := least(r.reserved_purchased_micro_usd, v_actual - v_used_granted);
  update public.creed_credits set
    granted_micro_usd = granted_micro_usd + (r.reserved_granted_micro_usd - v_used_granted),
    purchased_micro_usd = purchased_micro_usd + (r.reserved_purchased_micro_usd - v_used_purchased)
      - greatest(v_actual - v_reserved, 0),
    updated_at = now()
    where creed_id = r.creed_id
    returning granted_micro_usd + purchased_micro_usd into v_balance;
  update public.creed_credit_reservations set status = 'settled', settled_at = now()
    where id = r.id;
  if v_actual > 0 then
    v_bucket := case when v_used_granted > 0 and v_used_purchased > 0 then 'mixed'
      when v_used_granted > 0 then 'granted' else 'purchased' end;
    insert into public.creed_credit_transactions (
      id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
      feature, model_id, bucket, spent_by_user_id
    ) values (
      gen_random_uuid()::text, r.creed_id, 'debit', v_actual, v_balance,
      r.feature, r.model_id, v_bucket, r.spent_by_user_id
    );
  end if;
  return v_balance;
end;
$$;

create or replace function public.cancel_credit_reservation(p_reservation_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select public.settle_credit_reservation(p_reservation_id, 0);
$$;

create or replace function public.refund_credit_topup(p_payment_intent_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.creed_credit_transactions%rowtype;
  v_refund_id text := 'refund:' || p_payment_intent_id;
begin
  if exists (select 1 from public.creed_credit_transactions where id = v_refund_id) then return false; end if;
  select * into t from public.creed_credit_transactions
    where stripe_payment_intent_id = p_payment_intent_id and type = 'topup'
    for update;
  if not found then return false; end if;
  update public.creed_credits set
    purchased_micro_usd = greatest(0, purchased_micro_usd - t.amount_micro_usd),
    updated_at = now()
    where creed_id = t.creed_id;
  insert into public.creed_credit_transactions (
    id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
    bucket
  ) select v_refund_id, t.creed_id, 'refund', t.amount_micro_usd,
    granted_micro_usd + purchased_micro_usd, 'purchased'
    from public.creed_credits where creed_id = t.creed_id;
  return true;
end;
$$;

revoke all on function public.reserve_credits(uuid, bigint, text, text, uuid) from public, anon, authenticated;

grant execute on function public.reserve_credits(uuid, bigint, text, text, uuid) to service_role;

revoke all on function public.settle_credit_reservation(uuid, bigint) from public, anon, authenticated;

grant execute on function public.settle_credit_reservation(uuid, bigint) to service_role;

revoke all on function public.cancel_credit_reservation(uuid) from public, anon, authenticated;

grant execute on function public.cancel_credit_reservation(uuid) to service_role;

revoke all on function public.refund_credit_topup(text) from public, anon, authenticated;

grant execute on function public.refund_credit_topup(text) to service_role;

create index if not exists creed_credit_reservations_spent_by_idx
  on public.creed_credit_reservations (spent_by_user_id)
  where spent_by_user_id is not null;

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.rate_limit_hits%rowtype;
  v_now timestamptz := clock_timestamp();
  window_interval interval;
begin
  if p_key is null or length(p_key) > 200 or p_limit <= 0 or
     p_window_seconds <= 0 or p_cost <= 0 then
    return query select false, 0, greatest(p_window_seconds, 1);
    return;
  end if;
  window_interval := make_interval(secs => p_window_seconds);
  if random() < 0.01 then
    delete from public.rate_limit_hits where updated_at < v_now - interval '1 day';
  end if;
  insert into public.rate_limit_hits as hits (key, window_started_at, hit_count, updated_at)
  values (p_key, v_now, p_cost, v_now)
  on conflict (key) do update set
    window_started_at = case when hits.window_started_at + window_interval <= v_now
      then v_now else hits.window_started_at end,
    hit_count = case when hits.window_started_at + window_interval <= v_now
      then p_cost else hits.hit_count + p_cost end,
    updated_at = v_now
  returning * into current_row;
  return query select
    current_row.hit_count <= p_limit,
    greatest(p_limit - current_row.hit_count, 0),
    greatest(ceil(extract(epoch from
      (current_row.window_started_at + window_interval - v_now)
    ))::integer, 1);
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer, integer)
  from public, anon, authenticated;

grant execute on function public.check_rate_limit(text, integer, integer, integer)
  to service_role;

select cron.schedule(
  'creed-activity-retention',
  '17 3 * * *',
  $$delete from public.creed_activity where created_at < now() - interval '7 days'$$
);

create or replace function public.guard_oauth_client_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Serialize the prune + ceiling check so concurrent registrations cannot
  -- race past the global cap.
  perform pg_advisory_xact_lock(hashtext('creed:oauth-client-registration'));

  delete from public.oauth_authorization_codes
  where expires_at < now()
     or (used_at is not null and used_at < now() - interval '1 day');

  delete from public.oauth_tokens
  where (revoked_at is not null and revoked_at < now() - interval '7 days')
     or refresh_expires_at < now() - interval '7 days';

  delete from public.oauth_clients c
  where c.created_at < now() - interval '7 days'
    and coalesce(c.last_used_at, c.created_at) < now() - interval '7 days'
    and not exists (select 1 from public.oauth_tokens t where t.client_id = c.client_id)
    and not exists (select 1 from public.oauth_authorization_codes a where a.client_id = c.client_id);

  if (select count(*) from public.oauth_clients) >= 10000 then
    raise exception 'OAuth client registration capacity reached';
  end if;
  return null;
end;
$$;

revoke all on function public.guard_oauth_client_registration() from public, anon, authenticated;

grant execute on function public.guard_oauth_client_registration() to service_role;

create trigger guard_oauth_client_registration before insert on public.oauth_clients
for each statement execute function public.guard_oauth_client_registration();

revoke all on schema private from public, anon;

grant usage on schema private to authenticated, service_role;

revoke all on function private.creed_role(uuid) from public, anon;

revoke all on function private.creed_type(uuid) from public, anon;

revoke all on function private.creed_section_permission(uuid, text) from public, anon;

grant execute on function private.creed_role(uuid) to authenticated, service_role;

grant execute on function private.creed_type(uuid) to authenticated, service_role;

grant execute on function private.creed_section_permission(uuid, text) to authenticated, service_role;

create or replace function private.touch_creed_sync_tick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_creed_id uuid;
begin
  target_creed_id := case when tg_op = 'DELETE' then old.creed_id else new.creed_id end;
  update public.creeds
  set sync_updated_at = timezone('utc'::text, clock_timestamp())
  where id = target_creed_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.touch_creed_sync_tick() from public, anon, authenticated;

create or replace function public.get_creed_state_tick(p_creed_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select floor(extract(epoch from greatest(updated_at, sync_updated_at)) * 1000)::bigint
  from public.creeds
  where id = p_creed_id;
$$;

revoke all on function public.get_creed_state_tick(uuid) from public, anon, authenticated;

grant execute on function public.get_creed_state_tick(uuid) to service_role;

create or replace function private.get_member_profiles(p_creed_id uuid)
returns table(user_id uuid, role text, email text, raw_user_meta_data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.role, coalesce(u.email, ''), coalesce(u.raw_user_meta_data, '{}'::jsonb)
  from public.creed_members m
  join auth.users u on u.id = m.user_id
  where m.creed_id = p_creed_id
  order by m.created_at;
$$;

revoke all on function private.get_member_profiles(uuid) from public, anon, authenticated;

grant execute on function private.get_member_profiles(uuid) to service_role;

create or replace function public.get_member_profiles(p_creed_id uuid)
returns table(user_id uuid, role text, email text, raw_user_meta_data jsonb)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.get_member_profiles(p_creed_id); $$;

revoke all on function public.get_member_profiles(uuid) from public, anon, authenticated;

grant execute on function public.get_member_profiles(uuid) to service_role;

create or replace function private.touch_personal_creed_sync_tick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  target_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  update public.creeds
  set sync_updated_at = timezone('utc'::text, clock_timestamp())
  where owner_user_id = target_user_id and type = 'personal';
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.touch_personal_creed_sync_tick() from public, anon, authenticated;

create trigger touch_creed_sync_tick
after insert or update or delete on public.creed_tokens
for each row execute function private.touch_creed_sync_tick();

create trigger touch_creed_sync_tick
after insert or update or delete on public.creed_integrations
for each row execute function private.touch_creed_sync_tick();

create trigger touch_creed_sync_tick
after insert or update or delete on public.creed_version_control
for each row execute function private.touch_creed_sync_tick();

create trigger touch_personal_creed_sync_tick
after insert or update or delete on public.creed_getting_started
for each row execute function private.touch_personal_creed_sync_tick();

create trigger touch_creed_sync_tick
after insert or update or delete on public.creed_ai_settings
for each row execute function private.touch_creed_sync_tick();

create index if not exists creed_proposals_user_id_idx
  on public.creed_proposals (user_id);

create or replace function public.update_creed_section_positions(
  p_creed_id uuid,
  p_section_ids text[],
  p_updated_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_creed_id is null or p_section_ids is null then
    raise exception 'creed id and section ids are required';
  end if;

  if cardinality(p_section_ids) <> (
    select count(distinct section_id)
    from unnest(p_section_ids) as section_id
  ) then
    raise exception 'section ids must be unique';
  end if;

  if cardinality(p_section_ids) <> (
    select count(*)
    from public.creed_sections
    where creed_id = p_creed_id
      and deleted_at is null
  ) then
    raise exception 'section order must include every active section';
  end if;

  update public.creed_sections as section
  set position = ordered.position,
      updated_at = p_updated_at
  from (
    select section_id, (ordinality - 1)::integer as position
    from unnest(p_section_ids) with ordinality as input(section_id, ordinality)
  ) as ordered
  where section.creed_id = p_creed_id
    and section.section_id = ordered.section_id
    and section.deleted_at is null;

  get diagnostics v_updated = row_count;
  if v_updated <> cardinality(p_section_ids) then
    raise exception 'section order did not match the active Creed sections';
  end if;
  return v_updated;
end;
$$;

revoke all on function public.update_creed_section_positions(uuid, text[], timestamptz)
  from public, anon, authenticated;

grant execute on function public.update_creed_section_positions(uuid, text[], timestamptz)
  to service_role;

create or replace function public.accept_shared_invite(
  p_invite_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.creed_invites%rowtype;
begin
  select *
  into invite
  from public.creed_invites
  where id = p_invite_id
  for update;

  if not found or invite.status <> 'pending' or invite.expires_at <= now() then
    return 'invalid';
  end if;

  insert into public.creed_members (creed_id, user_id, role)
  values (invite.creed_id, p_user_id, invite.role)
  on conflict (creed_id, user_id) do nothing;

  update public.creed_invites
  set status = 'accepted', updated_at = now()
  where id = invite.id;

  return 'accepted';
end;
$$;

revoke all on function public.accept_shared_invite(uuid, uuid) from public, anon, authenticated;

grant execute on function public.accept_shared_invite(uuid, uuid) to service_role;

create or replace function public.transfer_creed_ownership(
  p_creed_id uuid,
  p_from uuid,
  p_to uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if p_creed_id is null or p_from is null or p_to is null then
    raise exception 'creed id, source owner, and target owner are required';
  end if;
  if p_from = p_to then
    raise exception 'target already owns this creed';
  end if;
  if not exists (
    select 1 from public.creeds
    where id = p_creed_id and type = 'shared' and owner_user_id = p_from
  ) then
    raise exception 'source user is not the shared owner';
  end if;
  if not exists (
    select 1 from public.creed_members
    where creed_id = p_creed_id and user_id = p_to and role in ('admin', 'member')
  ) then
    raise exception 'target user is not an active non-owner member';
  end if;
  update public.creed_members set role = 'admin'
    where creed_id = p_creed_id and user_id = p_from and role = 'owner';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'expected exactly one outgoing owner, got %', changed; end if;
  update public.creed_members set role = 'owner'
    where creed_id = p_creed_id and user_id = p_to and role in ('admin', 'member');
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'expected exactly one incoming owner, got %', changed; end if;
  update public.creeds set owner_user_id = p_to, updated_at = timezone('utc'::text, now())
    where id = p_creed_id and owner_user_id = p_from;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'expected exactly one creed owner row, got %', changed; end if;
end;
$$;

revoke all on function public.transfer_creed_ownership(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.transfer_creed_ownership(uuid, uuid, uuid) to service_role;

create or replace function public.apply_creed_onboarding_action(
  p_creed_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_name text default null,
  p_sections jsonb default '[]'::jsonb,
  p_activity_id text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creed public.creeds%rowtype;
  v_section jsonb;
  v_count integer := 0;
  v_first_section_id text;
begin
  select * into v_creed
  from public.creeds
  where id = p_creed_id
  for update;

  if not found or v_creed.owner_user_id <> p_actor_user_id then
    raise exception 'actor is not the creed owner' using errcode = '42501';
  end if;

  if p_action = 'complete' then
    if p_activity_id is null or p_activity_id = '' then
      raise exception 'activity id is required' using errcode = '22023';
    end if;
    insert into public.creed_activity (
      id, creed_id, user_id, actor_user_id, actor, actor_type,
      summary, status, event_kind
    ) values (
      p_activity_id, p_creed_id, p_actor_user_id, p_actor_user_id, 'You', 'user',
      'Set up the Creed', 'direct', 'edit'
    );
    update public.creeds
    set onboarding_stage = null, updated_at = timezone('utc'::text, now())
    where id = p_creed_id;
    return 1;
  elsif p_action = 'seed-personal' then
    if v_creed.type <> 'personal' or p_name is null or btrim(p_name) = ''
      or char_length(btrim(p_name)) > 80 then
      raise exception 'invalid personal onboarding input' using errcode = '22023';
    end if;
    select section_id into v_first_section_id
    from public.creed_sections
    where creed_id = p_creed_id
    order by position
    limit 1
    for update;
    if v_first_section_id is null then
      raise exception 'starter section not found';
    end if;
    update public.creed_sections
    set payload = jsonb_set(
          payload,
          '{content}',
          coalesce(p_sections -> 0 -> 'content', '""'::jsonb),
          true
        ),
        revision = revision + 1,
        last_edited_by = 'You',
        last_edited_type = 'user',
        last_edited_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    where creed_id = p_creed_id and section_id = v_first_section_id;
    update public.creeds
    set name = btrim(p_name), updated_at = timezone('utc'::text, now())
    where id = p_creed_id;
    return 1;
  elsif p_action in ('seed-shared', 'replace-placeholder') then
    if p_action = 'seed-shared' and v_creed.type <> 'shared' then
      raise exception 'shared seed requires a shared creed' using errcode = '22023';
    end if;
    if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
      raise exception 'sections are required' using errcode = '22023';
    end if;
    delete from public.creed_sections where creed_id = p_creed_id;
    for v_section in select value from jsonb_array_elements(p_sections)
    loop
      insert into public.creed_sections (
        creed_id, user_id, section_id, position, kind, name, accent, payload,
        agent_permission, agent_writable, template, last_edited_by,
        last_edited_type, last_edited_at, revision, created_at, updated_at
      ) values (
        p_creed_id,
        p_actor_user_id,
        v_section ->> 'section_id',
        coalesce((v_section ->> 'position')::integer, v_count),
        coalesce(v_section ->> 'kind', 'rich-text'),
        v_section ->> 'name',
        v_section ->> 'accent',
        coalesce(v_section -> 'payload', '{}'::jsonb),
        coalesce(v_section ->> 'agent_permission', 'propose'),
        coalesce((v_section ->> 'agent_writable')::boolean, true),
        coalesce(v_section ->> 'template', 'freeform'),
        coalesce(v_section ->> 'last_edited_by', 'You'),
        coalesce(v_section ->> 'last_edited_type', 'user'),
        timezone('utc'::text, now()),
        coalesce((v_section ->> 'revision')::integer, 1),
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
      );
      v_count := v_count + 1;
    end loop;
    if p_action = 'seed-shared' then
      update public.creeds
      set name = btrim(p_name), onboarding_stage = 'composing',
          updated_at = timezone('utc'::text, now())
      where id = p_creed_id;
    end if;
    return v_count;
  elsif p_action = 'compose' then
    if jsonb_typeof(p_sections) <> 'array' then
      raise exception 'sections must be an array' using errcode = '22023';
    end if;
    for v_section in select value from jsonb_array_elements(p_sections)
    loop
      update public.creed_sections
      set payload = jsonb_set(payload, '{content}', v_section -> 'content', true),
          revision = revision + 1,
          last_edited_by = 'Your assistant',
          last_edited_type = 'agent',
          last_edited_at = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      where creed_id = p_creed_id
        and section_id = v_section ->> 'section_id';
      if found then v_count := v_count + 1; end if;
    end loop;
    if v_count <> jsonb_array_length(p_sections) then
      raise exception 'one or more onboarding sections were not found';
    end if;
    return v_count;
  end if;

  raise exception 'unknown onboarding action' using errcode = '22023';
end;
$$;

revoke all on function public.apply_creed_onboarding_action(uuid, uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.apply_creed_onboarding_action(uuid, uuid, text, text, jsonb, text)
  to service_role;

comment on function public.apply_creed_onboarding_action(uuid, uuid, text, text, jsonb, text) is
  'Atomically applies an owner-validated onboarding mutation. Service role only.';

create or replace function public.create_owned_creed(
  p_name text,
  p_type text
)
returns table (id uuid, type text, name text, onboarding_stage text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_creed_id uuid;
  v_section_id text;
  v_section_name text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  p_name := btrim(p_name);
  if p_name = '' or char_length(p_name) > 80 then
    raise exception 'invalid creed name' using errcode = '22023';
  end if;
  if p_type not in ('personal', 'shared') then
    raise exception 'invalid creed type' using errcode = '22023';
  end if;

  insert into public.creeds (type, name, owner_user_id, onboarding_stage)
  values (p_type, p_name, v_user_id, null)
  returning creeds.id into v_creed_id;

  insert into public.creed_members (creed_id, user_id, role)
  values (v_creed_id, v_user_id, 'owner');

  v_section_id := case when p_type = 'shared' then 'shared' else 'identity' end;
  v_section_name := case when p_type = 'shared' then 'Shared' else 'Identity' end;

  insert into public.creed_sections (
    user_id,
    section_id,
    position,
    kind,
    name,
    accent,
    payload,
    last_edited_by,
    last_edited_type,
    agent_writable,
    template,
    agent_permission,
    creed_id
  )
  values (
    v_user_id,
    v_section_id,
    0,
    'rich-text',
    v_section_name,
    'identity',
    jsonb_build_object(
      'content', '<p></p>',
      'template', 'identity',
      'agentWritable', true,
      'agentPermission', 'propose'
    ),
    'You',
    'user',
    true,
    'identity',
    'propose',
    v_creed_id
  );

  return query
  select created.id, created.type, created.name, created.onboarding_stage
  from public.creeds as created
  where created.id = v_creed_id;
end;
$$;

revoke all on function public.create_owned_creed(text, text) from public;
revoke all on function public.create_owned_creed(text, text) from anon;
grant execute on function public.create_owned_creed(text, text) to authenticated;

comment on function public.create_owned_creed(text, text) is
  'Atomically creates an owned Creed ready for the file (no additional setup stage).';
