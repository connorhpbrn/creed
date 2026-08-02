-- One-time company welcome tour tracking for creed_company_billing.
--
-- A company owner has no personal creed_entitlements row driving the first-run
-- tour, so their company tour (the amber "invite your team" variant) is gated
-- on the company billing row instead. `welcomed_at` records when the owner last
-- dismissed it. Same show rule as the personal tour: show when welcomed_at IS
-- NULL OR welcomed_at < paid_at, so a cancel-and-rebuy counts as fresh
-- onboarding.
--
-- Nullable with no default: existing company owners have NULL and would see the
-- tour once on their next visit into the company Creed. To suppress it for the
-- current cohort instead, backfill with
--   `update public.creed_company_billing set welcomed_at = now();`
--
-- Writes go through the service-role admin client (the same path as every other
-- company billing write), so no RLS update policy is added here - the table
-- intentionally exposes only owner-read over RLS.

alter table public.creed_company_billing
  add column if not exists welcomed_at timestamptz;
