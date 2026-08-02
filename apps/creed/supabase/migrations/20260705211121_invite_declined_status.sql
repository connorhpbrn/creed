-- Add a distinct `declined` status to creed_invites.
--
-- Previously a user declining an invite reused the `revoked` status (which an
-- owner/admin sets when they cancel a pending invite). Both free the seat (only
-- `pending` invites count toward capacity), but collapsing them loses the audit
-- distinction between "the invitee said no" and "an admin pulled it". Adding
-- `declined` keeps seat math identical while making the activity/audit trail
-- honest.
--
-- Idempotent: drop whatever status check constraint exists on the table (its
-- inline name can vary by environment), then add the widened one by a stable
-- name. Safe to re-run.

do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.creed_invites'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.creed_invites drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.creed_invites
  add constraint creed_invites_status_check
  check (status = any (array['pending', 'accepted', 'revoked', 'expired', 'declined']));
