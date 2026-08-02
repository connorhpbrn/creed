-- Ledger of one-time (lifetime) extra-seat purchases, used purely for
-- idempotency: the Stripe Checkout session id is the primary key, so a webhook
-- retry that re-delivers the same completed session can't add the seats twice.
-- Written only by the service-role client in the webhook; never read from the
-- browser. RLS is enabled with no policies so only the service role (which
-- bypasses RLS) can touch it.

create table if not exists public.creed_seat_purchases (
  stripe_session_id text primary key,
  creed_id          uuid not null references public.creeds(id) on delete cascade,
  seats             integer not null check (seats > 0),
  created_at        timestamptz not null default timezone('utc'::text, now())
);

create index if not exists creed_seat_purchases_creed_id_idx
  on public.creed_seat_purchases (creed_id);

alter table public.creed_seat_purchases enable row level security;
