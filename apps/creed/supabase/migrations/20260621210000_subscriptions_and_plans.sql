-- Subscriptions + plan tiers for creed_entitlements.
--
-- The product moves from a single one-time purchase to tiered plans
-- (personal/company), each billable as a recurring subscription OR a
-- one-time lifetime purchase. Access is granted when a lifetime row is
-- `paid`, or a subscription row is active/trialing/past_due.
--
-- Existing rows were all one-time Hosted purchases, so they backfill to
-- plan='personal', billing_mode='lifetime' and keep their 'paid' status -
-- grandfathering every current owner into lifetime ownership.

alter table public.creed_entitlements
  add column if not exists plan text not null default 'personal'
    check (plan in ('personal', 'company')),
  add column if not exists billing_mode text not null default 'lifetime'
    check (billing_mode in ('subscription', 'lifetime')),
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

-- Broaden the status check to cover subscription lifecycle states. Drop the
-- old two-value constraint first (name from the original create migration).
alter table public.creed_entitlements
  drop constraint if exists creed_entitlements_status_check;

alter table public.creed_entitlements
  add constraint creed_entitlements_status_check
  check (status in ('paid', 'refunded', 'active', 'trialing', 'past_due', 'canceled', 'incomplete'));

-- One entitlement row maps to at most one Stripe subscription. Partial unique
-- index so the many existing NULLs (lifetime rows) don't collide.
create unique index if not exists creed_entitlements_subscription_id_key
  on public.creed_entitlements (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Subscription webhooks resolve the owning row by customer id when the
-- metadata user id is absent; index it for that lookup.
create index if not exists creed_entitlements_customer_id_idx
  on public.creed_entitlements (stripe_customer_id)
  where stripe_customer_id is not null;
