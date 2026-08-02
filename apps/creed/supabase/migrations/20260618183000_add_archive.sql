-- Archive support.
--
-- Sections can be archived (soft-removed from the live file, the agent read
-- payload, quality scoring, and the markdown export) without losing their
-- content. Archived sections are restorable from Settings -> Archived.
--
-- A section's archived state is a nullable timestamp (non-null = archived).

alter table public.creed_sections
  add column if not exists archived_at timestamptz null;
