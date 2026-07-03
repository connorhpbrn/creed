-- Align already-migrated Supabase projects with the clean hunk proposal model.
-- Older environments may have applied the original section/batch proposal
-- version of 20260701120000 before the branch switched to document hunks.

alter table public.creed_document_proposals
  add column if not exists family_id uuid,
  add column if not exists hunk_index integer,
  add column if not exists classification text,
  add column if not exists conflict_status text;

update public.creed_document_proposals
set
  family_id = coalesce(family_id, batch_id, gen_random_uuid()),
  hunk_index = coalesce(hunk_index, 0),
  classification = coalesce(classification, ''),
  conflict_status = coalesce(conflict_status, 'clean');

-- Clean restart for proposals: old section/batch proposal drafts are not read
-- by the hunk editor and should not be surfaced.
delete from public.creed_document_proposals
where draft ->> 'kind' is distinct from 'document-hunk';

alter table public.creed_document_proposals
  alter column family_id set not null,
  alter column hunk_index set not null,
  alter column classification set not null,
  alter column classification set default '',
  alter column conflict_status set not null,
  alter column conflict_status set default 'clean';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_proposals_conflict_status_check'
      and conrelid = 'public.creed_document_proposals'::regclass
  ) then
    alter table public.creed_document_proposals
      add constraint creed_document_proposals_conflict_status_check
      check (conflict_status in ('clean', 'conflict', 'resolved'));
  end if;
end $$;

drop index if exists public.creed_document_proposals_batch_idx;

create index if not exists creed_document_proposals_family_idx
  on public.creed_document_proposals (document_id, family_id, hunk_index, created_at);

create index if not exists creed_document_proposals_conflict_idx
  on public.creed_document_proposals (document_id, status, conflict_status, created_at desc);

alter table public.creed_document_proposals
  drop column if exists section_id,
  drop column if exists batch_id;
