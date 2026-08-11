-- New Creeds open straight into the file. First-run onboarding is only for
-- brand-new accounts; additional Creeds must not carry a setup stage that
-- forces a hard navigation flash on switch.
create or replace function public.create_owned_creed(
  p_name text,
  p_type text
)
returns table (id uuid, type text, name text, onboarding_stage text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_creed_id uuid;
  v_section_id text;
  v_section_name text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  p_name := btrim(p_name);
  if p_name = '' or char_length(p_name) > 80 then
    raise exception 'invalid creed name' using errcode = '22023';
  end if;
  if p_type not in ('personal', 'shared') then
    raise exception 'invalid creed type' using errcode = '22023';
  end if;

  insert into public.creeds (type, name, owner_user_id, onboarding_stage)
  values (p_type, p_name, v_user_id, null)
  returning creeds.id into v_creed_id;

  insert into public.creed_members (creed_id, user_id, role)
  values (v_creed_id, v_user_id, 'owner');

  v_section_id := case when p_type = 'shared' then 'shared' else 'identity' end;
  v_section_name := case when p_type = 'shared' then 'Shared' else 'Identity' end;

  insert into public.creed_sections (
    user_id,
    section_id,
    position,
    kind,
    name,
    accent,
    payload,
    last_edited_by,
    last_edited_type,
    agent_writable,
    template,
    agent_permission,
    creed_id
  )
  values (
    v_user_id,
    v_section_id,
    0,
    'rich-text',
    v_section_name,
    'identity',
    jsonb_build_object(
      'content', '<p></p>',
      'template', 'identity',
      'agentWritable', true,
      'agentPermission', 'propose'
    ),
    'You',
    'user',
    true,
    'identity',
    'propose',
    v_creed_id
  );

  return query
  select created.id, created.type, created.name, created.onboarding_stage
  from public.creeds as created
  where created.id = v_creed_id;
end;
$$;

comment on function public.create_owned_creed(text, text) is
  'Atomically creates an owned Creed ready for the file (no additional setup stage).';

-- Clear leftover setup stages from Creeds created before this change.
update public.creeds
set onboarding_stage = null,
    updated_at = timezone('utc'::text, now())
where onboarding_stage = 'additional';
