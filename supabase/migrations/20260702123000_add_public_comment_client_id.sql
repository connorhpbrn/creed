alter table public.creed_document_comments
  add column if not exists public_author_client_id text;

create index if not exists creed_document_comments_public_author_client_idx
  on public.creed_document_comments (document_id, public_author_client_id)
  where public_author_client_id is not null;
