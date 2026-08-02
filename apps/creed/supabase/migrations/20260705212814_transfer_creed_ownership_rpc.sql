-- Atomic ownership transfer for a company Creed.
--
-- Ownership lives in four places that must move together: the outgoing owner's
-- creed_members role (owner -> admin), the incoming owner's role (-> owner), and
-- the owner_user_id columns on creeds and creed_company_billing. Doing these as
-- separate statements from the app risks a partial failure that leaves
-- creed_members and creeds.owner_user_id disagreeing with no safe retry (the old
-- owner is already demoted and can no longer re-run the transfer). A single
-- function body is one transaction, so it all commits or all rolls back.
--
-- Statement order matters for the one-owner-per-creed partial unique index:
-- demote first (0 owners), then promote (1 owner), so the index holds at every
-- step. Service-role only (called via the admin client after an app-level
-- owner check); execute is revoked from client roles.

create or replace function public.transfer_creed_ownership(
  p_creed_id uuid,
  p_from uuid,
  p_to uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.creed_members
    set role = 'admin'
    where creed_id = p_creed_id and user_id = p_from and role = 'owner';

  update public.creed_members
    set role = 'owner'
    where creed_id = p_creed_id and user_id = p_to;

  update public.creeds
    set owner_user_id = p_to, updated_at = now()
    where id = p_creed_id;

  update public.creed_company_billing
    set owner_user_id = p_to, updated_at = now()
    where creed_id = p_creed_id;
end;
$$;

revoke all on function public.transfer_creed_ownership(uuid, uuid, uuid) from public, anon, authenticated;
