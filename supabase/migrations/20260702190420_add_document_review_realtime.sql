-- Let authenticated document pages refresh pending proposals and version
-- summaries without a manual browser refresh. The client still polls as a
-- fallback, but these publication entries make Supabase Realtime push changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'creed_document_proposals'
    ) then
      alter publication supabase_realtime add table public.creed_document_proposals;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'creed_document_versions'
    ) then
      alter publication supabase_realtime add table public.creed_document_versions;
    end if;
  end if;
end $$;
