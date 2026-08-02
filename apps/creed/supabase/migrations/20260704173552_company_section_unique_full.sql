-- The (creed_id, section_id) unique index from 20260704090400 was partial
-- (WHERE creed_id IS NOT NULL). PostgREST / supabase-js emit
-- ON CONFLICT (creed_id, section_id) with NO WHERE predicate, so Postgres
-- cannot match a partial index (SQLSTATE 42P10) and every company section
-- upsert - the onboarding seed and every live section edit - fails.
--
-- Recreate it non-partial so ON CONFLICT (creed_id, section_id) resolves.
-- Personal saves are unaffected: the old personal persist path leaves creed_id
-- NULL, and NULLs are distinct in a unique index, so personal rows never
-- collide. Non-null rows were already unique under the partial index, so this
-- rebuilds cleanly.
drop index if exists public.creed_sections_creed_section_unique;

create unique index if not exists creed_sections_creed_section_unique
  on public.creed_sections (creed_id, section_id);
