-- Cover state rows keyed by user_id rather than creed_id, plus the company
-- GitHub integration added after the original company schema.
create or replace function private.touch_personal_creed_sync_tick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  target_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  update public.creeds
  set sync_updated_at = timezone('utc'::text, clock_timestamp())
  where owner_user_id = target_user_id and type = 'personal';
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.touch_personal_creed_sync_tick() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'creed_tokens', 'creed_integrations', 'creed_version_control',
    'creed_getting_started'
  ]
  loop
    execute format('drop trigger if exists touch_personal_creed_sync_tick on public.%I', table_name);
    execute format(
      'create trigger touch_personal_creed_sync_tick after insert or update or delete on public.%I for each row execute function private.touch_personal_creed_sync_tick()',
      table_name
    );
  end loop;
end;
$$;

drop trigger if exists touch_creed_sync_tick on public.creed_company_github_integration;
create trigger touch_creed_sync_tick
after insert or update or delete on public.creed_company_github_integration
for each row execute function private.touch_creed_sync_tick();
