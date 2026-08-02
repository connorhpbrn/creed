-- One-time welcome pop-up tracking for creed_entitlements.
--
-- `welcomed_at` records when the user last dismissed the in-app welcome
-- pop-up (the six-slide tour shown on first entry after paying + onboarding).
-- The pop-up shows when welcomed_at IS NULL OR welcomed_at < paid_at, so a
-- user who cancels and later re-buys (which moves paid_at forward) sees it
-- again - it is, psychologically, part of the post-purchase onboarding.
--
-- Nullable with no default: existing owners have NULL and would see the tour
-- once on their next visit. To suppress it for the current cohort instead,
-- backfill with `update public.creed_entitlements set welcomed_at = now();`
--
-- Writes go through the service-role admin client (the same path as every
-- other entitlement write), so no RLS update policy is added here - the
-- table intentionally exposes only "Read own entitlement" over RLS.

alter table public.creed_entitlements
  add column if not exists welcomed_at timestamptz;
