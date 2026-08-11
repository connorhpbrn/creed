create table if not exists public.creed_installation (
  singleton boolean primary key default true check (singleton),
  owner_user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creed_installation enable row level security;
revoke all on table public.creed_installation from anon, authenticated;
grant select, insert, update on table public.creed_installation to service_role;

-- Preserve the hidden owner created by beta Open builds without making the
-- application scan Auth users at runtime. Auth emails are unique in Supabase.
insert into public.creed_installation (singleton, owner_user_id)
select true, id
from auth.users
where email = 'owner@creed.open.invalid'
order by created_at asc
limit 1
on conflict (singleton) do nothing;

comment on table public.creed_installation is
  'Private single-owner identity for a self-hosted Creed Open installation. Service-role access only.';

create or replace function public.creed_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(version), '')::text
  from supabase_migrations.schema_migrations;
$$;

revoke all on function public.creed_schema_version() from public, anon, authenticated;
grant execute on function public.creed_schema_version() to service_role;

comment on function public.creed_schema_version() is
  'Returns the newest applied Supabase migration to the service role for installation readiness checks.';
