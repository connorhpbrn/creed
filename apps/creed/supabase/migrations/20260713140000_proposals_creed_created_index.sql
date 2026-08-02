-- The proposals fan-out (every authed render, the state poll, and agent reads)
-- runs `.eq(creed_id).order(created_at desc).limit(...)`. The only creed-scoped
-- index is (creed_id, status), which can't serve the created_at ordering, so
-- Postgres index-scans on creed_id then sorts in memory. Every sibling table on
-- the same fan-out already has its matching (creed_id, <sort> desc) index; give
-- proposals the same.
create index if not exists creed_proposals_creed_created_idx
  on public.creed_proposals (creed_id, created_at desc);

-- Nothing filters proposals by user_id anymore (all reads are creed-scoped
-- post company_creed_id_columns); drop the now-unused legacy index.
drop index if exists public.creed_proposals_user_created_idx;
