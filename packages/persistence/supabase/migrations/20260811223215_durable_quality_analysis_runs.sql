create table public.creed_quality_runs (
  id uuid primary key default gen_random_uuid(),
  creed_id uuid not null references public.creeds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shared_creed_id uuid references public.creeds(id) on delete cascade,
  request_key text not null,
  content_hash text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  request_sections jsonb,
  target_section_ids jsonb,
  force boolean not null default false,
  error_message text,
  credit_balance_usd numeric(12, 6),
  created_at timestamptz not null default timezone('utc'::text, now()),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint creed_quality_runs_shared_scope_check
    check (shared_creed_id is null or shared_creed_id = creed_id),
  constraint creed_quality_runs_terminal_shape_check
    check (
      (status in ('queued', 'running') and request_sections is not null and completed_at is null)
      or
      (status in ('completed', 'failed') and request_sections is null and completed_at is not null)
    )
);

create unique index creed_quality_runs_one_active_request_idx
  on public.creed_quality_runs (creed_id, request_key)
  where status in ('queued', 'running');

create unique index creed_quality_runs_one_running_per_creed_idx
  on public.creed_quality_runs (creed_id)
  where status = 'running';

create index creed_quality_runs_creed_created_idx
  on public.creed_quality_runs (creed_id, created_at desc);

alter table public.creed_quality_runs enable row level security;

-- Analysis inputs can contain the whole Creed, including Shared sections a
-- member cannot read. Only authenticated application routes may expose the
-- bounded status shape after validating live membership.
revoke all on table public.creed_quality_runs from anon, authenticated;
grant all on table public.creed_quality_runs to service_role;
