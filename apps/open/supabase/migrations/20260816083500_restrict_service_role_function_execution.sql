-- Supabase may retain explicit EXECUTE grants for API roles on functions even
-- after PUBLIC privileges are revoked. These functions are documented and used
-- by Creed as service-role-only entry points.

REVOKE ALL ON FUNCTION public.apply_creed_onboarding_action(uuid, uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_owned_creed(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.creed_schema_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_oauth_client_registration() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_mcp_read(uuid, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_mcp_read_for_creed(uuid, uuid, text, date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_creed_onboarding_action(uuid, uuid, text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_owned_creed(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.creed_schema_version() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_oauth_client_registration() TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_mcp_read(uuid, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_mcp_read_for_creed(uuid, uuid, text, date) TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
