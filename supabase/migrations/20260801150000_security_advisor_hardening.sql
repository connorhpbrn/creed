-- Remove direct PostgREST access to internal RLS helper functions. Policies
-- continue to evaluate these expressions as the table owner.
revoke execute on function public.creed_role(uuid) from authenticated;
revoke execute on function public.creed_section_permission(uuid, text) from authenticated;
revoke execute on function public.creed_type(uuid) from authenticated;

-- The bucket itself is public, so object delivery remains available through
-- public object URLs. This policy unnecessarily exposed bucket-wide listing.
drop policy if exists "public read creed avatars" on storage.objects;
