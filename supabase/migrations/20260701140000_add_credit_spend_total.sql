-- All-time credits spend for a user, summed server-side.
--
-- PostgREST aggregate functions are disabled on this project, so the settings
-- "all-time spend" card reads this function instead of a client-side sum (which
-- the 1000-row page cap would eventually undercount). Scoped to the caller via
-- auth.uid() and granted to authenticated, so a user can only read their own
-- total.
create or replace function public.credit_spend_total()
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(amount_micro_usd), 0)::bigint
  from public.creed_credit_transactions
  where user_id = auth.uid() and type = 'debit';
$$;

revoke all on function public.credit_spend_total() from public;
revoke all on function public.credit_spend_total() from anon;
grant execute on function public.credit_spend_total() to authenticated;
grant execute on function public.credit_spend_total() to service_role;
