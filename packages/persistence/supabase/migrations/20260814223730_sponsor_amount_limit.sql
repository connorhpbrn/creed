alter table public.sponsor_donations
  drop constraint sponsor_donations_amount_cents_check;

alter table public.sponsor_donations
  add constraint sponsor_donations_amount_cents_check
  check (amount_cents between 500 and 500000);
