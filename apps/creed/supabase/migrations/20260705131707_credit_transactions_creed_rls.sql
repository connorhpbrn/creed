-- Finish the creed-centric keying of the credit ledger. The unified wallet RPCs
-- (debit_credits / grant_allowance / credit_topup) write creed_id +
-- spent_by_user_id and NOT user_id, but creed_credit_transactions.user_id was
-- still NOT NULL (a companion migration that was meant to relax it never landed),
-- so every debit/top-up/fresh-grant failed the not-null constraint. And its RLS
-- was user_id-based, which would hide the (now user_id-less) rows from a member's
-- own ledger. Fix both: creed_id becomes the key, user_id optional, RLS by
-- membership (matching creed_sections / creed_activity / creed_proposals).

-- 1. Backfill the few ledger rows still missing creed_id, from the owner's
--    personal Creed (all are backfillable; none have both keys null).
update public.creed_credit_transactions t
  set creed_id = c.id
  from public.creeds c
  where t.creed_id is null and t.user_id is not null
    and c.owner_user_id = t.user_id and c.type = 'personal';

-- 2. creed_id is the ledger key now; user_id is optional (spend attribution lives
--    in spent_by_user_id).
alter table public.creed_credit_transactions alter column creed_id set not null;
alter table public.creed_credit_transactions alter column user_id drop not null;

-- 3. Members read their Creed's ledger by creed_id (personal: their own Creed;
--    company: the shared Creed). Company non-owner stripping stays an app-layer
--    concern (the route blanks the ledger for non-owners), same as before.
drop policy if exists "Read own credit transactions" on public.creed_credit_transactions;
create policy "members read creed transactions"
  on public.creed_credit_transactions
  for select
  using (public.creed_role(creed_id) is not null);
