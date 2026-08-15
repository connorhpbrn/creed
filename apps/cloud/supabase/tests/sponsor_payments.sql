begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

set local role service_role;

select is(
  public.get_or_create_sponsor(
    '00000000-0000-4000-8000-000000000001',
    null,
    'anonymous-one',
    null,
    null
  ),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'creates an anonymous sponsor'
);

select is(
  public.apply_sponsor_donation_event(
    '00000000-0000-4000-8000-000000000001', 1000, 'pi_refund_first',
    '00000000-0000-4000-8000-000000000011', 'refund', 20, 1000, null
  ),
  'refunded',
  'records a refund before success'
);

select is(
  public.apply_sponsor_donation_event(
    '00000000-0000-4000-8000-000000000001', 1000, 'pi_refund_first',
    '00000000-0000-4000-8000-000000000011', 'succeeded', 10, 0, null
  ),
  'refunded',
  'a delayed success cannot revive a refund'
);

select is(
  public.apply_sponsor_donation_event(
    '00000000-0000-4000-8000-000000000001', 2500, 'pi_dispute',
    '00000000-0000-4000-8000-000000000012', 'succeeded', 30, 0, null
  ),
  'succeeded',
  'records a successful donation'
);

select is(
  public.apply_sponsor_donation_event(
    '00000000-0000-4000-8000-000000000001', 2500, 'pi_dispute',
    '00000000-0000-4000-8000-000000000012', 'dispute', 40, 0, 'needs_response'
  ),
  'disputed',
  'removes an active dispute from the wall'
);

select is(
  public.apply_sponsor_donation_event(
    '00000000-0000-4000-8000-000000000001', 2500, 'pi_dispute',
    '00000000-0000-4000-8000-000000000012', 'dispute', 50, 0, 'won'
  ),
  'succeeded',
  'restores a won dispute'
);

select is(
  public.apply_sponsor_donation_event(
    '00000000-0000-4000-8000-000000000001', 2500, 'pi_dispute',
    '00000000-0000-4000-8000-000000000012', 'dispute', 45, 0, 'lost'
  ),
  'succeeded',
  'ignores an older dispute event'
);

select is(
  public.apply_sponsor_donation_event(
    '00000000-0000-4000-8000-000000000001', 500, 'pi_retry',
    '00000000-0000-4000-8000-000000000013', 'failed', 60, 0, null
  ),
  'failed',
  'records a failed intent'
);

select is(
  public.apply_sponsor_donation_event(
    '00000000-0000-4000-8000-000000000001', 500, 'pi_retry',
    '00000000-0000-4000-8000-000000000013', 'succeeded', 70, 0, null
  ),
  'succeeded',
  'a later successful attempt becomes visible'
);

select is(
  (
    select count(*)::integer
    from public.sponsor_donations
    where stripe_payment_intent_id = 'pi_retry'
  ),
  1,
  'webhook retries do not duplicate donations'
);

do $$
begin
  for i in 1..13 loop
    perform public.apply_sponsor_donation_event(
      '00000000-0000-4000-8000-000000000001',
      500,
      'pi_bounded_' || i,
      gen_random_uuid(),
      'succeeded',
      100 + i,
      0,
      null
    );
  end loop;
end;
$$;

select is(
  (
    select array_length(donation_amounts, 1)
    from public.list_public_sponsors('', null, 24, 0)
    where id = '00000000-0000-4000-8000-000000000001'
  ),
  12,
  'wall pages return a bounded donation history'
);

reset role;
set local role anon;
select throws_ok(
  'select * from public.sponsors',
  '42501',
  null,
  'browser roles cannot read sponsor tables directly'
);

select * from finish();
rollback;
