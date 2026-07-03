alter table public.creed_document_versions
  add column if not exists change_hunks jsonb not null default '[]'::jsonb;

update public.creed_document_versions
set change_hunks = '[]'::jsonb
where change_hunks is null;
