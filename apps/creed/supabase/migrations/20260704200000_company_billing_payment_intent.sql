-- Company billing: store the paying PaymentIntent (SAFE TO APPLY NOW - additive).
--
-- A company Lifetime purchase is a one-time Checkout whose charge.refunded event
-- carries a payment_intent, not the checkout session id. Without the PI on the
-- billing row there is nothing to match a refund back to the company, so a
-- refunded Lifetime company would keep full access forever. Recording the PI
-- (and indexing it) lets the refund handler resolve + freeze the right company.
alter table public.creed_company_billing
  add column if not exists stripe_payment_intent_id text;

create index if not exists creed_company_billing_payment_intent_idx
  on public.creed_company_billing (stripe_payment_intent_id);
