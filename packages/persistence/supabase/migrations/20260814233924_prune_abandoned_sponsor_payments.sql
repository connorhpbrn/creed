create index sponsor_donations_abandoned_idx
  on public.sponsor_donations (created_at)
  where status in ('pending', 'failed');

create or replace function public.prune_abandoned_sponsor_payments()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.sponsor_donations
  where status in ('pending', 'failed')
    and created_at < timezone('utc'::text, now()) - interval '7 days';
  get diagnostics v_deleted = row_count;

  delete from public.sponsors s
  where not exists (
    select 1
    from public.sponsor_donations d
    where d.sponsor_id = s.id
  );

  return v_deleted;
end;
$$;

revoke all on function public.prune_abandoned_sponsor_payments()
  from public, anon, authenticated;
grant execute on function public.prune_abandoned_sponsor_payments()
  to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'prune-abandoned-sponsor-payments';

select cron.schedule(
  'prune-abandoned-sponsor-payments',
  '17 3 * * *',
  'select public.prune_abandoned_sponsor_payments()'
);
