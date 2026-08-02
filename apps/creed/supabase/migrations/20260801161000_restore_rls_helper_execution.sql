-- These helpers are referenced by authenticated RLS policies. PostgreSQL
-- checks function EXECUTE privileges while evaluating those policies, so
-- revoking the role breaks normal authenticated reads. Keep them executable;
-- their results are already scoped to auth.uid().
grant execute on function public.creed_role(uuid) to authenticated;
grant execute on function public.creed_section_permission(uuid, text) to authenticated;
grant execute on function public.creed_type(uuid) to authenticated;
