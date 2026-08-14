create or replace function public.list_public_sponsors(
  p_query text default '',
  p_amount_cents integer default null,
  p_limit integer default 24,
  p_offset integer default 0
) returns table (
  id uuid,
  name text,
  message text,
  avatar_path text,
  total_cents bigint,
  donation_amounts integer[],
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ranked as (
    select
      s.id,
      s.name,
      s.message,
      s.avatar_path,
      sum(d.amount_cents - d.amount_refunded_cents)::bigint as total_cents,
      (array_agg(
        d.amount_cents - d.amount_refunded_cents
        order by d.created_at desc
      ))[1:12]::integer[] as donation_amounts
    from public.sponsors s
    join public.sponsor_donations d on d.sponsor_id = s.id
    where d.status = 'succeeded'
    group by s.id
  ), filtered as (
    select *
    from ranked
    where btrim(p_query) = ''
      or coalesce(name, 'Anonymous') ilike '%' || btrim(p_query) || '%'
      or coalesce(message, '') ilike '%' || btrim(p_query) || '%'
      or (p_amount_cents is not null and total_cents = p_amount_cents)
      or exists (
        select 1
        from public.sponsor_donations donation
        where donation.sponsor_id = ranked.id
          and donation.status = 'succeeded'
          and p_amount_cents is not null
          and donation.amount_cents - donation.amount_refunded_cents = p_amount_cents
      )
  )
  select
    filtered.id,
    filtered.name,
    filtered.message,
    filtered.avatar_path,
    filtered.total_cents,
    filtered.donation_amounts,
    count(*) over() as total_count
  from filtered
  order by filtered.total_cents desc, filtered.id
  limit least(greatest(p_limit, 1), 48)
  offset greatest(p_offset, 0);
$$;
