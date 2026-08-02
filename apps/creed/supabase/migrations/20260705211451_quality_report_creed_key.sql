-- Re-key creed_quality_reports by creed_id so a company Creed has ONE shared
-- analysis report (every member reads the same row) and a personal Creed keeps
-- exactly one report (its personal creed). Extracted out of the gated
-- 20260705090000_company_keys_and_rls migration so company analysis can ship
-- without the full PK/RLS batch; that migration's quality-report statements are
-- written drop-then-create and stay safe to apply afterwards.
--
-- DEPLOY ORDERING: this migration applies WITH the release that makes analysis
-- company-aware (the persist path upserts ON CONFLICT (creed_id) with a
-- user_id fallback for exactly this window). Apply it immediately after the code
-- deploys, then drop the fallback in a follow-up.

-- 1. Backfill any null creed_id to the owner's personal creed (defensive; the
--    Batch A column backfill already ran, but the live app may have written new
--    personal rows since).
update public.creed_quality_reports qr
set creed_id = c.id
from public.creeds c
where qr.creed_id is null
  and c.owner_user_id = qr.user_id
  and c.type = 'personal';

alter table public.creed_quality_reports alter column creed_id set not null;

-- 2. Swap the primary key from user_id to creed_id (one report per Creed). Keep
--    user_id as bookkeeping (who last ran the analysis).
alter table public.creed_quality_reports drop constraint if exists creed_quality_reports_pkey;
alter table public.creed_quality_reports add constraint creed_quality_reports_pkey primary key (creed_id);

-- 3. RLS: any member of the Creed may READ its report (personal owners included,
--    since creed_role returns their role on their own creed). Writes stay
--    service-role only - the app persists via the admin client after an
--    app-level owner/admin check, so no write policy is granted.
drop policy if exists "users can manage their creed quality reports" on public.creed_quality_reports;
drop policy if exists "members read quality reports" on public.creed_quality_reports;
create policy "members read quality reports" on public.creed_quality_reports
  for select using (public.creed_role(creed_id) is not null);
