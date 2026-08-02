-- Per-section agent permission. Replaces the global propose-vs-direct toggle as
-- the source of truth for what an agent may do to each section:
--   hidden     - excluded from the agent's read payload entirely
--   read-only  - visible to the agent but not editable
--   propose    - agent must submit a proposal (user approves)
--   direct     - agent edits immediately
--
-- `agent_writable` (the dead boolean column) is left in place; the app now reads
-- this column instead. Non-destructive: existing rows are backfilled from the
-- owner's current require_approval (the only signal that exists today).
alter table public.creed_sections
  add column if not exists agent_permission text not null default 'propose';

update public.creed_sections s
set agent_permission = case when t.require_approval then 'propose' else 'direct' end
from public.creed_tokens t
where t.user_id = s.user_id;

alter table public.creed_sections
  drop constraint if exists creed_sections_agent_permission_check;
alter table public.creed_sections
  add constraint creed_sections_agent_permission_check
  check (agent_permission in ('hidden', 'read-only', 'propose', 'direct'));
