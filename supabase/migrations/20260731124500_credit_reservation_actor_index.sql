create index if not exists creed_credit_reservations_spent_by_idx
  on public.creed_credit_reservations (spent_by_user_id)
  where spent_by_user_id is not null;
