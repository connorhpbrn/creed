-- Company GitHub connection (SAFE TO APPLY NOW - additive, backward compatible).
--
-- A team's GitHub connection is SEPARATE from any member's personal GitHub. It
-- is authorized once by an owner/admin through a dedicated GitHub OAuth App
-- (never Supabase identity linking, which is one-GitHub-per-user), and the
-- resulting user access token is stored here - encrypted at rest, keyed by
-- creed_id, team-wide. Company pushes/status/repo listing run on THIS token, so
-- the team can point at an org repo that no single member owns, and a member's
-- personal GitHub is never used for team version control.
--
-- Mirrors the personal creed_integrations columns (encrypted_access_token /
-- encrypted_refresh_token / token_expires_at / provider_login) so the same
-- decrypt + refresh code shapes apply. connected_by records which manager
-- authorized it (for the activity log); the token itself is team-scoped.
--
-- RLS: written and read exclusively through server routes on the service-role
-- client after an app-level owner/admin check (the Batch-A pattern for every
-- company table). No client policies: the token must never be selectable by a
-- session client, and connection STATUS is surfaced to managers through the
-- company state loader (admin client, owner/admin only), never the raw row.

create table if not exists public.creed_company_github_integration (
  creed_id                uuid primary key references public.creeds(id) on delete cascade,
  provider                text not null default 'github',
  status                  text not null default 'not-connected'
    check (status in ('connected', 'not-connected', 'disconnected')),
  provider_account_id     text,
  provider_login          text,
  encrypted_access_token  text,
  encrypted_refresh_token text,
  token_expires_at        timestamptz,
  connected_by            uuid,
  created_at              timestamptz not null default timezone('utc'::text, now()),
  updated_at              timestamptz not null default timezone('utc'::text, now())
);

alter table public.creed_company_github_integration enable row level security;
-- No client policies: the encrypted token is service-role only. Connection
-- status reaches managers through the company state loader, not this table.
