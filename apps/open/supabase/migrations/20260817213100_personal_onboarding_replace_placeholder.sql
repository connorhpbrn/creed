-- Personal onboarding persists the starter sections with replace-placeholder.
-- Open's baseline RPC never implemented that action; Cloud's did. Without it,
-- POST /api/app/claim creates the Creed row then fails with unknown action.

create or replace function public.apply_creed_onboarding_action(
  p_creed_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_name text default null,
  p_sections jsonb default '[]'::jsonb,
  p_activity_id text default null
) returns integer
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_creed public.creeds%rowtype;
  v_section jsonb;
  v_count integer := 0;
  v_first_section_id text;
begin
  select * into v_creed
  from public.creeds
  where id = p_creed_id
  for update;

  if not found or v_creed.owner_user_id <> p_actor_user_id then
    raise exception 'actor is not the creed owner' using errcode = '42501';
  end if;

  if p_action = 'complete' then
    if p_activity_id is null or p_activity_id = '' then
      raise exception 'activity id is required' using errcode = '22023';
    end if;
    insert into public.creed_activity (
      id, creed_id, user_id, actor_user_id, actor, actor_type,
      summary, status, event_kind
    ) values (
      p_activity_id, p_creed_id, p_actor_user_id, p_actor_user_id, 'You', 'user',
      'Set up the Creed', 'direct', 'edit'
    );
    update public.creeds
    set onboarding_stage = null, updated_at = timezone('utc'::text, now())
    where id = p_creed_id;
    return 1;
  elsif p_action = 'seed-personal' then
    if v_creed.type <> 'personal' or p_name is null or btrim(p_name) = ''
      or char_length(btrim(p_name)) > 80 then
      raise exception 'invalid personal onboarding input' using errcode = '22023';
    end if;
    select section_id into v_first_section_id
    from public.creed_sections
    where creed_id = p_creed_id
    order by position
    limit 1
    for update;
    if v_first_section_id is null then
      raise exception 'starter section not found';
    end if;
    update public.creed_sections
    set payload = jsonb_set(
          payload,
          '{content}',
          coalesce(p_sections -> 0 -> 'content', '""'::jsonb),
          true
        ),
        revision = revision + 1,
        last_edited_by = 'You',
        last_edited_type = 'user',
        last_edited_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    where creed_id = p_creed_id and section_id = v_first_section_id;
    update public.creeds
    set name = btrim(p_name), updated_at = timezone('utc'::text, now())
    where id = p_creed_id;
    return 1;
  elsif p_action = 'replace-placeholder' then
    if v_creed.type <> 'personal' then
      raise exception 'personal seed requires a personal creed' using errcode = '22023';
    end if;
    if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
      raise exception 'sections are required' using errcode = '22023';
    end if;
    delete from public.creed_sections where creed_id = p_creed_id;
    for v_section in select value from jsonb_array_elements(p_sections)
    loop
      insert into public.creed_sections (
        creed_id, user_id, section_id, position, kind, name, accent, payload,
        agent_permission, agent_writable, template, last_edited_by,
        last_edited_type, last_edited_at, revision, created_at, updated_at
      ) values (
        p_creed_id,
        p_actor_user_id,
        v_section ->> 'section_id',
        coalesce((v_section ->> 'position')::integer, v_count),
        coalesce(v_section ->> 'kind', 'rich-text'),
        v_section ->> 'name',
        v_section ->> 'accent',
        coalesce(v_section -> 'payload', '{}'::jsonb),
        coalesce(v_section ->> 'agent_permission', 'propose'),
        coalesce((v_section ->> 'agent_writable')::boolean, true),
        coalesce(v_section ->> 'template', 'freeform'),
        coalesce(v_section ->> 'last_edited_by', 'You'),
        coalesce(v_section ->> 'last_edited_type', 'user'),
        timezone('utc'::text, now()),
        coalesce((v_section ->> 'revision')::integer, 1),
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
      );
      v_count := v_count + 1;
    end loop;
    return v_count;
  elsif p_action = 'compose' then
    if jsonb_typeof(p_sections) <> 'array' then
      raise exception 'sections must be an array' using errcode = '22023';
    end if;
    for v_section in select value from jsonb_array_elements(p_sections)
    loop
      update public.creed_sections
      set payload = jsonb_set(payload, '{content}', v_section -> 'content', true),
          revision = revision + 1,
          last_edited_by = 'Your assistant',
          last_edited_type = 'agent',
          last_edited_at = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      where creed_id = p_creed_id
        and section_id = v_section ->> 'section_id';
      if found then v_count := v_count + 1; end if;
    end loop;
    if v_count <> jsonb_array_length(p_sections) then
      raise exception 'one or more onboarding sections were not found';
    end if;
    return v_count;
  end if;

  raise exception 'unknown onboarding action' using errcode = '22023';
end;
$$;

comment on function public.apply_creed_onboarding_action(uuid, uuid, text, text, jsonb, text) is
  'Atomically applies an owner-validated onboarding mutation. Service role only.';
