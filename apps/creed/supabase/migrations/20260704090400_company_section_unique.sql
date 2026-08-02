-- Company plan hardening add-on (SAFE TO APPLY NOW - additive).
--
-- A partial unique index on (creed_id, section_id) where creed_id is not null.
-- This lets the company section write path upsert ON CONFLICT (creed_id,
-- section_id) under Batch A, so company Creeds are fully functional without the
-- gated Batch B PK swap. It also enforces the real integrity rule for a shared
-- Creed: one section per (Creed, section_id), regardless of which member last
-- wrote it.
--
-- Personal rows written by the current app leave creed_id NULL (the old persist
-- path does not set it); NULLs are excluded here, so this never conflicts with
-- personal saves. Existing personal rows that were backfilled a creed_id are
-- already unique on (creed_id, section_id) (one user = one personal Creed), so
-- the index builds cleanly.
create unique index if not exists creed_sections_creed_section_unique
  on public.creed_sections (creed_id, section_id)
  where creed_id is not null;
