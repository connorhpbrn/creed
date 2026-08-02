-- Company contact email (SAFE TO APPLY NOW - additive, backward compatible).
--
-- A company Creed's shared contact email, set by the owner/admin in Settings ->
-- General. Nullable and only meaningful for company Creeds; personal Creeds
-- ignore the column. Written through the company general route on the service
-- role after an app-level owner/admin check (the Batch-A company pattern).
alter table public.creeds
  add column if not exists company_email text;
