-- Tag each AI usage row with the billing mode (credits vs byok) so the
-- estimated-spend chart can scope to the active mode instead of merging both.
-- Existing rows predate credits, so they were all BYOK.
alter table public.creed_ai_usage
  add column if not exists ai_mode text not null default 'byok'
  check (ai_mode in ('credits', 'byok'));
