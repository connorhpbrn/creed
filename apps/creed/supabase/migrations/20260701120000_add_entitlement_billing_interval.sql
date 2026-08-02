-- Distinguish a monthly ($12/mo) subscription from a yearly ($99/yr) one.
--
-- Yearly is still billing_mode 'subscription'; the recurring interval is the
-- only thing that tells the two apart, and nothing captured it before. The
-- column is nullable: lifetime purchases and legacy rows have no interval.
--
-- Named 'billing_interval' (not 'interval') because INTERVAL is a reserved SQL
-- keyword and would need quoting everywhere it appears as a column name.

alter table public.creed_entitlements
  add column if not exists billing_interval text
  check (billing_interval is null or billing_interval in ('month', 'year'));

-- Backfill existing subscribers as monthly. Yearly did not exist before this
-- change, so every current billing_mode='subscription' row is a monthly plan.
update public.creed_entitlements
  set billing_interval = 'month'
  where billing_mode = 'subscription' and billing_interval is null;
