create table if not exists public.creed_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists creed_audit_log_user_id_created_at_idx
  on public.creed_audit_log (user_id, created_at desc);

create index if not exists creed_audit_log_action_created_at_idx
  on public.creed_audit_log (action, created_at desc);

alter table public.creed_audit_log enable row level security;

-- Users can read their own audit entries; writes are server-side only via the
-- admin client, so no insert/update/delete policies are exposed.
create policy "creed_audit_log_select_own"
  on public.creed_audit_log
  for select
  using (auth.uid() = user_id);
