-- 90-day retention for creed_activity. Rows were previously kept forever;
-- the UI only ever reads the newest 500 per creed and the health dashboard
-- reads at most a 30-day window, so anything older is invisible storage
-- cost. A daily pg_cron job deletes rows past the cutoff.
--
-- NB: activity rows carry before/after snapshots, which today are the only
-- historical section content. If a longer-lived version history ships (the
-- section history sheet), it gets its own table with its own retention -
-- this job stays purely about the activity feed.

create extension if not exists pg_cron with schema pg_catalog;

-- The delete predicate is on created_at alone; the existing indexes lead
-- with user_id / creed_id, so give the sweep its own index.
create index if not exists creed_activity_created_idx
  on public.creed_activity (created_at);

-- Idempotent re-schedule: drop any previous copy of the job first so
-- re-running the migration never double-schedules.
do $$
begin
  perform cron.unschedule('creed-activity-retention');
exception
  when others then null; -- not scheduled yet
end;
$$;

select cron.schedule(
  'creed-activity-retention',
  '17 3 * * *', -- daily at 03:17 UTC, off the top-of-hour rush
  $$delete from public.creed_activity where created_at < now() - interval '90 days'$$
);
