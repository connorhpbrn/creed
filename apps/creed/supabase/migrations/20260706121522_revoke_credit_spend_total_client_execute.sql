-- credit_spend_total is now called only through trusted server routes with the
-- service-role client. Remove it from the authenticated RPC surface.
revoke all on function public.credit_spend_total(uuid) from public, anon, authenticated;
grant execute on function public.credit_spend_total(uuid) to service_role;
