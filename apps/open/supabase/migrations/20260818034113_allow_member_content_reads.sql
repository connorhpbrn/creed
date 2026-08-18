-- Members must be able to select content rows before Postgres permits an
-- update or upsert through RLS. The membership predicate matches Open's
-- existing read boundary for other Creed-scoped resources.

create policy "members read sections"
on public.creed_sections
for select
to authenticated
using (private.creed_role(creed_id) is not null);

comment on policy "members read sections" on public.creed_sections is
  'Allows authenticated Creed members to load sections and satisfy the SELECT requirement for updates and upserts.';

create policy "members read proposals"
on public.creed_proposals
for select
to authenticated
using (private.creed_role(creed_id) is not null);

comment on policy "members read proposals" on public.creed_proposals is
  'Allows authenticated Creed members to load proposals and satisfy the SELECT requirement for updates.';

create policy "members read activity"
on public.creed_activity
for select
to authenticated
using (private.creed_role(creed_id) is not null);

comment on policy "members read activity" on public.creed_activity is
  'Allows authenticated Creed members to load activity and satisfy the SELECT requirement for updates.';
