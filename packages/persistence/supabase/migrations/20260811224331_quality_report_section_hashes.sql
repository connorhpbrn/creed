alter table public.creed_quality_reports
  add column if not exists section_hashes jsonb not null default '{}'::jsonb;
