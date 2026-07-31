create table if not exists public.rate_limit_hits (
  key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.rate_limit_hits enable row level security;

revoke all on table public.rate_limit_hits from public, anon, authenticated;

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.rate_limit_hits%rowtype;
  v_now timestamptz := clock_timestamp();
  window_interval interval;
begin
  if p_key is null or length(p_key) > 200 or p_limit <= 0 or
     p_window_seconds <= 0 or p_cost <= 0 then
    return query select false, 0, greatest(p_window_seconds, 1);
    return;
  end if;

  window_interval := make_interval(secs => p_window_seconds);
  if random() < 0.01 then
    delete from public.rate_limit_hits where updated_at < v_now - interval '1 day';
  end if;
  insert into public.rate_limit_hits as hits (
    key, window_started_at, hit_count, updated_at
  ) values (p_key, v_now, p_cost, v_now)
  on conflict (key) do update set
    window_started_at = case
      when hits.window_started_at + window_interval <= v_now
      then v_now else hits.window_started_at end,
    hit_count = case
      when hits.window_started_at + window_interval <= v_now
      then p_cost else hits.hit_count + p_cost end,
    updated_at = v_now
  returning * into current_row;

  return query select
    current_row.hit_count <= p_limit,
    greatest(p_limit - current_row.hit_count, 0),
    greatest(ceil(extract(epoch from
      (current_row.window_started_at + window_interval - v_now)
    ))::integer, 1);
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer, integer)
  to service_role;

create index if not exists rate_limit_hits_updated_at_idx
  on public.rate_limit_hits (updated_at);
