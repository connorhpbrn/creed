-- Advisor cleanup after the company creed_id keying migration.
--
-- The keying migration intentionally kept broad personal-owner FOR ALL policies
-- for safety. Once verified, split them so SELECT has only one permissive policy
-- per table, and remove duplicate indexes that are now covered by primary keys.

-- Duplicate indexes now covered by primary keys.
drop index if exists public.creed_sections_creed_section_unique;
drop index if exists public.creed_credits_creed_id_key;

-- Remove the earlier credit-transaction select policy. The canonical one is
-- "members read credit transactions" from the keying migration.
drop policy if exists "members read creed transactions" on public.creed_credit_transactions;

-- Avoid SELECT overlap: the read policy handles reads for every member, while
-- personal owners get explicit write policies for their personal Creed.
drop policy if exists "personal owner writes sections" on public.creed_sections;
create policy "personal owner inserts sections"
  on public.creed_sections
  for insert
  to authenticated
  with check (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');
create policy "personal owner updates sections"
  on public.creed_sections
  for update
  to authenticated
  using (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner')
  with check (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');
create policy "personal owner deletes sections"
  on public.creed_sections
  for delete
  to authenticated
  using (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');

drop policy if exists "personal owner writes proposals" on public.creed_proposals;
create policy "personal owner inserts proposals"
  on public.creed_proposals
  for insert
  to authenticated
  with check (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');
create policy "personal owner updates proposals"
  on public.creed_proposals
  for update
  to authenticated
  using (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner')
  with check (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');
create policy "personal owner deletes proposals"
  on public.creed_proposals
  for delete
  to authenticated
  using (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');

drop policy if exists "personal owner writes activity" on public.creed_activity;
create policy "personal owner inserts activity"
  on public.creed_activity
  for insert
  to authenticated
  with check (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');
create policy "personal owner updates activity"
  on public.creed_activity
  for update
  to authenticated
  using (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner')
  with check (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');
create policy "personal owner deletes activity"
  on public.creed_activity
  for delete
  to authenticated
  using (public.creed_type(creed_id) = 'personal' and public.creed_role(creed_id) = 'owner');
