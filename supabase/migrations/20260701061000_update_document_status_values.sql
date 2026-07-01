-- Move the shared-document status workflow to:
--   backlog → planning → in-progress → review → done
-- (replacing not-started / blocked / ready-for-review).
--
-- Drop the old CHECK first, remap existing rows, reset the default, then
-- re-add the CHECK with the new value set. Idempotent + forward-only.

alter table public.creed_documents
  drop constraint if exists creed_documents_status_check;

update public.creed_documents
  set status = case status
    when 'not-started' then 'backlog'
    when 'blocked' then 'planning'
    when 'ready-for-review' then 'review'
    else status
  end
  where status in ('not-started', 'blocked', 'ready-for-review');

alter table public.creed_documents
  alter column status set default 'backlog';

alter table public.creed_documents
  add constraint creed_documents_status_check
  check (status in ('backlog', 'planning', 'in-progress', 'review', 'done'));
