alter table public.sponsors
  add column anonymous_key_hash text,
  add column updated_at timestamptz not null default timezone('utc'::text, now());

create unique index sponsors_anonymous_key_hash_unique
  on public.sponsors (anonymous_key_hash)
  where anonymous_key_hash is not null;

alter table public.sponsors
  add constraint sponsors_identity_check check (
    not (user_id is not null and anonymous_key_hash is not null)
  );

alter table public.sponsor_donations
  add column attempt_id uuid,
  add column succeeded_at timestamptz,
  add column failed_at timestamptz,
  add column amount_refunded_cents integer not null default 0,
  add column refund_event_created bigint,
  add column dispute_status text,
  add column dispute_event_created bigint,
  add column updated_at timestamptz not null default timezone('utc'::text, now()),
  drop constraint sponsor_donations_status_check,
  add constraint sponsor_donations_status_check check (
    status in ('pending', 'succeeded', 'failed', 'refunded', 'disputed')
  ),
  add constraint sponsor_donations_refund_check check (
    amount_refunded_cents between 0 and amount_cents
  );

create unique index sponsor_donations_attempt_id_unique
  on public.sponsor_donations (attempt_id)
  where attempt_id is not null;

create or replace function public.get_or_create_sponsor(
  p_candidate_id uuid,
  p_user_id uuid,
  p_anonymous_key_hash text,
  p_name text,
  p_message text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sponsor_id uuid;
begin
  if p_user_id is null and p_anonymous_key_hash is null then
    raise exception 'A sponsor identity is required.';
  end if;

  if p_user_id is not null then
    select id into v_sponsor_id
    from public.sponsors
    where user_id = p_user_id
    for update;
  else
    select id into v_sponsor_id
    from public.sponsors
    where anonymous_key_hash = p_anonymous_key_hash
    for update;
  end if;

  if v_sponsor_id is null then
    begin
      insert into public.sponsors (
        id,
        user_id,
        anonymous_key_hash,
        name,
        message
      ) values (
        p_candidate_id,
        p_user_id,
        case when p_user_id is null then p_anonymous_key_hash else null end,
        nullif(btrim(p_name), ''),
        nullif(btrim(p_message), '')
      )
      returning id into v_sponsor_id;
    exception when unique_violation then
      if p_user_id is not null then
        select id into v_sponsor_id from public.sponsors where user_id = p_user_id;
      else
        select id into v_sponsor_id from public.sponsors where anonymous_key_hash = p_anonymous_key_hash;
      end if;
    end;
  end if;

  update public.sponsors
  set name = coalesce(nullif(btrim(p_name), ''), name),
      message = coalesce(nullif(btrim(p_message), ''), message),
      updated_at = timezone('utc'::text, now())
  where id = v_sponsor_id;

  return v_sponsor_id;
end;
$$;

create or replace function public.apply_sponsor_donation_event(
  p_sponsor_id uuid,
  p_amount_cents integer,
  p_payment_intent_id text,
  p_attempt_id uuid,
  p_event_kind text,
  p_event_created bigint,
  p_amount_refunded_cents integer default 0,
  p_dispute_status text default null
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.sponsor_donations%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_event_kind not in ('pending', 'succeeded', 'failed', 'refund', 'dispute') then
    raise exception 'Unsupported sponsor event kind.';
  end if;

  insert into public.sponsor_donations (
    sponsor_id,
    amount_cents,
    stripe_payment_intent_id,
    attempt_id
  ) values (
    p_sponsor_id,
    p_amount_cents,
    p_payment_intent_id,
    p_attempt_id
  )
  on conflict (stripe_payment_intent_id) do nothing;

  select * into v_row
  from public.sponsor_donations
  where stripe_payment_intent_id = p_payment_intent_id
  for update;

  if v_row.sponsor_id <> p_sponsor_id or v_row.amount_cents <> p_amount_cents then
    raise exception 'Sponsor payment identity does not match the existing donation.';
  end if;

  update public.sponsor_donations
  set succeeded_at = case
        when p_event_kind = 'succeeded' then coalesce(succeeded_at, v_now)
        else succeeded_at
      end,
      failed_at = case
        when p_event_kind = 'failed' then coalesce(failed_at, v_now)
        else failed_at
      end,
      amount_refunded_cents = case
        when p_event_kind = 'refund'
          and (refund_event_created is null or p_event_created >= refund_event_created)
          then least(greatest(p_amount_refunded_cents, 0), amount_cents)
        else amount_refunded_cents
      end,
      refund_event_created = case
        when p_event_kind = 'refund'
          and (refund_event_created is null or p_event_created >= refund_event_created)
          then p_event_created
        else refund_event_created
      end,
      dispute_status = case
        when p_event_kind = 'dispute'
          and (dispute_event_created is null or p_event_created >= dispute_event_created)
          then p_dispute_status
        else dispute_status
      end,
      dispute_event_created = case
        when p_event_kind = 'dispute'
          and (dispute_event_created is null or p_event_created >= dispute_event_created)
          then p_event_created
        else dispute_event_created
      end,
      updated_at = v_now
  where stripe_payment_intent_id = p_payment_intent_id
  returning * into v_row;

  update public.sponsor_donations
  set status = case
        when v_row.amount_refunded_cents >= v_row.amount_cents then 'refunded'
        when v_row.dispute_status is not null
          and v_row.dispute_status not in ('won', 'warning_closed') then 'disputed'
        when v_row.succeeded_at is not null then 'succeeded'
        when v_row.failed_at is not null then 'failed'
        else 'pending'
      end
  where id = v_row.id
  returning status into v_row.status;

  return v_row.status;
end;
$$;

revoke all on function public.get_or_create_sponsor(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.apply_sponsor_donation_event(uuid, integer, text, uuid, text, bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.get_or_create_sponsor(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.apply_sponsor_donation_event(uuid, integer, text, uuid, text, bigint, integer, text)
  to service_role;

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
      array_agg(
        d.amount_cents - d.amount_refunded_cents
        order by d.created_at desc
      )::integer[] as donation_amounts
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
        select 1 from unnest(donation_amounts) amount
        where p_amount_cents is not null and amount = p_amount_cents
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

create or replace function public.get_public_sponsor(p_sponsor_id uuid)
returns table (
  id uuid,
  name text,
  message text,
  avatar_path text,
  total_cents bigint,
  donation_amounts integer[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id,
    s.name,
    s.message,
    s.avatar_path,
    sum(d.amount_cents - d.amount_refunded_cents)::bigint,
    array_agg(
      d.amount_cents - d.amount_refunded_cents
      order by d.created_at desc
    )::integer[]
  from public.sponsors s
  join public.sponsor_donations d on d.sponsor_id = s.id
  where s.id = p_sponsor_id
    and d.status = 'succeeded'
  group by s.id;
$$;

revoke all on function public.list_public_sponsors(text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_public_sponsor(uuid)
  from public, anon, authenticated;
grant execute on function public.list_public_sponsors(text, integer, integer, integer)
  to service_role;
grant execute on function public.get_public_sponsor(uuid)
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sponsor-avatars',
  'sponsor-avatars',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "public read sponsor avatars"
  on storage.objects
  for select
  to public
  using (bucket_id = 'sponsor-avatars');
