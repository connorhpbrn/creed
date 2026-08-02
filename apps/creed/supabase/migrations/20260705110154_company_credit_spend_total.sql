-- company_credit_spend_total(creed_id): all-time debit sum for a company Creed,
-- so the company Model-usage card can show "All-time spend" exactly like the
-- personal lifetime card (the personal credit_spend_total is user-scoped and
-- can't read a company pool). Service-role only: it is called via the admin
-- client from getCompanyCreditsState, which already gates on company membership
-- at the route layer. Pure sum, no auth.uid() dependency.

create or replace function public.company_credit_spend_total(p_creed_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select sum(amount_micro_usd)
    from public.creed_credit_transactions
    where creed_id = p_creed_id and type = 'debit'
  ), 0)::bigint;
$$;

revoke all on function public.company_credit_spend_total(uuid) from public, anon, authenticated;
grant execute on function public.company_credit_spend_total(uuid) to service_role;
