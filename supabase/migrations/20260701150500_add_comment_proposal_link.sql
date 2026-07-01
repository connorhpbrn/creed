-- Comments on proposals (Model S).
--
-- A shared-document comment can now be anchored to a specific pending proposal
-- (creed_document_proposals) instead of, or in addition to, an editor text
-- range. This powers the review thread that hangs off a proposal row.
--
-- When the proposal is accepted or rejected, any still-open comments anchored to
-- it are auto-resolved (the review conversation is finished once the decision is
-- made), which is done server-side in lib/document-editing.
--
-- Nullable so existing range-anchored comments (proposal_id null) are unchanged.
-- On proposal delete we null the link rather than deleting the comment, so the
-- conversation survives even if the proposal row is later removed. Writes go
-- through the service-role client, so the existing SELECT policy is sufficient.

alter table public.creed_document_comments
  add column if not exists proposal_id uuid
    references public.creed_document_proposals(id) on delete set null;

-- Fetch a proposal's comment thread cheaply, oldest first.
create index if not exists creed_document_comments_proposal_idx
  on public.creed_document_comments (document_id, proposal_id, created_at);

comment on column public.creed_document_comments.proposal_id is
  'The proposal this comment is anchored to (a comment on a proposal), or null for a range-anchored / general document comment. Open comments on a proposal are auto-resolved when the proposal is accepted or rejected.';

-- COMMENT ON is DDL, so it fires Supabase's pgrst_ddl_watch trigger and reloads
-- the PostgREST schema cache; belt-and-braces explicit reload as well.
notify pgrst, 'reload schema';
