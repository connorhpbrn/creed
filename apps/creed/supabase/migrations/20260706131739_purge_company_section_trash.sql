-- Company no longer has a trash/restore feature. Purge any sections that were
-- already soft-deleted under the short-lived trash implementation, along with
-- section-scoped rows that could otherwise keep deleted content restorable.

create temp table if not exists _company_sections_to_purge (
  creed_id uuid not null,
  section_id text not null,
  primary key (creed_id, section_id)
) on commit drop;

insert into _company_sections_to_purge (creed_id, section_id)
select s.creed_id, s.section_id
from public.creed_sections s
join public.creeds c on c.id = s.creed_id
where c.type = 'company'
  and s.deleted_at is not null
on conflict do nothing;

delete from public.creed_section_versions v
using _company_sections_to_purge p
where v.creed_id = p.creed_id
  and v.section_id = p.section_id;

delete from public.creed_member_section_permissions m
using _company_sections_to_purge p
where m.creed_id = p.creed_id
  and m.section_id = p.section_id;

delete from public.creed_proposals pr
using _company_sections_to_purge p
where pr.creed_id = p.creed_id
  and pr.section_id = p.section_id;

delete from public.creed_activity a
using _company_sections_to_purge p
where a.creed_id = p.creed_id
  and a.section_id = p.section_id;

delete from public.creed_sections s
using _company_sections_to_purge p
where s.creed_id = p.creed_id
  and s.section_id = p.section_id;
