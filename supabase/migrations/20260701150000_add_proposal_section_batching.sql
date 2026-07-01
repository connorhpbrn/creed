-- Per-section document proposals (Model S).
--
-- A single "propose" edit to a shared document is now split into one proposal
-- row per changed Markdown section, so a reviewer can accept or reject each
-- section independently (matching the personal-Creed per-section review UX, but
-- for the document workspace's dynamic, arbitrarily nested sections).
--
-- The sibling rows produced by one edit share a `batch_id` so the UI can group
-- them under a single summary ("N sections" by one author at one time). The
-- existing (unused) `section_id` column identifies which section each row
-- targets; the section body + diff live in the existing `draft` jsonb.
--
-- Both columns are nullable so legacy whole-content proposals (draft.kind =
-- 'document-content', no batch, no section) keep working: they map to a group
-- of one. Writes go through the service-role client, so only the existing
-- SELECT policy is needed; no new grants.

alter table public.creed_document_proposals
  add column if not exists batch_id uuid;

-- Group a batch of sibling section proposals for one document, newest first.
create index if not exists creed_document_proposals_batch_idx
  on public.creed_document_proposals (document_id, batch_id, created_at);

comment on column public.creed_document_proposals.batch_id is
  'Groups the per-section proposal rows produced by one document edit so the review UI can show them under a single summary. Null for legacy whole-content proposals.';

comment on column public.creed_document_proposals.section_id is
  'Stable section key (from lib/document-section-diff) this proposal targets, or null for a legacy whole-content proposal.';

-- COMMENT ON is DDL, so it fires Supabase's pgrst_ddl_watch trigger and reloads
-- the PostgREST schema cache; belt-and-braces explicit reload as well.
notify pgrst, 'reload schema';
