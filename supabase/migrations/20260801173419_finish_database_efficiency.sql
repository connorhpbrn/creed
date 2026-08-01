-- Finish the database-efficiency audit with one batched reorder primitive and
-- the only missing foreign-key index reported by the live advisor.

create index if not exists creed_proposals_user_id_idx
  on public.creed_proposals (user_id);

create or replace function public.update_creed_section_positions(
  p_creed_id uuid,
  p_section_ids text[],
  p_updated_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_creed_id is null or p_section_ids is null then
    raise exception 'creed id and section ids are required';
  end if;

  if cardinality(p_section_ids) <> (
    select count(distinct section_id)
    from unnest(p_section_ids) as section_id
  ) then
    raise exception 'section ids must be unique';
  end if;

  if cardinality(p_section_ids) <> (
    select count(*)
    from public.creed_sections
    where creed_id = p_creed_id
      and deleted_at is null
  ) then
    raise exception 'section order must include every active section';
  end if;

  update public.creed_sections as section
  set position = ordered.position,
      updated_at = p_updated_at
  from (
    select section_id, (ordinality - 1)::integer as position
    from unnest(p_section_ids) with ordinality as input(section_id, ordinality)
  ) as ordered
  where section.creed_id = p_creed_id
    and section.section_id = ordered.section_id
    and section.deleted_at is null;

  get diagnostics v_updated = row_count;
  if v_updated <> cardinality(p_section_ids) then
    raise exception 'section order did not match the active Creed sections';
  end if;
  return v_updated;
end;
$$;

revoke all on function public.update_creed_section_positions(uuid, text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.update_creed_section_positions(uuid, text[], timestamptz)
  to service_role;
