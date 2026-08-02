-- Lock down increment_mcp_read. As a SECURITY DEFINER function in the public
-- schema it is exposed over PostgREST RPC and defaults to EXECUTE for PUBLIC,
-- which would let any authenticated user forge read counts for an arbitrary
-- p_user_id. The only legitimate caller is the service-role admin client in
-- recordMcpCredentialUsage, so restrict execution to service_role.
revoke all on function public.increment_mcp_read(uuid, text, date) from public;
revoke all on function public.increment_mcp_read(uuid, text, date) from anon;
revoke all on function public.increment_mcp_read(uuid, text, date) from authenticated;
grant execute on function public.increment_mcp_read(uuid, text, date) to service_role;
