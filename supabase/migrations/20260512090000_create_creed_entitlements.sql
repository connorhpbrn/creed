-- Stripe one-time payment entitlements.
--
-- One row per user, written when a Stripe Checkout Session for the Hosted
-- plan completes. Keyed by Supabase user_id (not email) because we sign the
-- user in BEFORE sending them to Stripe, so the entitlement attaches to a
-- real account from the start — no email-matching ambiguity.
--
-- stripe_session_id is UNIQUE so webhook retries (and the success-page
-- belt-and-braces upsert) are idempotent: a second insert with the same
-- session id no-ops via `on conflict do update`.

create table public.creed_entitlements (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  email                    text not null,
  stripe_customer_id       text,
  stripe_session_id        text not null unique,
  stripe_payment_intent_id text,
  stripe_price_id          text not null,
  amount_cents             integer not null,
  currency                 text not null default 'usd',
  status                   text not null default 'paid' check (status in ('paid', 'refunded')),
  paid_at                  timestamptz not null default timezone('utc'::text, now()),
  updated_at               timestamptz not null default timezone('utc'::text, now())
);

alter table public.creed_entitlements enable row level security;

-- Users can read their OWN entitlement row so server components can check
-- paid status via the user's session client (no admin client needed for
-- reads). No insert/update via RLS — only the service role writes, which
-- happens in the webhook + success-page upsert paths.
create policy "Read own entitlement"
  on public.creed_entitlements
  for select
  using (auth.uid() = user_id);
