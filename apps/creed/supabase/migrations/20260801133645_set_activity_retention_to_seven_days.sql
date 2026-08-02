-- Keep the product activity feed intentionally short-lived. Section versions
-- have their own history table; creed_activity is only the recent collaboration
-- feed and includes potentially large before/after snapshots.

-- Apply the new policy immediately instead of waiting for the next daily run.
delete from public.creed_activity
where created_at < now() - interval '7 days';

-- Replace the existing 90-day job without creating a duplicate schedule.
do $$
begin
  perform cron.unschedule('creed-activity-retention');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'creed-activity-retention',
  '17 3 * * *',
  $$delete from public.creed_activity where created_at < now() - interval '7 days'$$
);
