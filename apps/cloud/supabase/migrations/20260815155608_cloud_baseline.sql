--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: creed_role("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."creed_role"("p_creed_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select role
  from public.creed_members
  where creed_id = p_creed_id and user_id = (select auth.uid());
$$;


ALTER FUNCTION "private"."creed_role"("p_creed_id" "uuid") OWNER TO "postgres";

--
-- Name: creed_section_permission("uuid", "text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."creed_section_permission"("p_creed_id" "uuid", "p_section_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_role text;
  v_perm text;
begin
  v_role := private.creed_role(p_creed_id);
  if v_role is null then return null; end if;
  if v_role in ('owner', 'admin') then return 'direct'; end if;
  select permission into v_perm
  from public.creed_member_section_permissions
  where creed_id = p_creed_id
    and user_id = (select auth.uid())
    and section_id = p_section_id;
  return coalesce(v_perm, 'direct');
end;
$$;


ALTER FUNCTION "private"."creed_section_permission"("p_creed_id" "uuid", "p_section_id" "text") OWNER TO "postgres";

--
-- Name: creed_type("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."creed_type"("p_creed_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select type from public.creeds where id = p_creed_id;
$$;


ALTER FUNCTION "private"."creed_type"("p_creed_id" "uuid") OWNER TO "postgres";

--
-- Name: get_member_profiles("uuid"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."get_member_profiles"("p_creed_id" "uuid") RETURNS TABLE("user_id" "uuid", "role" "text", "email" "text", "raw_user_meta_data" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select m.user_id, m.role, coalesce(u.email, ''), coalesce(u.raw_user_meta_data, '{}'::jsonb)
  from public.creed_members m
  join auth.users u on u.id = m.user_id
  where m.creed_id = p_creed_id
  order by m.created_at;
$$;


ALTER FUNCTION "private"."get_member_profiles"("p_creed_id" "uuid") OWNER TO "postgres";

--
-- Name: touch_creed_sync_tick(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."touch_creed_sync_tick"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_creed_id uuid;
begin
  target_creed_id := case when tg_op = 'DELETE' then old.creed_id else new.creed_id end;
  update public.creeds
  set sync_updated_at = timezone('utc'::text, clock_timestamp())
  where id = target_creed_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."touch_creed_sync_tick"() OWNER TO "postgres";

--
-- Name: touch_getting_started_creed_sync_tick(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."touch_getting_started_creed_sync_tick"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_creed_id uuid;
begin
  target_creed_id := case
    when tg_op = 'DELETE' then old.creed_id
    else new.creed_id
  end;
  update public.creeds
  set sync_updated_at = timezone('utc'::text, clock_timestamp())
  where id = target_creed_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."touch_getting_started_creed_sync_tick"() OWNER TO "postgres";

--
-- Name: touch_personal_creed_sync_tick(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."touch_personal_creed_sync_tick"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."touch_personal_creed_sync_tick"() OWNER TO "postgres";

--
-- Name: accept_shared_invite("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."accept_shared_invite"("p_invite_id" "uuid", "p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  invite public.creed_invites%rowtype;
begin
  select *
  into invite
  from public.creed_invites
  where id = p_invite_id
  for update;

  if not found or invite.status <> 'pending' or invite.expires_at <= now() then
    return 'invalid';
  end if;

  insert into public.creed_members (creed_id, user_id, role)
  values (invite.creed_id, p_user_id, invite.role)
  on conflict (creed_id, user_id) do nothing;

  update public.creed_invites
  set status = 'accepted', updated_at = now()
  where id = invite.id;

  return 'accepted';
end;
$$;


ALTER FUNCTION "public"."accept_shared_invite"("p_invite_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: apply_creed_onboarding_action("uuid", "uuid", "text", "text", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text" DEFAULT NULL::"text", "p_sections" "jsonb" DEFAULT '[]'::"jsonb", "p_activity_id" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  elsif p_action in ('seed-shared', 'replace-placeholder') then
    if p_action = 'seed-shared' and v_creed.type <> 'shared' then
      raise exception 'shared seed requires a shared creed' using errcode = '22023';
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
    if p_action = 'seed-shared' then
      update public.creeds
      set name = btrim(p_name), onboarding_stage = 'composing',
          updated_at = timezone('utc'::text, now())
      where id = p_creed_id;
    end if;
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


ALTER FUNCTION "public"."apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text") IS 'Atomically applies an owner-validated onboarding mutation. Service role only.';


--
-- Name: apply_sponsor_donation_event("uuid", integer, "text", "uuid", "text", bigint, integer, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."apply_sponsor_donation_event"("p_sponsor_id" "uuid", "p_amount_cents" integer, "p_payment_intent_id" "text", "p_attempt_id" "uuid", "p_event_kind" "text", "p_event_created" bigint, "p_amount_refunded_cents" integer DEFAULT 0, "p_dispute_status" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."apply_sponsor_donation_event"("p_sponsor_id" "uuid", "p_amount_cents" integer, "p_payment_intent_id" "text", "p_attempt_id" "uuid", "p_event_kind" "text", "p_event_created" bigint, "p_amount_refunded_cents" integer, "p_dispute_status" "text") OWNER TO "postgres";

--
-- Name: cancel_credit_reservation("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cancel_credit_reservation"("p_reservation_id" "uuid") RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.settle_credit_reservation(p_reservation_id, 0);
$$;


ALTER FUNCTION "public"."cancel_credit_reservation"("p_reservation_id" "uuid") OWNER TO "postgres";

--
-- Name: check_rate_limit("text", integer, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer, "p_cost" integer DEFAULT 1) RETURNS TABLE("allowed" boolean, "remaining" integer, "retry_after_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  insert into public.rate_limit_hits as hits (key, window_started_at, hit_count, updated_at)
  values (p_key, v_now, p_cost, v_now)
  on conflict (key) do update set
    window_started_at = case when hits.window_started_at + window_interval <= v_now
      then v_now else hits.window_started_at end,
    hit_count = case when hits.window_started_at + window_interval <= v_now
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


ALTER FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer, "p_cost" integer) OWNER TO "postgres";

--
-- Name: create_owned_creed("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text") RETURNS TABLE("id" "uuid", "type" "text", "name" "text", "onboarding_stage" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_creed_id uuid;
  v_section_id text;
  v_section_name text;
begin
  if p_user_id is null then
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
  values (p_type, p_name, p_user_id, null)
  returning creeds.id into v_creed_id;

  insert into public.creed_members (creed_id, user_id, role)
  values (v_creed_id, p_user_id, 'owner');

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
    p_user_id,
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


ALTER FUNCTION "public"."create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text") IS 'Atomically creates an owned Creed ready for the file. Service role only; caller must pass the authenticated user id.';


--
-- Name: credit_spend_total("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."credit_spend_total"("p_creed_id" "uuid") RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when auth.uid() is null or exists (
      select 1 from public.creed_members m
      where m.creed_id = p_creed_id and m.user_id = auth.uid()
    )
    then coalesce((
      select sum(amount_micro_usd)
      from public.creed_credit_transactions
      where creed_id = p_creed_id and type = 'debit'
    ), 0)::bigint
    else 0::bigint
  end;
$$;


ALTER FUNCTION "public"."credit_spend_total"("p_creed_id" "uuid") OWNER TO "postgres";

--
-- Name: credit_topup("uuid", bigint, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."credit_topup"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_payment_intent_id" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_granted bigint;
  v_purchased bigint;
begin
  insert into public.creed_credit_transactions (
    id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
    stripe_payment_intent_id, bucket
  )
  values (
    gen_random_uuid()::text, p_creed_id, 'topup', p_amount_micro, 0,
    p_payment_intent_id, 'purchased'
  )
  on conflict (stripe_payment_intent_id) do nothing;

  if not found then
    select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
      into v_granted, v_purchased
      from public.creed_credits where creed_id = p_creed_id;
    return coalesce(v_granted, 0) + coalesce(v_purchased, 0);
  end if;

  insert into public.creed_credits (creed_id, purchased_micro_usd, updated_at)
  values (p_creed_id, p_amount_micro, timezone('utc'::text, now()))
  on conflict (creed_id) do update
    set purchased_micro_usd = public.creed_credits.purchased_micro_usd + excluded.purchased_micro_usd,
        updated_at = timezone('utc'::text, now())
  returning granted_micro_usd, purchased_micro_usd into v_granted, v_purchased;

  update public.creed_credit_transactions
    set balance_after_micro_usd = v_granted + v_purchased
    where stripe_payment_intent_id = p_payment_intent_id;

  return v_granted + v_purchased;
end;
$$;


ALTER FUNCTION "public"."credit_topup"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_payment_intent_id" "text") OWNER TO "postgres";

--
-- Name: debit_credits("uuid", bigint, "text", "text", "uuid", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."debit_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean DEFAULT false) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_granted bigint;
  v_purchased bigint;
  v_from_granted bigint;
  v_from_purchased bigint;
  v_new_granted bigint;
  v_new_purchased bigint;
  v_bucket text;
begin
  if p_amount_micro <= 0 then
    raise exception 'invalid_debit_amount';
  end if;

  insert into public.creed_credits (creed_id)
  values (p_creed_id)
  on conflict (creed_id) do nothing;

  select coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  if coalesce(p_purchased_only, false) then
    if v_purchased < p_amount_micro then
      raise exception 'insufficient_credits';
    end if;
    v_from_granted := 0;
    v_from_purchased := p_amount_micro;
  else
    if v_granted + v_purchased < p_amount_micro then
      raise exception 'insufficient_credits';
    end if;
    v_from_granted := least(greatest(v_granted, 0), p_amount_micro);
    v_from_purchased := p_amount_micro - v_from_granted;
  end if;

  v_new_granted := v_granted - v_from_granted;
  v_new_purchased := v_purchased - v_from_purchased;

  update public.creed_credits
    set granted_micro_usd = v_new_granted,
        purchased_micro_usd = v_new_purchased,
        updated_at = timezone('utc'::text, now())
    where creed_id = p_creed_id;

  if v_from_granted > 0 and v_from_purchased > 0 then
    v_bucket := 'mixed';
  elsif v_from_granted > 0 then
    v_bucket := 'granted';
  else
    v_bucket := 'purchased';
  end if;

  insert into public.creed_credit_transactions (
    id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
    feature, model_id, bucket, spent_by_user_id
  )
  values (
    gen_random_uuid()::text, p_creed_id, 'debit', p_amount_micro,
    v_new_granted + v_new_purchased, p_feature, p_model_id, v_bucket, p_spent_by
  );

  return v_new_granted + v_new_purchased;
end;
$$;


ALTER FUNCTION "public"."debit_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean) OWNER TO "postgres";

--
-- Name: get_creed_state_tick("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_creed_state_tick"("p_creed_id" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select floor(extract(epoch from greatest(updated_at, sync_updated_at)) * 1000)::bigint
  from public.creeds
  where id = p_creed_id;
$$;


ALTER FUNCTION "public"."get_creed_state_tick"("p_creed_id" "uuid") OWNER TO "postgres";

--
-- Name: get_member_profiles("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_member_profiles"("p_creed_id" "uuid") RETURNS TABLE("user_id" "uuid", "role" "text", "email" "text", "raw_user_meta_data" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select * from private.get_member_profiles(p_creed_id); $$;


ALTER FUNCTION "public"."get_member_profiles"("p_creed_id" "uuid") OWNER TO "postgres";

--
-- Name: get_or_create_sponsor("uuid", "uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_or_create_sponsor"("p_candidate_id" "uuid", "p_user_id" "uuid", "p_anonymous_key_hash" "text", "p_name" "text", "p_message" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_or_create_sponsor"("p_candidate_id" "uuid", "p_user_id" "uuid", "p_anonymous_key_hash" "text", "p_name" "text", "p_message" "text") OWNER TO "postgres";

--
-- Name: get_public_sponsor("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_public_sponsor"("p_sponsor_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "message" "text", "avatar_path" "text", "total_cents" bigint, "donation_amounts" integer[])
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_public_sponsor"("p_sponsor_id" "uuid") OWNER TO "postgres";

--
-- Name: grant_allowance("uuid", bigint, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."grant_allowance"("p_creed_id" "uuid", "p_allowance_micro" bigint, "p_period_key" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current_key text;
  v_granted bigint;
  v_purchased bigint;
begin
  insert into public.creed_credits (creed_id)
  values (p_creed_id)
  on conflict (creed_id) do nothing;

  select grant_period_key, coalesce(granted_micro_usd, 0), coalesce(purchased_micro_usd, 0)
    into v_current_key, v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  if v_current_key is distinct from p_period_key then
    update public.creed_credits
      set granted_micro_usd = p_allowance_micro,
          grant_period_key = p_period_key,
          grant_period_start = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      where creed_id = p_creed_id;

    insert into public.creed_credit_transactions (
      id, creed_id, type, amount_micro_usd, balance_after_micro_usd, bucket, grant_period_key
    )
    values (
      gen_random_uuid()::text, p_creed_id, 'grant', p_allowance_micro,
      p_allowance_micro + v_purchased, 'granted', p_period_key
    )
    on conflict do nothing;

    return p_allowance_micro + v_purchased;
  end if;

  return v_granted + v_purchased;
end;
$$;


ALTER FUNCTION "public"."grant_allowance"("p_creed_id" "uuid", "p_allowance_micro" bigint, "p_period_key" "text") OWNER TO "postgres";

--
-- Name: guard_oauth_client_registration(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."guard_oauth_client_registration"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Serialize the prune + ceiling check so concurrent registrations cannot
  -- race past the global cap.
  perform pg_advisory_xact_lock(hashtext('creed:oauth-client-registration'));

  delete from public.oauth_authorization_codes
  where expires_at < now()
     or (used_at is not null and used_at < now() - interval '1 day');

  delete from public.oauth_tokens
  where (revoked_at is not null and revoked_at < now() - interval '7 days')
     or refresh_expires_at < now() - interval '7 days';

  if (select count(*) from public.oauth_clients) >= 10000 then
    raise exception 'OAuth client registration capacity reached';
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."guard_oauth_client_registration"() OWNER TO "postgres";

--
-- Name: FUNCTION "guard_oauth_client_registration"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."guard_oauth_client_registration"() IS 'Caps oauth_clients and prunes expired codes/tokens. Does not delete clients; MCP hosts cache client_id across reconnects.';


--
-- Name: increment_mcp_read("uuid", "text", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."increment_mcp_read"("p_user_id" "uuid", "p_client_id" "text", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_creed_id uuid;
begin
  select id
    into v_creed_id
    from public.creeds
    where owner_user_id = p_user_id
      and type = 'personal';

  if v_creed_id is null then
    raise exception 'personal creed not found for user %', p_user_id;
  end if;

  perform public.increment_mcp_read_for_creed(v_creed_id, p_user_id, p_client_id, p_day);
end;
$$;


ALTER FUNCTION "public"."increment_mcp_read"("p_user_id" "uuid", "p_client_id" "text", "p_day" "date") OWNER TO "postgres";

--
-- Name: increment_mcp_read_for_creed("uuid", "uuid", "text", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."increment_mcp_read_for_creed"("p_creed_id" "uuid", "p_reader_user_id" "uuid", "p_client_id" "text", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_creed_id is null or p_reader_user_id is null then
    raise exception 'creed id and reader user id are required';
  end if;

  if not exists (
    select 1
    from public.creed_members
    where creed_id = p_creed_id
      and user_id = p_reader_user_id
  ) then
    raise exception 'reader is not an active member of this creed';
  end if;

  insert into public.creed_mcp_read_events (creed_id, user_id, client_id, day, read_count)
  values (p_creed_id, p_reader_user_id, p_client_id, p_day, 1)
  on conflict (creed_id, client_id, day)
  do update set
    read_count = public.creed_mcp_read_events.read_count + 1,
    updated_at = timezone('utc'::text, now());
end;
$$;


ALTER FUNCTION "public"."increment_mcp_read_for_creed"("p_creed_id" "uuid", "p_reader_user_id" "uuid", "p_client_id" "text", "p_day" "date") OWNER TO "postgres";

--
-- Name: list_public_sponsors("text", integer, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."list_public_sponsors"("p_query" "text" DEFAULT ''::"text", "p_amount_cents" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 24, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "name" "text", "message" "text", "avatar_path" "text", "total_cents" bigint, "donation_amounts" integer[], "total_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."list_public_sponsors"("p_query" "text", "p_amount_cents" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";

--
-- Name: prune_abandoned_sponsor_payments(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."prune_abandoned_sponsor_payments"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."prune_abandoned_sponsor_payments"() OWNER TO "postgres";

--
-- Name: refund_credit_topup("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."refund_credit_topup"("p_payment_intent_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  t public.creed_credit_transactions%rowtype;
  v_refund_id text := 'refund:' || p_payment_intent_id;
begin
  if exists (select 1 from public.creed_credit_transactions where id = v_refund_id) then return false; end if;
  select * into t from public.creed_credit_transactions
    where stripe_payment_intent_id = p_payment_intent_id and type = 'topup'
    for update;
  if not found then return false; end if;
  update public.creed_credits set
    purchased_micro_usd = greatest(0, purchased_micro_usd - t.amount_micro_usd),
    updated_at = now()
    where creed_id = t.creed_id;
  insert into public.creed_credit_transactions (
    id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
    bucket
  ) select v_refund_id, t.creed_id, 'refund', t.amount_micro_usd,
    granted_micro_usd + purchased_micro_usd, 'purchased'
    from public.creed_credits where creed_id = t.creed_id;
  return true;
end;
$$;


ALTER FUNCTION "public"."refund_credit_topup"("p_payment_intent_id" "text") OWNER TO "postgres";

--
-- Name: reserve_credits("uuid", bigint, "text", "text", "uuid", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reserve_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid := gen_random_uuid();
  v_granted bigint;
  v_purchased bigint;
  v_from_granted bigint;
  v_from_purchased bigint;
  stale record;
begin
  if p_amount_micro <= 0 then raise exception 'invalid_reservation_amount'; end if;
  insert into public.creed_credits (creed_id) values (p_creed_id)
    on conflict (creed_id) do nothing;
  select granted_micro_usd, purchased_micro_usd into v_granted, v_purchased
    from public.creed_credits where creed_id = p_creed_id for update;

  for stale in
    select * from public.creed_credit_reservations
    where creed_id = p_creed_id and status = 'reserved'
      and created_at < now() - interval '10 minutes'
    for update
  loop
    v_granted := v_granted + stale.reserved_granted_micro_usd;
    v_purchased := v_purchased + stale.reserved_purchased_micro_usd;
    update public.creed_credit_reservations set status = 'cancelled', settled_at = now()
      where id = stale.id;
  end loop;

  if coalesce(p_purchased_only, false) then
    if v_purchased < p_amount_micro then
      raise exception 'insufficient_credits';
    end if;
    v_from_granted := 0;
    v_from_purchased := p_amount_micro;
  else
    if v_granted + v_purchased < p_amount_micro then
      raise exception 'insufficient_credits';
    end if;
    v_from_granted := least(v_granted, p_amount_micro);
    v_from_purchased := p_amount_micro - v_from_granted;
  end if;

  update public.creed_credits set
    granted_micro_usd = v_granted - v_from_granted,
    purchased_micro_usd = v_purchased - v_from_purchased,
    updated_at = now()
    where creed_id = p_creed_id;
  insert into public.creed_credit_reservations (
    id, creed_id, reserved_granted_micro_usd, reserved_purchased_micro_usd,
    feature, model_id, spent_by_user_id
  ) values (v_id, p_creed_id, v_from_granted, v_from_purchased, p_feature, p_model_id, p_spent_by);
  return v_id;
end;
$$;


ALTER FUNCTION "public"."reserve_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean) OWNER TO "postgres";

--
-- Name: set_credit_home("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_credit_home"("p_user_id" "uuid", "p_creed_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
  r record;
begin
  if p_user_id is null or p_creed_id is null then
    raise exception 'credit_home_missing_args';
  end if;

  perform pg_advisory_xact_lock(hashtext('creed_credit_home:' || p_user_id::text));

  select owner_user_id into v_owner
    from public.creeds
   where id = p_creed_id
   for share;
  if v_owner is distinct from p_user_id then
    raise exception 'credit_home_not_owner';
  end if;

  insert into public.creed_credits (creed_id)
  values (p_creed_id)
  on conflict (creed_id) do nothing;

  for r in
    select c.id as creed_id
      from public.creeds c
     where c.owner_user_id = p_user_id
       and c.id <> p_creed_id
     order by c.id
  loop
    perform public.transfer_credit_home(r.creed_id, p_creed_id);
  end loop;

  insert into public.creed_credit_homes as homes (user_id, creed_id, updated_at)
  values (p_user_id, p_creed_id, timezone('utc'::text, now()))
  on conflict (user_id) do update
    set creed_id = excluded.creed_id,
        updated_at = excluded.updated_at;

  return p_creed_id;
end;
$$;


ALTER FUNCTION "public"."set_credit_home"("p_user_id" "uuid", "p_creed_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "set_credit_home"("p_user_id" "uuid", "p_creed_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."set_credit_home"("p_user_id" "uuid", "p_creed_id" "uuid") IS 'Point Cloud Bonus at an owned Creed, consolidating granted balances and updating creed_credit_homes atomically.';


--
-- Name: settle_credit_reservation("uuid", bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."settle_credit_reservation"("p_reservation_id" "uuid", "p_actual_micro" bigint) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r public.creed_credit_reservations%rowtype;
  v_reserved bigint;
  v_actual bigint;
  v_used_granted bigint;
  v_used_purchased bigint;
  v_balance bigint;
  v_bucket text;
begin
  select * into r from public.creed_credit_reservations
    where id = p_reservation_id for update;
  if not found or r.status <> 'reserved' then raise exception 'invalid_reservation'; end if;
  v_reserved := r.reserved_granted_micro_usd + r.reserved_purchased_micro_usd;
  v_actual := greatest(p_actual_micro, 0);
  v_used_granted := least(r.reserved_granted_micro_usd, v_actual);
  v_used_purchased := least(r.reserved_purchased_micro_usd, v_actual - v_used_granted);
  update public.creed_credits set
    granted_micro_usd = granted_micro_usd + (r.reserved_granted_micro_usd - v_used_granted),
    purchased_micro_usd = purchased_micro_usd + (r.reserved_purchased_micro_usd - v_used_purchased)
      - greatest(v_actual - v_reserved, 0),
    updated_at = now()
    where creed_id = r.creed_id
    returning granted_micro_usd + purchased_micro_usd into v_balance;
  update public.creed_credit_reservations set status = 'settled', settled_at = now()
    where id = r.id;
  if v_actual > 0 then
    v_bucket := case when v_used_granted > 0 and v_used_purchased > 0 then 'mixed'
      when v_used_granted > 0 then 'granted' else 'purchased' end;
    insert into public.creed_credit_transactions (
      id, creed_id, type, amount_micro_usd, balance_after_micro_usd,
      feature, model_id, bucket, spent_by_user_id
    ) values (
      gen_random_uuid()::text, r.creed_id, 'debit', v_actual, v_balance,
      r.feature, r.model_id, v_bucket, r.spent_by_user_id
    );
  end if;
  return v_balance;
end;
$$;


ALTER FUNCTION "public"."settle_credit_reservation"("p_reservation_id" "uuid", "p_actual_micro" bigint) OWNER TO "postgres";

--
-- Name: transfer_credit_home("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."transfer_credit_home"("p_from_creed_id" "uuid", "p_to_creed_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_granted bigint;
  v_period_key text;
  v_period_start timestamptz;
  v_to_granted bigint;
begin
  if p_from_creed_id is null or p_to_creed_id is null then
    raise exception 'credit_home_missing_creed';
  end if;
  if p_from_creed_id = p_to_creed_id then
    return;
  end if;

  insert into public.creed_credits (creed_id)
  values (p_from_creed_id)
  on conflict (creed_id) do nothing;

  insert into public.creed_credits (creed_id)
  values (p_to_creed_id)
  on conflict (creed_id) do nothing;

  select coalesce(granted_micro_usd, 0), grant_period_key, grant_period_start
    into v_granted, v_period_key, v_period_start
    from public.creed_credits
    where creed_id = p_from_creed_id
    for update;

  select coalesce(granted_micro_usd, 0)
    into v_to_granted
    from public.creed_credits
    where creed_id = p_to_creed_id
    for update;

  if v_granted = 0 then
    if v_period_key is not null and v_to_granted = 0 then
      update public.creed_credits
        set grant_period_key = v_period_key,
            grant_period_start = v_period_start,
            updated_at = timezone('utc'::text, now())
        where creed_id = p_to_creed_id;
    end if;

    update public.creed_credits
      set grant_period_key = null,
          grant_period_start = null,
          updated_at = timezone('utc'::text, now())
      where creed_id = p_from_creed_id;

    return;
  end if;

  update public.creed_credits
    set granted_micro_usd = v_to_granted + v_granted,
        grant_period_key = coalesce(v_period_key, grant_period_key),
        grant_period_start = coalesce(v_period_start, grant_period_start),
        updated_at = timezone('utc'::text, now())
    where creed_id = p_to_creed_id;

  update public.creed_credits
    set granted_micro_usd = 0,
        grant_period_key = null,
        grant_period_start = null,
        updated_at = timezone('utc'::text, now())
    where creed_id = p_from_creed_id;
end;
$$;


ALTER FUNCTION "public"."transfer_credit_home"("p_from_creed_id" "uuid", "p_to_creed_id" "uuid") OWNER TO "postgres";

--
-- Name: transfer_creed_ownership("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."transfer_creed_ownership"("p_creed_id" "uuid", "p_from" "uuid", "p_to" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  changed integer;
begin
  if p_creed_id is null or p_from is null or p_to is null then
    raise exception 'creed id, source owner, and target owner are required';
  end if;
  if p_from = p_to then
    raise exception 'target already owns this creed';
  end if;
  if not exists (
    select 1 from public.creeds
    where id = p_creed_id and type = 'shared' and owner_user_id = p_from
  ) then
    raise exception 'source user is not the shared owner';
  end if;
  if not exists (
    select 1 from public.creed_members
    where creed_id = p_creed_id and user_id = p_to and role in ('admin', 'member')
  ) then
    raise exception 'target user is not an active non-owner member';
  end if;
  update public.creed_members set role = 'admin'
    where creed_id = p_creed_id and user_id = p_from and role = 'owner';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'expected exactly one outgoing owner, got %', changed; end if;
  update public.creed_members set role = 'owner'
    where creed_id = p_creed_id and user_id = p_to and role in ('admin', 'member');
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'expected exactly one incoming owner, got %', changed; end if;
  update public.creeds set owner_user_id = p_to, updated_at = timezone('utc'::text, now())
    where id = p_creed_id and owner_user_id = p_from;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'expected exactly one creed owner row, got %', changed; end if;
end;
$$;


ALTER FUNCTION "public"."transfer_creed_ownership"("p_creed_id" "uuid", "p_from" "uuid", "p_to" "uuid") OWNER TO "postgres";

--
-- Name: update_creed_section_positions("uuid", "text"[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_creed_section_positions"("p_creed_id" "uuid", "p_section_ids" "text"[], "p_updated_at" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_updated integer;
begin
  if p_creed_id is null or p_section_ids is null then
    raise exception 'creed id and section ids are required';
  end if;

  if cardinality(p_section_ids) <> (
    select count(distinct section_id)
    from unnest(p_section_ids) as section_id
  ) then
    raise exception 'section ids must be unique';
  end if;

  if cardinality(p_section_ids) <> (
    select count(*)
    from public.creed_sections
    where creed_id = p_creed_id
      and deleted_at is null
  ) then
    raise exception 'section order must include every active section';
  end if;

  update public.creed_sections as section
  set position = ordered.position,
      updated_at = p_updated_at
  from (
    select section_id, (ordinality - 1)::integer as position
    from unnest(p_section_ids) with ordinality as input(section_id, ordinality)
  ) as ordered
  where section.creed_id = p_creed_id
    and section.section_id = ordered.section_id
    and section.deleted_at is null;

  get diagnostics v_updated = row_count;
  if v_updated <> cardinality(p_section_ids) then
    raise exception 'section order did not match the active Creed sections';
  end if;
  return v_updated;
end;
$$;


ALTER FUNCTION "public"."update_creed_section_positions"("p_creed_id" "uuid", "p_section_ids" "text"[], "p_updated_at" timestamp with time zone) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: creed_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_activity" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "proposal_id" "text",
    "section_id" "text",
    "section_name" "text",
    "accent" "text",
    "actor" "text" NOT NULL,
    "actor_type" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "status" "text" NOT NULL,
    "change_type" "text",
    "reason" "text",
    "impact" "text",
    "confidence" "text",
    "before_text" "text",
    "after_text" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "event_kind" "text" DEFAULT 'edit'::"text" NOT NULL,
    CONSTRAINT "creed_activity_event_kind_check" CHECK (("event_kind" = ANY (ARRAY['edit'::"text", 'proposal'::"text", 'membership'::"text", 'role'::"text", 'permission'::"text", 'billing'::"text", 'usage'::"text", 'byok'::"text", 'ownership'::"text", 'section-trash'::"text", 'restore'::"text"])))
);


ALTER TABLE "public"."creed_activity" OWNER TO "postgres";

--
-- Name: creed_ai_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_ai_settings" (
    "creed_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'openrouter'::"text" NOT NULL,
    "encrypted_api_key" "text",
    "api_key_hash" "text",
    "api_key_last_four" "text",
    "key_status" "text" DEFAULT 'missing'::"text" NOT NULL,
    "ai_mode" "text" DEFAULT 'credits'::"text" NOT NULL,
    "last_validated_at" timestamp with time zone,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creed_ai_settings_ai_mode_check" CHECK (("ai_mode" = ANY (ARRAY['credits'::"text", 'byok'::"text"]))),
    CONSTRAINT "creed_ai_settings_key_status_check" CHECK (("key_status" = ANY (ARRAY['missing'::"text", 'valid'::"text", 'invalid'::"text"])))
);


ALTER TABLE "public"."creed_ai_settings" OWNER TO "postgres";

--
-- Name: creed_ai_usage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_ai_usage" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feature" "text" NOT NULL,
    "provider" "text" DEFAULT 'openrouter'::"text" NOT NULL,
    "model_id" "text" NOT NULL,
    "model_quality" "text" NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "estimated_cost_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "ai_mode" "text" DEFAULT 'byok'::"text" NOT NULL,
    "charged_micro_usd" bigint,
    "creed_id" "uuid",
    CONSTRAINT "creed_ai_usage_ai_mode_check" CHECK (("ai_mode" = ANY (ARRAY['credits'::"text", 'byok'::"text"])))
);


ALTER TABLE "public"."creed_ai_usage" OWNER TO "postgres";

--
-- Name: creed_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creed_id" "uuid"
);


ALTER TABLE "public"."creed_audit_log" OWNER TO "postgres";

--
-- Name: creed_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_connections" (
    "user_id" "uuid" NOT NULL,
    "connection_id" "text" NOT NULL,
    "status" "text" DEFAULT 'not-connected'::"text" NOT NULL,
    "last_seen_at" timestamp with time zone,
    "last_agent_name" "text",
    "observed_via" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "creed_id" "uuid" NOT NULL
);


ALTER TABLE "public"."creed_connections" OWNER TO "postgres";

--
-- Name: creed_credit_homes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_credit_homes" (
    "user_id" "uuid" NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."creed_credit_homes" OWNER TO "postgres";

--
-- Name: TABLE "creed_credit_homes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."creed_credit_homes" IS 'Which owned Creed holds the account Cloud Bonus (granted) credits.';


--
-- Name: creed_credit_reservations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_credit_reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "reserved_granted_micro_usd" bigint NOT NULL,
    "reserved_purchased_micro_usd" bigint NOT NULL,
    "feature" "text" NOT NULL,
    "model_id" "text" NOT NULL,
    "spent_by_user_id" "uuid",
    "status" "text" DEFAULT 'reserved'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settled_at" timestamp with time zone,
    CONSTRAINT "creed_credit_reservations_reserved_granted_micro_usd_check" CHECK (("reserved_granted_micro_usd" >= 0)),
    CONSTRAINT "creed_credit_reservations_reserved_purchased_micro_usd_check" CHECK (("reserved_purchased_micro_usd" >= 0)),
    CONSTRAINT "creed_credit_reservations_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'settled'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."creed_credit_reservations" OWNER TO "postgres";

--
-- Name: creed_credit_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_credit_transactions" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "amount_micro_usd" bigint NOT NULL,
    "balance_after_micro_usd" bigint NOT NULL,
    "feature" "text",
    "model_id" "text",
    "stripe_payment_intent_id" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "bucket" "text",
    "grant_period_key" "text",
    "creed_id" "uuid" NOT NULL,
    "spent_by_user_id" "uuid",
    CONSTRAINT "creed_credit_transactions_amount_micro_usd_check" CHECK (("amount_micro_usd" >= 0)),
    CONSTRAINT "creed_credit_transactions_bucket_check" CHECK ((("bucket" IS NULL) OR ("bucket" = ANY (ARRAY['granted'::"text", 'purchased'::"text", 'mixed'::"text"])))),
    CONSTRAINT "creed_credit_transactions_check" CHECK ((("type" <> 'topup'::"text") OR ("stripe_payment_intent_id" IS NOT NULL))),
    CONSTRAINT "creed_credit_transactions_type_check" CHECK (("type" = ANY (ARRAY['topup'::"text", 'debit'::"text", 'grant'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."creed_credit_transactions" OWNER TO "postgres";

--
-- Name: creed_credits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_credits" (
    "balance_micro_usd" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "granted_micro_usd" bigint DEFAULT 0 NOT NULL,
    "purchased_micro_usd" bigint DEFAULT 0 NOT NULL,
    "grant_period_key" "text",
    "grant_period_start" timestamp with time zone,
    "creed_id" "uuid" NOT NULL
);


ALTER TABLE "public"."creed_credits" OWNER TO "postgres";

--
-- Name: creed_entitlements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_entitlements" (
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "status" "text" DEFAULT 'inactive'::"text" NOT NULL,
    "billing_interval" "text",
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "welcomed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "welcomed_personal_at" timestamp with time zone,
    "welcomed_shared_at" timestamp with time zone,
    CONSTRAINT "creed_entitlements_billing_interval_check" CHECK ((("billing_interval" IS NULL) OR ("billing_interval" = ANY (ARRAY['month'::"text", 'year'::"text"])))),
    CONSTRAINT "creed_entitlements_status_check" CHECK (("status" = ANY (ARRAY['inactive'::"text", 'active'::"text", 'trialing'::"text", 'past_due'::"text", 'canceled'::"text", 'incomplete'::"text"])))
);


ALTER TABLE "public"."creed_entitlements" OWNER TO "postgres";

--
-- Name: COLUMN "creed_entitlements"."welcomed_personal_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."creed_entitlements"."welcomed_personal_at" IS 'When the Personal welcome tour was dismissed for this entitlement.';


--
-- Name: COLUMN "creed_entitlements"."welcomed_shared_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."creed_entitlements"."welcomed_shared_at" IS 'When the Shared welcome tour was dismissed for this entitlement.';


--
-- Name: creed_getting_started; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_getting_started" (
    "user_id" "uuid" NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "steps" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "completed_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."creed_getting_started" OWNER TO "postgres";

--
-- Name: TABLE "creed_getting_started"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."creed_getting_started" IS 'Per-user, per-Creed Get started checklist progress and dismiss state.';


--
-- Name: creed_integrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_integrations" (
    "creed_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'github'::"text" NOT NULL,
    "status" "text" DEFAULT 'not-connected'::"text" NOT NULL,
    "provider_account_id" "text",
    "provider_login" "text",
    "encrypted_access_token" "text",
    "encrypted_refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "connected_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creed_integrations_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'not-connected'::"text", 'disconnected'::"text"])))
);


ALTER TABLE "public"."creed_integrations" OWNER TO "postgres";

--
-- Name: creed_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creed_invites_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "creed_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."creed_invites" OWNER TO "postgres";

--
-- Name: creed_mcp_clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_mcp_clients" (
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "creed_id" "uuid" NOT NULL
);


ALTER TABLE "public"."creed_mcp_clients" OWNER TO "postgres";

--
-- Name: creed_mcp_read_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_mcp_read_events" (
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "day" "date" NOT NULL,
    "read_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "creed_id" "uuid" NOT NULL
);


ALTER TABLE "public"."creed_mcp_read_events" OWNER TO "postgres";

--
-- Name: creed_member_agent_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_member_agent_permissions" (
    "creed_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "section_id" "text" NOT NULL,
    "permission" "text" DEFAULT 'propose'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creed_member_agent_permissions_permission_check" CHECK (("permission" = ANY (ARRAY['hidden'::"text", 'read-only'::"text", 'propose'::"text", 'direct'::"text"])))
);


ALTER TABLE "public"."creed_member_agent_permissions" OWNER TO "postgres";

--
-- Name: creed_member_section_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_member_section_permissions" (
    "creed_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "section_id" "text" NOT NULL,
    "permission" "text" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creed_member_section_permissions_permission_check" CHECK (("permission" = ANY (ARRAY['hidden'::"text", 'read-only'::"text", 'propose'::"text", 'direct'::"text"])))
);


ALTER TABLE "public"."creed_member_section_permissions" OWNER TO "postgres";

--
-- Name: creed_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_members" (
    "creed_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creed_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."creed_members" OWNER TO "postgres";

--
-- Name: creed_proposals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_proposals" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "section_id" "text" NOT NULL,
    "section_name" "text" NOT NULL,
    "accent" "text" NOT NULL,
    "agent_name" "text" NOT NULL,
    "change_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "impact" "text" NOT NULL,
    "confidence" "text" NOT NULL,
    "draft" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "base_revision" integer,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "author_user_id" "uuid"
);


ALTER TABLE "public"."creed_proposals" OWNER TO "postgres";

--
-- Name: creed_quality_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_quality_reports" (
    "user_id" "uuid",
    "content_hash" "text" NOT NULL,
    "model_id" "text" NOT NULL,
    "report" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "section_hashes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."creed_quality_reports" OWNER TO "postgres";

--
-- Name: creed_quality_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_quality_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "shared_creed_id" "uuid",
    "request_key" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "request_sections" "jsonb",
    "target_section_ids" "jsonb",
    "force" boolean DEFAULT false NOT NULL,
    "error_message" "text",
    "credit_balance_usd" numeric(12,6),
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creed_quality_runs_shared_scope_check" CHECK ((("shared_creed_id" IS NULL) OR ("shared_creed_id" = "creed_id"))),
    CONSTRAINT "creed_quality_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "creed_quality_runs_terminal_shape_check" CHECK (((("status" = ANY (ARRAY['queued'::"text", 'running'::"text"])) AND ("request_sections" IS NOT NULL) AND ("completed_at" IS NULL)) OR (("status" = ANY (ARRAY['completed'::"text", 'failed'::"text"])) AND ("request_sections" IS NULL) AND ("completed_at" IS NOT NULL))))
);


ALTER TABLE "public"."creed_quality_runs" OWNER TO "postgres";

--
-- Name: creed_section_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_section_versions" (
    "id" bigint NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "section_id" "text" NOT NULL,
    "revision" integer NOT NULL,
    "name" "text" NOT NULL,
    "accent" "text" NOT NULL,
    "content" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_type" "text" NOT NULL,
    "agent_name" "text",
    "cause" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creed_section_versions_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['user'::"text", 'agent'::"text"]))),
    CONSTRAINT "creed_section_versions_cause_check" CHECK (("cause" = ANY (ARRAY['manual'::"text", 'mcp'::"text", 'proposal'::"text", 'restore'::"text", 'import'::"text", 'onboarding'::"text"])))
);


ALTER TABLE "public"."creed_section_versions" OWNER TO "postgres";

--
-- Name: creed_section_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_section_versions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."creed_section_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: creed_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_sections" (
    "user_id" "uuid" NOT NULL,
    "section_id" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "kind" "text" NOT NULL,
    "name" "text" NOT NULL,
    "accent" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_edited_by" "text" NOT NULL,
    "last_edited_type" "text" NOT NULL,
    "last_edited_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "revision" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "agent_writable" boolean DEFAULT false NOT NULL,
    "template" "text" DEFAULT 'freeform'::"text" NOT NULL,
    "agent_permission" "text" DEFAULT 'propose'::"text" NOT NULL,
    "archived_at" timestamp with time zone,
    "creed_id" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "creed_sections_agent_permission_check" CHECK (("agent_permission" = ANY (ARRAY['hidden'::"text", 'read-only'::"text", 'propose'::"text", 'direct'::"text"])))
);


ALTER TABLE "public"."creed_sections" OWNER TO "postgres";

--
-- Name: creed_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_tokens" (
    "creed_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_token" "text",
    "proposal_token" "text",
    "require_approval" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "read_token_hash" "text",
    "proposal_token_hash" "text",
    "direct_edit_token" "text",
    "direct_edit_token_hash" "text",
    "encrypted_read_token" "text",
    "encrypted_proposal_token" "text",
    "encrypted_direct_edit_token" "text"
);


ALTER TABLE "public"."creed_tokens" OWNER TO "postgres";

--
-- Name: creed_version_control; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creed_version_control" (
    "creed_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'github'::"text" NOT NULL,
    "configured_by" "uuid",
    "repo_owner" "text",
    "repo_name" "text",
    "branch" "text",
    "path" "text" DEFAULT 'creed.md'::"text" NOT NULL,
    "last_remote_sha" "text",
    "last_remote_message" "text",
    "last_remote_committed_at" timestamp with time zone,
    "last_synced_content_hash" "text",
    "sync_status" "text" DEFAULT 'not-configured'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."creed_version_control" OWNER TO "postgres";

--
-- Name: creeds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."creeds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "onboarding_stage" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "avatar_url" "text",
    "sync_updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creeds_type_check" CHECK (("type" = ANY (ARRAY['personal'::"text", 'shared'::"text"])))
);


ALTER TABLE "public"."creeds" OWNER TO "postgres";

--
-- Name: oauth_authorization_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."oauth_authorization_codes" (
    "code_hash" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "redirect_uri" "text" NOT NULL,
    "code_challenge" "text" NOT NULL,
    "scope" "text" DEFAULT 'read propose'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "creed_grants" "jsonb",
    "resource" "text"
);


ALTER TABLE "public"."oauth_authorization_codes" OWNER TO "postgres";

--
-- Name: oauth_clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."oauth_clients" (
    "client_id" "text" NOT NULL,
    "client_name" "text" DEFAULT 'MCP Client'::"text" NOT NULL,
    "redirect_uris" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."oauth_clients" OWNER TO "postgres";

--
-- Name: oauth_token_creeds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."oauth_token_creeds" (
    "token_id" "uuid" NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "mode" "text" DEFAULT 'proposal-only'::"text" NOT NULL,
    CONSTRAINT "oauth_token_creeds_mode_check" CHECK (("mode" = ANY (ARRAY['read-only'::"text", 'proposal-only'::"text", 'direct'::"text"])))
);


ALTER TABLE "public"."oauth_token_creeds" OWNER TO "postgres";

--
-- Name: oauth_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."oauth_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "access_token_hash" "text" NOT NULL,
    "refresh_token_hash" "text" NOT NULL,
    "encrypted_access_token" "text" NOT NULL,
    "encrypted_refresh_token" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'read propose'::"text" NOT NULL,
    "access_expires_at" timestamp with time zone NOT NULL,
    "refresh_expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "resource" "text",
    "authorization_code_hash" "text",
    "parent_token_id" "uuid",
    "ready_at" timestamp with time zone
);


ALTER TABLE "public"."oauth_tokens" OWNER TO "postgres";


--
-- Name: COLUMN "oauth_tokens"."authorization_code_hash"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."oauth_tokens"."authorization_code_hash" IS 'Idempotency key that lets a valid authorization-code exchange return its already-issued token pair after a lost response.';


--
-- Name: COLUMN "oauth_tokens"."parent_token_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."oauth_tokens"."parent_token_id" IS 'The refresh-token row replaced by this row; unique to prevent concurrent refreshes from minting competing successors.';


--
-- Name: COLUMN "oauth_tokens"."ready_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."oauth_tokens"."ready_at" IS 'Set only after the token row and its Creed grants are fully persisted, so retries never observe a partial token.';

--
-- Name: rate_limit_hits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."rate_limit_hits" (
    "key" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "hit_count" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rate_limit_hits_hit_count_check" CHECK (("hit_count" >= 0))
);


ALTER TABLE "public"."rate_limit_hits" OWNER TO "postgres";

--
-- Name: sponsor_donations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."sponsor_donations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sponsor_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "stripe_payment_intent_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "attempt_id" "uuid",
    "succeeded_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "amount_refunded_cents" integer DEFAULT 0 NOT NULL,
    "refund_event_created" bigint,
    "dispute_status" "text",
    "dispute_event_created" bigint,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "sponsor_donations_amount_cents_check" CHECK ((("amount_cents" >= 500) AND ("amount_cents" <= 500000))),
    CONSTRAINT "sponsor_donations_refund_check" CHECK ((("amount_refunded_cents" >= 0) AND ("amount_refunded_cents" <= "amount_cents"))),
    CONSTRAINT "sponsor_donations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'succeeded'::"text", 'failed'::"text", 'refunded'::"text", 'disputed'::"text"]))),
    CONSTRAINT "sponsor_donations_stripe_payment_intent_id_check" CHECK ((("char_length"("btrim"("stripe_payment_intent_id")) >= 1) AND ("char_length"("btrim"("stripe_payment_intent_id")) <= 255)))
);


ALTER TABLE "public"."sponsor_donations" OWNER TO "postgres";

--
-- Name: sponsors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."sponsors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text",
    "avatar_path" "text",
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "anonymous_key_hash" "text",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "sponsors_avatar_path_check" CHECK ((("avatar_path" IS NULL) OR (("char_length"("btrim"("avatar_path")) >= 1) AND ("char_length"("btrim"("avatar_path")) <= 512)))),
    CONSTRAINT "sponsors_identity_check" CHECK ((NOT (("user_id" IS NOT NULL) AND ("anonymous_key_hash" IS NOT NULL)))),
    CONSTRAINT "sponsors_message_check" CHECK ((("message" IS NULL) OR (("char_length"("btrim"("message")) >= 1) AND ("char_length"("btrim"("message")) <= 240)))),
    CONSTRAINT "sponsors_name_check" CHECK ((("name" IS NULL) OR (("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 50))))
);


ALTER TABLE "public"."sponsors" OWNER TO "postgres";

--
-- Name: creed_activity creed_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_activity"
    ADD CONSTRAINT "creed_activity_pkey" PRIMARY KEY ("id");


--
-- Name: creed_ai_settings creed_ai_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_ai_settings"
    ADD CONSTRAINT "creed_ai_settings_pkey" PRIMARY KEY ("creed_id");


--
-- Name: creed_ai_usage creed_ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_ai_usage"
    ADD CONSTRAINT "creed_ai_usage_pkey" PRIMARY KEY ("id");


--
-- Name: creed_audit_log creed_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_audit_log"
    ADD CONSTRAINT "creed_audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: creed_connections creed_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_connections"
    ADD CONSTRAINT "creed_connections_pkey" PRIMARY KEY ("creed_id", "connection_id");


--
-- Name: creed_credit_homes creed_credit_homes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credit_homes"
    ADD CONSTRAINT "creed_credit_homes_pkey" PRIMARY KEY ("user_id");


--
-- Name: creed_credit_reservations creed_credit_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credit_reservations"
    ADD CONSTRAINT "creed_credit_reservations_pkey" PRIMARY KEY ("id");


--
-- Name: creed_credit_transactions creed_credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credit_transactions"
    ADD CONSTRAINT "creed_credit_transactions_pkey" PRIMARY KEY ("id");


--
-- Name: creed_credit_transactions creed_credit_transactions_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credit_transactions"
    ADD CONSTRAINT "creed_credit_transactions_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");


--
-- Name: creed_credits creed_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credits"
    ADD CONSTRAINT "creed_credits_pkey" PRIMARY KEY ("creed_id");


--
-- Name: creed_entitlements creed_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_entitlements"
    ADD CONSTRAINT "creed_entitlements_pkey" PRIMARY KEY ("user_id");


--
-- Name: creed_entitlements creed_entitlements_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_entitlements"
    ADD CONSTRAINT "creed_entitlements_stripe_customer_id_key" UNIQUE ("stripe_customer_id");


--
-- Name: creed_entitlements creed_entitlements_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_entitlements"
    ADD CONSTRAINT "creed_entitlements_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");


--
-- Name: creed_getting_started creed_getting_started_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_getting_started"
    ADD CONSTRAINT "creed_getting_started_pkey" PRIMARY KEY ("user_id", "creed_id");


--
-- Name: creed_integrations creed_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_integrations"
    ADD CONSTRAINT "creed_integrations_pkey" PRIMARY KEY ("creed_id", "provider");


--
-- Name: creed_invites creed_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_invites"
    ADD CONSTRAINT "creed_invites_pkey" PRIMARY KEY ("id");


--
-- Name: creed_invites creed_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_invites"
    ADD CONSTRAINT "creed_invites_token_hash_key" UNIQUE ("token_hash");


--
-- Name: creed_mcp_clients creed_mcp_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_mcp_clients"
    ADD CONSTRAINT "creed_mcp_clients_pkey" PRIMARY KEY ("creed_id", "client_id");


--
-- Name: creed_mcp_read_events creed_mcp_read_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_mcp_read_events"
    ADD CONSTRAINT "creed_mcp_read_events_pkey" PRIMARY KEY ("creed_id", "client_id", "day");


--
-- Name: creed_member_agent_permissions creed_member_agent_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_member_agent_permissions"
    ADD CONSTRAINT "creed_member_agent_permissions_pkey" PRIMARY KEY ("creed_id", "user_id", "section_id");


--
-- Name: creed_member_section_permissions creed_member_section_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_member_section_permissions"
    ADD CONSTRAINT "creed_member_section_permissions_pkey" PRIMARY KEY ("creed_id", "user_id", "section_id");


--
-- Name: creed_members creed_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_members"
    ADD CONSTRAINT "creed_members_pkey" PRIMARY KEY ("creed_id", "user_id");


--
-- Name: creed_proposals creed_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_proposals"
    ADD CONSTRAINT "creed_proposals_pkey" PRIMARY KEY ("id");


--
-- Name: creed_quality_reports creed_quality_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_quality_reports"
    ADD CONSTRAINT "creed_quality_reports_pkey" PRIMARY KEY ("creed_id");


--
-- Name: creed_quality_runs creed_quality_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_quality_runs"
    ADD CONSTRAINT "creed_quality_runs_pkey" PRIMARY KEY ("id");


--
-- Name: creed_section_versions creed_section_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_section_versions"
    ADD CONSTRAINT "creed_section_versions_pkey" PRIMARY KEY ("id");


--
-- Name: creed_sections creed_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_sections"
    ADD CONSTRAINT "creed_sections_pkey" PRIMARY KEY ("creed_id", "section_id");


--
-- Name: creed_tokens creed_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_tokens"
    ADD CONSTRAINT "creed_tokens_pkey" PRIMARY KEY ("creed_id");


--
-- Name: creed_version_control creed_version_control_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_version_control"
    ADD CONSTRAINT "creed_version_control_pkey" PRIMARY KEY ("creed_id");


--
-- Name: creeds creeds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creeds"
    ADD CONSTRAINT "creeds_pkey" PRIMARY KEY ("id");


--
-- Name: oauth_authorization_codes oauth_authorization_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("code_hash");


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_clients"
    ADD CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("client_id");


--
-- Name: oauth_token_creeds oauth_token_creeds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_token_creeds"
    ADD CONSTRAINT "oauth_token_creeds_pkey" PRIMARY KEY ("token_id", "creed_id");


--
-- Name: oauth_tokens oauth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: rate_limit_hits rate_limit_hits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rate_limit_hits"
    ADD CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("key");


--
-- Name: sponsor_donations sponsor_donations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sponsor_donations"
    ADD CONSTRAINT "sponsor_donations_pkey" PRIMARY KEY ("id");


--
-- Name: sponsor_donations sponsor_donations_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sponsor_donations"
    ADD CONSTRAINT "sponsor_donations_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");


--
-- Name: sponsors sponsors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sponsors"
    ADD CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id");


--
-- Name: creed_activity_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_activity_created_idx" ON "public"."creed_activity" USING "btree" ("created_at");


--
-- Name: creed_activity_creed_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_activity_creed_created_idx" ON "public"."creed_activity" USING "btree" ("creed_id", "created_at" DESC);


--
-- Name: creed_activity_proposal_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_activity_proposal_id_idx" ON "public"."creed_activity" USING "btree" ("proposal_id");


--
-- Name: creed_activity_user_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_activity_user_created_idx" ON "public"."creed_activity" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: creed_ai_usage_creed_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_ai_usage_creed_created_idx" ON "public"."creed_ai_usage" USING "btree" ("creed_id", "created_at" DESC);


--
-- Name: creed_ai_usage_user_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_ai_usage_user_created_idx" ON "public"."creed_ai_usage" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: creed_audit_log_action_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_audit_log_action_created_at_idx" ON "public"."creed_audit_log" USING "btree" ("action", "created_at" DESC);


--
-- Name: creed_audit_log_creed_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_audit_log_creed_created_idx" ON "public"."creed_audit_log" USING "btree" ("creed_id", "created_at" DESC);


--
-- Name: creed_audit_log_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_audit_log_user_id_created_at_idx" ON "public"."creed_audit_log" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: creed_connections_creed_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_connections_creed_updated_idx" ON "public"."creed_connections" USING "btree" ("creed_id", "updated_at" DESC);


--
-- Name: creed_connections_user_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_connections_user_updated_idx" ON "public"."creed_connections" USING "btree" ("user_id", "updated_at" DESC);


--
-- Name: creed_credit_homes_creed_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_credit_homes_creed_id_idx" ON "public"."creed_credit_homes" USING "btree" ("creed_id");


--
-- Name: creed_credit_reservations_open_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_credit_reservations_open_idx" ON "public"."creed_credit_reservations" USING "btree" ("creed_id", "created_at") WHERE ("status" = 'reserved'::"text");


--
-- Name: creed_credit_reservations_spent_by_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_credit_reservations_spent_by_idx" ON "public"."creed_credit_reservations" USING "btree" ("spent_by_user_id") WHERE ("spent_by_user_id" IS NOT NULL);


--
-- Name: creed_credit_transactions_creed_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_credit_transactions_creed_created_idx" ON "public"."creed_credit_transactions" USING "btree" ("creed_id", "created_at" DESC);


--
-- Name: creed_credit_transactions_grant_period_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "creed_credit_transactions_grant_period_idx" ON "public"."creed_credit_transactions" USING "btree" ("creed_id", "grant_period_key") WHERE ("type" = 'grant'::"text");


--
-- Name: creed_getting_started_creed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_getting_started_creed_idx" ON "public"."creed_getting_started" USING "btree" ("creed_id");


--
-- Name: creed_integrations_creed_provider_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_integrations_creed_provider_idx" ON "public"."creed_integrations" USING "btree" ("creed_id", "provider");


--
-- Name: creed_invites_creed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_invites_creed_idx" ON "public"."creed_invites" USING "btree" ("creed_id");


--
-- Name: creed_invites_one_pending_per_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "creed_invites_one_pending_per_email" ON "public"."creed_invites" USING "btree" ("creed_id", "lower"("email")) WHERE ("status" = 'pending'::"text");


--
-- Name: creed_mcp_clients_creed_last_seen_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_mcp_clients_creed_last_seen_idx" ON "public"."creed_mcp_clients" USING "btree" ("creed_id", "last_seen_at" DESC);


--
-- Name: creed_mcp_clients_user_last_seen_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_mcp_clients_user_last_seen_idx" ON "public"."creed_mcp_clients" USING "btree" ("user_id", "last_seen_at" DESC);


--
-- Name: creed_mcp_read_events_creed_day_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_mcp_read_events_creed_day_idx" ON "public"."creed_mcp_read_events" USING "btree" ("creed_id", "day" DESC);


--
-- Name: creed_mcp_read_events_user_day_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_mcp_read_events_user_day_idx" ON "public"."creed_mcp_read_events" USING "btree" ("user_id", "day" DESC);


--
-- Name: creed_member_agent_permissions_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_member_agent_permissions_user_id_idx" ON "public"."creed_member_agent_permissions" USING "btree" ("user_id");


--
-- Name: creed_member_section_permissions_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_member_section_permissions_user_idx" ON "public"."creed_member_section_permissions" USING "btree" ("user_id");


--
-- Name: creed_members_one_owner_per_creed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "creed_members_one_owner_per_creed" ON "public"."creed_members" USING "btree" ("creed_id") WHERE ("role" = 'owner'::"text");


--
-- Name: creed_members_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_members_user_idx" ON "public"."creed_members" USING "btree" ("user_id");


--
-- Name: creed_proposals_creed_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_proposals_creed_created_idx" ON "public"."creed_proposals" USING "btree" ("creed_id", "created_at" DESC);


--
-- Name: creed_proposals_creed_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_proposals_creed_status_idx" ON "public"."creed_proposals" USING "btree" ("creed_id", "status");


--
-- Name: creed_proposals_user_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_proposals_user_created_idx" ON "public"."creed_proposals" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: creed_proposals_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_proposals_user_id_idx" ON "public"."creed_proposals" USING "btree" ("user_id");


--
-- Name: creed_quality_reports_creed_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_quality_reports_creed_hash_idx" ON "public"."creed_quality_reports" USING "btree" ("creed_id", "content_hash");


--
-- Name: creed_quality_reports_user_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_quality_reports_user_hash_idx" ON "public"."creed_quality_reports" USING "btree" ("user_id", "content_hash");


--
-- Name: creed_quality_runs_creed_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_quality_runs_creed_created_idx" ON "public"."creed_quality_runs" USING "btree" ("creed_id", "created_at" DESC);


--
-- Name: creed_quality_runs_one_active_request_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "creed_quality_runs_one_active_request_idx" ON "public"."creed_quality_runs" USING "btree" ("creed_id", "request_key") WHERE ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"]));


--
-- Name: creed_quality_runs_one_running_per_creed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "creed_quality_runs_one_running_per_creed_idx" ON "public"."creed_quality_runs" USING "btree" ("creed_id") WHERE ("status" = 'running'::"text");


--
-- Name: creed_section_versions_lookup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_section_versions_lookup_idx" ON "public"."creed_section_versions" USING "btree" ("creed_id", "section_id", "id" DESC);


--
-- Name: creed_sections_creed_position_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_sections_creed_position_idx" ON "public"."creed_sections" USING "btree" ("creed_id", "position");


--
-- Name: creed_sections_template_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_sections_template_idx" ON "public"."creed_sections" USING "btree" ("template");


--
-- Name: creed_sections_user_position_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creed_sections_user_position_idx" ON "public"."creed_sections" USING "btree" ("user_id", "position");


--
-- Name: creed_tokens_direct_edit_token_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "creed_tokens_direct_edit_token_hash_idx" ON "public"."creed_tokens" USING "btree" ("direct_edit_token_hash") WHERE ("direct_edit_token_hash" IS NOT NULL);


--
-- Name: creed_tokens_proposal_token_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "creed_tokens_proposal_token_hash_idx" ON "public"."creed_tokens" USING "btree" ("proposal_token_hash") WHERE ("proposal_token_hash" IS NOT NULL);


--
-- Name: creed_tokens_read_token_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "creed_tokens_read_token_hash_idx" ON "public"."creed_tokens" USING "btree" ("read_token_hash") WHERE ("read_token_hash" IS NOT NULL);


--
-- Name: creeds_owner_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "creeds_owner_idx" ON "public"."creeds" USING "btree" ("owner_user_id");


--
-- Name: oauth_authorization_codes_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "oauth_authorization_codes_user_idx" ON "public"."oauth_authorization_codes" USING "btree" ("user_id");


--
-- Name: oauth_token_creeds_creed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "oauth_token_creeds_creed_idx" ON "public"."oauth_token_creeds" USING "btree" ("creed_id");


--
-- Name: oauth_tokens_access_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "oauth_tokens_access_hash_idx" ON "public"."oauth_tokens" USING "btree" ("access_token_hash");


--
-- Name: oauth_tokens_authorization_code_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "oauth_tokens_authorization_code_hash_idx" ON "public"."oauth_tokens" USING "btree" ("authorization_code_hash") WHERE ("authorization_code_hash" IS NOT NULL);


--
-- Name: oauth_tokens_parent_token_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "oauth_tokens_parent_token_id_idx" ON "public"."oauth_tokens" USING "btree" ("parent_token_id") WHERE ("parent_token_id" IS NOT NULL);


--
-- Name: oauth_tokens_refresh_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "oauth_tokens_refresh_hash_idx" ON "public"."oauth_tokens" USING "btree" ("refresh_token_hash");


--
-- Name: oauth_tokens_user_client_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "oauth_tokens_user_client_idx" ON "public"."oauth_tokens" USING "btree" ("user_id", "client_id");


--
-- Name: rate_limit_hits_updated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "rate_limit_hits_updated_at_idx" ON "public"."rate_limit_hits" USING "btree" ("updated_at");


--
-- Name: sponsor_donations_abandoned_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sponsor_donations_abandoned_idx" ON "public"."sponsor_donations" USING "btree" ("created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));


--
-- Name: sponsor_donations_attempt_id_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "sponsor_donations_attempt_id_unique" ON "public"."sponsor_donations" USING "btree" ("attempt_id") WHERE ("attempt_id" IS NOT NULL);


--
-- Name: sponsor_donations_sponsor_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sponsor_donations_sponsor_id_created_at_idx" ON "public"."sponsor_donations" USING "btree" ("sponsor_id", "created_at" DESC);


--
-- Name: sponsors_anonymous_key_hash_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "sponsors_anonymous_key_hash_unique" ON "public"."sponsors" USING "btree" ("anonymous_key_hash") WHERE ("anonymous_key_hash" IS NOT NULL);


--
-- Name: sponsors_user_id_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "sponsors_user_id_unique" ON "public"."sponsors" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);


--
-- Name: oauth_clients guard_oauth_client_registration; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "guard_oauth_client_registration" BEFORE INSERT ON "public"."oauth_clients" FOR EACH STATEMENT EXECUTE FUNCTION "public"."guard_oauth_client_registration"();


--
-- Name: creed_ai_settings touch_creed_sync_tick; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "touch_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_ai_settings" FOR EACH ROW EXECUTE FUNCTION "private"."touch_creed_sync_tick"();


--
-- Name: creed_integrations touch_creed_sync_tick; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "touch_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_integrations" FOR EACH ROW EXECUTE FUNCTION "private"."touch_creed_sync_tick"();


--
-- Name: creed_tokens touch_creed_sync_tick; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "touch_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_tokens" FOR EACH ROW EXECUTE FUNCTION "private"."touch_creed_sync_tick"();


--
-- Name: creed_version_control touch_creed_sync_tick; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "touch_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_version_control" FOR EACH ROW EXECUTE FUNCTION "private"."touch_creed_sync_tick"();


--
-- Name: creed_getting_started touch_getting_started_creed_sync_tick; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "touch_getting_started_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_getting_started" FOR EACH ROW EXECUTE FUNCTION "private"."touch_getting_started_creed_sync_tick"();


--
-- Name: creed_activity creed_activity_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_activity"
    ADD CONSTRAINT "creed_activity_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_activity creed_activity_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_activity"
    ADD CONSTRAINT "creed_activity_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."creed_proposals"("id") ON DELETE SET NULL;


--
-- Name: creed_activity creed_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_activity"
    ADD CONSTRAINT "creed_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_ai_settings creed_ai_settings_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_ai_settings"
    ADD CONSTRAINT "creed_ai_settings_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_ai_settings creed_ai_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_ai_settings"
    ADD CONSTRAINT "creed_ai_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: creed_ai_usage creed_ai_usage_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_ai_usage"
    ADD CONSTRAINT "creed_ai_usage_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_ai_usage creed_ai_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_ai_usage"
    ADD CONSTRAINT "creed_ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_audit_log creed_audit_log_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_audit_log"
    ADD CONSTRAINT "creed_audit_log_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_audit_log creed_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_audit_log"
    ADD CONSTRAINT "creed_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_connections creed_connections_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_connections"
    ADD CONSTRAINT "creed_connections_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_connections creed_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_connections"
    ADD CONSTRAINT "creed_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_credit_homes creed_credit_homes_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credit_homes"
    ADD CONSTRAINT "creed_credit_homes_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE RESTRICT;


--
-- Name: creed_credit_homes creed_credit_homes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credit_homes"
    ADD CONSTRAINT "creed_credit_homes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_credit_reservations creed_credit_reservations_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credit_reservations"
    ADD CONSTRAINT "creed_credit_reservations_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_credit_reservations creed_credit_reservations_spent_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credit_reservations"
    ADD CONSTRAINT "creed_credit_reservations_spent_by_user_id_fkey" FOREIGN KEY ("spent_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: creed_credit_transactions creed_credit_transactions_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credit_transactions"
    ADD CONSTRAINT "creed_credit_transactions_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_credits creed_credits_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_credits"
    ADD CONSTRAINT "creed_credits_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_entitlements creed_entitlements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_entitlements"
    ADD CONSTRAINT "creed_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_getting_started creed_getting_started_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_getting_started"
    ADD CONSTRAINT "creed_getting_started_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_getting_started creed_getting_started_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_getting_started"
    ADD CONSTRAINT "creed_getting_started_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_integrations creed_integrations_connected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_integrations"
    ADD CONSTRAINT "creed_integrations_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: creed_integrations creed_integrations_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_integrations"
    ADD CONSTRAINT "creed_integrations_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_invites creed_invites_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_invites"
    ADD CONSTRAINT "creed_invites_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_mcp_clients creed_mcp_clients_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_mcp_clients"
    ADD CONSTRAINT "creed_mcp_clients_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_mcp_clients creed_mcp_clients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_mcp_clients"
    ADD CONSTRAINT "creed_mcp_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_mcp_read_events creed_mcp_read_events_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_mcp_read_events"
    ADD CONSTRAINT "creed_mcp_read_events_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_mcp_read_events creed_mcp_read_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_mcp_read_events"
    ADD CONSTRAINT "creed_mcp_read_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_member_agent_permissions creed_member_agent_permissions_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_member_agent_permissions"
    ADD CONSTRAINT "creed_member_agent_permissions_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_member_agent_permissions creed_member_agent_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_member_agent_permissions"
    ADD CONSTRAINT "creed_member_agent_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_member_section_permissions creed_member_section_permissions_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_member_section_permissions"
    ADD CONSTRAINT "creed_member_section_permissions_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_member_section_permissions creed_member_section_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_member_section_permissions"
    ADD CONSTRAINT "creed_member_section_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_members creed_members_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_members"
    ADD CONSTRAINT "creed_members_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_members creed_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_members"
    ADD CONSTRAINT "creed_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_proposals creed_proposals_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_proposals"
    ADD CONSTRAINT "creed_proposals_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_proposals creed_proposals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_proposals"
    ADD CONSTRAINT "creed_proposals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_quality_reports creed_quality_reports_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_quality_reports"
    ADD CONSTRAINT "creed_quality_reports_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_quality_reports creed_quality_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_quality_reports"
    ADD CONSTRAINT "creed_quality_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_quality_runs creed_quality_runs_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_quality_runs"
    ADD CONSTRAINT "creed_quality_runs_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_quality_runs creed_quality_runs_shared_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_quality_runs"
    ADD CONSTRAINT "creed_quality_runs_shared_creed_id_fkey" FOREIGN KEY ("shared_creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_quality_runs creed_quality_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_quality_runs"
    ADD CONSTRAINT "creed_quality_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_section_versions creed_section_versions_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_section_versions"
    ADD CONSTRAINT "creed_section_versions_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_sections creed_sections_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_sections"
    ADD CONSTRAINT "creed_sections_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_sections creed_sections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_sections"
    ADD CONSTRAINT "creed_sections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_tokens creed_tokens_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_tokens"
    ADD CONSTRAINT "creed_tokens_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creed_tokens creed_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_tokens"
    ADD CONSTRAINT "creed_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: creed_version_control creed_version_control_configured_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_version_control"
    ADD CONSTRAINT "creed_version_control_configured_by_fkey" FOREIGN KEY ("configured_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: creed_version_control creed_version_control_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creed_version_control"
    ADD CONSTRAINT "creed_version_control_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: creeds creeds_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."creeds"
    ADD CONSTRAINT "creeds_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: oauth_authorization_codes oauth_authorization_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: oauth_token_creeds oauth_token_creeds_creed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_token_creeds"
    ADD CONSTRAINT "oauth_token_creeds_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;


--
-- Name: oauth_token_creeds oauth_token_creeds_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_token_creeds"
    ADD CONSTRAINT "oauth_token_creeds_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "public"."oauth_tokens"("id") ON DELETE CASCADE;


--
-- Name: oauth_tokens oauth_tokens_parent_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_parent_token_id_fkey" FOREIGN KEY ("parent_token_id") REFERENCES "public"."oauth_tokens"("id") ON DELETE SET NULL;


--
-- Name: oauth_tokens oauth_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: sponsor_donations sponsor_donations_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sponsor_donations"
    ADD CONSTRAINT "sponsor_donations_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE CASCADE;


--
-- Name: sponsors sponsors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sponsors"
    ADD CONSTRAINT "sponsors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: creed_getting_started Users insert own getting started; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users insert own getting started" ON "public"."creed_getting_started" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."creed_members" "membership"
  WHERE (("membership"."creed_id" = "creed_getting_started"."creed_id") AND ("membership"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));


--
-- Name: creed_getting_started Users read own getting started; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users read own getting started" ON "public"."creed_getting_started" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: creed_getting_started Users update own getting started; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users update own getting started" ON "public"."creed_getting_started" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: creed_activity; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_activity" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_ai_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_ai_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_ai_usage; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_ai_usage" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_audit_log creed_audit_log_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "creed_audit_log_select_own" ON "public"."creed_audit_log" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: creed_connections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_connections" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_credit_homes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_credit_homes" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_credit_reservations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_credit_reservations" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_credit_transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_credit_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_credits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_credits" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_entitlements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_entitlements" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_getting_started; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_getting_started" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_integrations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_integrations" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_invites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_invites" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_mcp_clients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_mcp_clients" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_mcp_read_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_mcp_read_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_member_agent_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_member_agent_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_member_section_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_member_section_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_proposals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_proposals" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_quality_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_quality_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_quality_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_quality_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_section_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_section_versions" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_sections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_sections" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_version_control; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creed_version_control" ENABLE ROW LEVEL SECURITY;

--
-- Name: creeds; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."creeds" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_integrations managers delete creed integrations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "managers delete creed integrations" ON "public"."creed_integrations" FOR DELETE TO "authenticated" USING (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));


--
-- Name: creed_version_control managers delete creed version control; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "managers delete creed version control" ON "public"."creed_version_control" FOR DELETE TO "authenticated" USING (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));


--
-- Name: creed_version_control managers insert creed version control; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "managers insert creed version control" ON "public"."creed_version_control" FOR INSERT TO "authenticated" WITH CHECK (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));


--
-- Name: creed_integrations managers manage creed integrations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "managers manage creed integrations" ON "public"."creed_integrations" FOR INSERT TO "authenticated" WITH CHECK (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));


--
-- Name: creed_integrations managers update creed integrations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "managers update creed integrations" ON "public"."creed_integrations" FOR UPDATE TO "authenticated" USING (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));


--
-- Name: creed_version_control managers update creed version control; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "managers update creed version control" ON "public"."creed_version_control" FOR UPDATE TO "authenticated" USING (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));


--
-- Name: creed_connections members read connections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read connections" ON "public"."creed_connections" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));


--
-- Name: creed_credit_transactions members read credit transactions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read credit transactions" ON "public"."creed_credit_transactions" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));


--
-- Name: creed_credits members read credits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read credits" ON "public"."creed_credits" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));


--
-- Name: creed_integrations members read creed integrations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read creed integrations" ON "public"."creed_integrations" FOR SELECT TO "authenticated" USING (("private"."creed_role"("creed_id") IS NOT NULL));


--
-- Name: creed_version_control members read creed version control; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read creed version control" ON "public"."creed_version_control" FOR SELECT TO "authenticated" USING (("private"."creed_role"("creed_id") IS NOT NULL));


--
-- Name: creed_mcp_clients members read mcp clients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read mcp clients" ON "public"."creed_mcp_clients" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));


--
-- Name: creed_mcp_read_events members read mcp read events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read mcp read events" ON "public"."creed_mcp_read_events" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("private"."creed_role"("creed_id") IS NOT NULL)));


--
-- Name: creed_member_agent_permissions members read own agent permissions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read own agent permissions" ON "public"."creed_member_agent_permissions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: creed_quality_reports members read quality reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read quality reports" ON "public"."creed_quality_reports" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));


--
-- Name: creed_members members read their creed roster; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read their creed roster" ON "public"."creed_members" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));


--
-- Name: creeds members read their creeds; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read their creeds" ON "public"."creeds" FOR SELECT USING (("private"."creed_role"("id") IS NOT NULL));


--
-- Name: creed_activity members read visible activity; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read visible activity" ON "public"."creed_activity" FOR SELECT USING ((("private"."creed_role"("creed_id") IS NOT NULL) AND (("section_id" IS NULL) OR ("private"."creed_section_permission"("creed_id", "section_id") IS DISTINCT FROM 'hidden'::"text")) AND (("event_kind" <> 'billing'::"text") OR ("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))));


--
-- Name: creed_proposals members read visible proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read visible proposals" ON "public"."creed_proposals" FOR SELECT USING ((("private"."creed_role"("creed_id") IS NOT NULL) AND ("private"."creed_section_permission"("creed_id", "section_id") IS DISTINCT FROM 'hidden'::"text")));


--
-- Name: creed_section_versions members read visible section versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read visible section versions" ON "public"."creed_section_versions" FOR SELECT USING ((("private"."creed_section_permission"("creed_id", "section_id") IS DISTINCT FROM 'hidden'::"text") AND ("private"."creed_role"("creed_id") IS NOT NULL)));


--
-- Name: creed_sections members read visible sections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read visible sections" ON "public"."creed_sections" FOR SELECT USING ((("private"."creed_role"("creed_id") IS NOT NULL) AND ("private"."creed_section_permission"("creed_id", "section_id") IS DISTINCT FROM 'hidden'::"text") AND (("deleted_at" IS NULL) OR ("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))));


--
-- Name: oauth_authorization_codes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."oauth_authorization_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_clients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."oauth_clients" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_token_creeds; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."oauth_token_creeds" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."oauth_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_tokens oauth_tokens_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "oauth_tokens_delete_own" ON "public"."oauth_tokens" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: oauth_tokens oauth_tokens_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "oauth_tokens_select_own" ON "public"."oauth_tokens" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: creed_invites owners and admins read invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owners and admins read invites" ON "public"."creed_invites" FOR SELECT USING (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));


--
-- Name: creed_ai_settings owners manage creed ai settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owners manage creed ai settings" ON "public"."creed_ai_settings" TO "authenticated" USING (("private"."creed_role"("creed_id") = 'owner'::"text")) WITH CHECK (("private"."creed_role"("creed_id") = 'owner'::"text"));


--
-- Name: creed_activity personal owner deletes activity; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personal owner deletes activity" ON "public"."creed_activity" FOR DELETE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));


--
-- Name: creed_proposals personal owner deletes proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personal owner deletes proposals" ON "public"."creed_proposals" FOR DELETE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));


--
-- Name: creed_sections personal owner deletes sections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personal owner deletes sections" ON "public"."creed_sections" FOR DELETE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));


--
-- Name: creed_activity personal owner inserts activity; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personal owner inserts activity" ON "public"."creed_activity" FOR INSERT TO "authenticated" WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));


--
-- Name: creed_proposals personal owner inserts proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personal owner inserts proposals" ON "public"."creed_proposals" FOR INSERT TO "authenticated" WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));


--
-- Name: creed_sections personal owner inserts sections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personal owner inserts sections" ON "public"."creed_sections" FOR INSERT TO "authenticated" WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));


--
-- Name: creed_activity personal owner updates activity; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personal owner updates activity" ON "public"."creed_activity" FOR UPDATE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text"))) WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));


--
-- Name: creed_proposals personal owner updates proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personal owner updates proposals" ON "public"."creed_proposals" FOR UPDATE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text"))) WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));


--
-- Name: creed_sections personal owner updates sections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personal owner updates sections" ON "public"."creed_sections" FOR UPDATE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text"))) WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));


--
-- Name: rate_limit_hits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."rate_limit_hits" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_member_section_permissions read member section permissions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "read member section permissions" ON "public"."creed_member_section_permissions" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: sponsor_donations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sponsor_donations" ENABLE ROW LEVEL SECURITY;

--
-- Name: sponsors; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sponsors" ENABLE ROW LEVEL SECURITY;

--
-- Name: creed_ai_usage users and managers can read creed ai usage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users and managers can read creed ai usage" ON "public"."creed_ai_usage" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (("creed_id" IS NOT NULL) AND ("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))));


--
-- Name: creed_quality_reports users can delete their creed quality reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users can delete their creed quality reports" ON "public"."creed_quality_reports" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: creed_ai_usage users can insert their creed ai usage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users can insert their creed ai usage" ON "public"."creed_ai_usage" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: creed_quality_reports users can insert their creed quality reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users can insert their creed quality reports" ON "public"."creed_quality_reports" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: creed_tokens users can manage their creed tokens; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users can manage their creed tokens" ON "public"."creed_tokens" TO "authenticated" USING (("private"."creed_role"("creed_id") = 'owner'::"text")) WITH CHECK ((("private"."creed_role"("creed_id") = 'owner'::"text") AND (( SELECT "auth"."uid"() AS "uid") = "user_id")));


--
-- Name: creed_quality_reports users can update their creed quality reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users can update their creed quality reports" ON "public"."creed_quality_reports" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: creed_credit_homes users read own credit home; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users read own credit home" ON "public"."creed_credit_homes" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: oauth_token_creeds users read own token grants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users read own token grants" ON "public"."oauth_token_creeds" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."oauth_tokens" "t"
  WHERE (("t"."id" = "oauth_token_creeds"."token_id") AND ("t"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: creed_entitlements users read their cloud entitlement; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users read their cloud entitlement" ON "public"."creed_entitlements" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: SCHEMA "private"; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "creed_role"("p_creed_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."creed_role"("p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."creed_role"("p_creed_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."creed_role"("p_creed_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "creed_section_permission"("p_creed_id" "uuid", "p_section_id" "text"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."creed_section_permission"("p_creed_id" "uuid", "p_section_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."creed_section_permission"("p_creed_id" "uuid", "p_section_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."creed_section_permission"("p_creed_id" "uuid", "p_section_id" "text") TO "service_role";


--
-- Name: FUNCTION "creed_type"("p_creed_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."creed_type"("p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."creed_type"("p_creed_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."creed_type"("p_creed_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_member_profiles"("p_creed_id" "uuid"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."get_member_profiles"("p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_member_profiles"("p_creed_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "touch_creed_sync_tick"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."touch_creed_sync_tick"() FROM PUBLIC;


--
-- Name: FUNCTION "touch_getting_started_creed_sync_tick"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."touch_getting_started_creed_sync_tick"() FROM PUBLIC;


--
-- Name: FUNCTION "touch_personal_creed_sync_tick"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."touch_personal_creed_sync_tick"() FROM PUBLIC;


--
-- Name: FUNCTION "accept_shared_invite"("p_invite_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."accept_shared_invite"("p_invite_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_shared_invite"("p_invite_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text") TO "service_role";


--
-- Name: FUNCTION "apply_sponsor_donation_event"("p_sponsor_id" "uuid", "p_amount_cents" integer, "p_payment_intent_id" "text", "p_attempt_id" "uuid", "p_event_kind" "text", "p_event_created" bigint, "p_amount_refunded_cents" integer, "p_dispute_status" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."apply_sponsor_donation_event"("p_sponsor_id" "uuid", "p_amount_cents" integer, "p_payment_intent_id" "text", "p_attempt_id" "uuid", "p_event_kind" "text", "p_event_created" bigint, "p_amount_refunded_cents" integer, "p_dispute_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_sponsor_donation_event"("p_sponsor_id" "uuid", "p_amount_cents" integer, "p_payment_intent_id" "text", "p_attempt_id" "uuid", "p_event_kind" "text", "p_event_created" bigint, "p_amount_refunded_cents" integer, "p_dispute_status" "text") TO "service_role";


--
-- Name: FUNCTION "cancel_credit_reservation"("p_reservation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."cancel_credit_reservation"("p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_credit_reservation"("p_reservation_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer, "p_cost" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer, "p_cost" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer, "p_cost" integer) TO "service_role";


--
-- Name: FUNCTION "create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text") TO "service_role";


--
-- Name: FUNCTION "credit_spend_total"("p_creed_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."credit_spend_total"("p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."credit_spend_total"("p_creed_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "credit_topup"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_payment_intent_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."credit_topup"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_payment_intent_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."credit_topup"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_payment_intent_id" "text") TO "service_role";


--
-- Name: FUNCTION "debit_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."debit_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."debit_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean) TO "service_role";


--
-- Name: FUNCTION "get_creed_state_tick"("p_creed_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_creed_state_tick"("p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_creed_state_tick"("p_creed_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_member_profiles"("p_creed_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_member_profiles"("p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_member_profiles"("p_creed_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_or_create_sponsor"("p_candidate_id" "uuid", "p_user_id" "uuid", "p_anonymous_key_hash" "text", "p_name" "text", "p_message" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_or_create_sponsor"("p_candidate_id" "uuid", "p_user_id" "uuid", "p_anonymous_key_hash" "text", "p_name" "text", "p_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_sponsor"("p_candidate_id" "uuid", "p_user_id" "uuid", "p_anonymous_key_hash" "text", "p_name" "text", "p_message" "text") TO "service_role";


--
-- Name: FUNCTION "get_public_sponsor"("p_sponsor_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_public_sponsor"("p_sponsor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_sponsor"("p_sponsor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "grant_allowance"("p_creed_id" "uuid", "p_allowance_micro" bigint, "p_period_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."grant_allowance"("p_creed_id" "uuid", "p_allowance_micro" bigint, "p_period_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_allowance"("p_creed_id" "uuid", "p_allowance_micro" bigint, "p_period_key" "text") TO "service_role";


--
-- Name: FUNCTION "guard_oauth_client_registration"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."guard_oauth_client_registration"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_oauth_client_registration"() TO "service_role";


--
-- Name: FUNCTION "increment_mcp_read"("p_user_id" "uuid", "p_client_id" "text", "p_day" "date"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."increment_mcp_read"("p_user_id" "uuid", "p_client_id" "text", "p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_mcp_read"("p_user_id" "uuid", "p_client_id" "text", "p_day" "date") TO "service_role";


--
-- Name: FUNCTION "increment_mcp_read_for_creed"("p_creed_id" "uuid", "p_reader_user_id" "uuid", "p_client_id" "text", "p_day" "date"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."increment_mcp_read_for_creed"("p_creed_id" "uuid", "p_reader_user_id" "uuid", "p_client_id" "text", "p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_mcp_read_for_creed"("p_creed_id" "uuid", "p_reader_user_id" "uuid", "p_client_id" "text", "p_day" "date") TO "service_role";


--
-- Name: FUNCTION "list_public_sponsors"("p_query" "text", "p_amount_cents" integer, "p_limit" integer, "p_offset" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."list_public_sponsors"("p_query" "text", "p_amount_cents" integer, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_public_sponsors"("p_query" "text", "p_amount_cents" integer, "p_limit" integer, "p_offset" integer) TO "service_role";


--
-- Name: FUNCTION "prune_abandoned_sponsor_payments"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."prune_abandoned_sponsor_payments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_abandoned_sponsor_payments"() TO "service_role";


--
-- Name: FUNCTION "refund_credit_topup"("p_payment_intent_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."refund_credit_topup"("p_payment_intent_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refund_credit_topup"("p_payment_intent_id" "text") TO "service_role";


--
-- Name: FUNCTION "reserve_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reserve_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_credits"("p_creed_id" "uuid", "p_amount_micro" bigint, "p_feature" "text", "p_model_id" "text", "p_spent_by" "uuid", "p_purchased_only" boolean) TO "service_role";


--
-- Name: FUNCTION "set_credit_home"("p_user_id" "uuid", "p_creed_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_credit_home"("p_user_id" "uuid", "p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_credit_home"("p_user_id" "uuid", "p_creed_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "settle_credit_reservation"("p_reservation_id" "uuid", "p_actual_micro" bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."settle_credit_reservation"("p_reservation_id" "uuid", "p_actual_micro" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_credit_reservation"("p_reservation_id" "uuid", "p_actual_micro" bigint) TO "service_role";


--
-- Name: FUNCTION "transfer_credit_home"("p_from_creed_id" "uuid", "p_to_creed_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."transfer_credit_home"("p_from_creed_id" "uuid", "p_to_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_credit_home"("p_from_creed_id" "uuid", "p_to_creed_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "transfer_creed_ownership"("p_creed_id" "uuid", "p_from" "uuid", "p_to" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."transfer_creed_ownership"("p_creed_id" "uuid", "p_from" "uuid", "p_to" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_creed_ownership"("p_creed_id" "uuid", "p_from" "uuid", "p_to" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_creed_section_positions"("p_creed_id" "uuid", "p_section_ids" "text"[], "p_updated_at" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_creed_section_positions"("p_creed_id" "uuid", "p_section_ids" "text"[], "p_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_creed_section_positions"("p_creed_id" "uuid", "p_section_ids" "text"[], "p_updated_at" timestamp with time zone) TO "service_role";


--
-- Name: TABLE "creed_activity"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_activity" TO "anon";
GRANT ALL ON TABLE "public"."creed_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_activity" TO "service_role";


--
-- Name: TABLE "creed_ai_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_ai_settings" TO "anon";
GRANT ALL ON TABLE "public"."creed_ai_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_ai_settings" TO "service_role";


--
-- Name: TABLE "creed_ai_usage"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_ai_usage" TO "anon";
GRANT ALL ON TABLE "public"."creed_ai_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_ai_usage" TO "service_role";


--
-- Name: TABLE "creed_audit_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."creed_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_audit_log" TO "service_role";


--
-- Name: TABLE "creed_connections"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_connections" TO "anon";
GRANT ALL ON TABLE "public"."creed_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_connections" TO "service_role";


--
-- Name: TABLE "creed_credit_homes"; Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON TABLE "public"."creed_credit_homes" FROM "anon";
GRANT ALL ON TABLE "public"."creed_credit_homes" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_credit_homes" TO "service_role";


--
-- Name: TABLE "creed_credit_reservations"; Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON TABLE "public"."creed_credit_reservations" FROM "anon";
REVOKE ALL ON TABLE "public"."creed_credit_reservations" FROM "authenticated";
GRANT ALL ON TABLE "public"."creed_credit_reservations" TO "service_role";


--
-- Name: TABLE "creed_credit_transactions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_credit_transactions" TO "anon";
GRANT ALL ON TABLE "public"."creed_credit_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_credit_transactions" TO "service_role";


--
-- Name: TABLE "creed_credits"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_credits" TO "anon";
GRANT ALL ON TABLE "public"."creed_credits" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_credits" TO "service_role";


--
-- Name: TABLE "creed_entitlements"; Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON TABLE "public"."creed_entitlements" FROM "anon";
GRANT ALL ON TABLE "public"."creed_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_entitlements" TO "service_role";


--
-- Name: TABLE "creed_getting_started"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_getting_started" TO "anon";
GRANT ALL ON TABLE "public"."creed_getting_started" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_getting_started" TO "service_role";


--
-- Name: TABLE "creed_integrations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_integrations" TO "anon";
GRANT ALL ON TABLE "public"."creed_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_integrations" TO "service_role";


--
-- Name: TABLE "creed_invites"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_invites" TO "anon";
GRANT ALL ON TABLE "public"."creed_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_invites" TO "service_role";


--
-- Name: TABLE "creed_mcp_clients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_mcp_clients" TO "anon";
GRANT ALL ON TABLE "public"."creed_mcp_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_mcp_clients" TO "service_role";


--
-- Name: TABLE "creed_mcp_read_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_mcp_read_events" TO "anon";
GRANT ALL ON TABLE "public"."creed_mcp_read_events" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_mcp_read_events" TO "service_role";


--
-- Name: TABLE "creed_member_agent_permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_member_agent_permissions" TO "anon";
GRANT ALL ON TABLE "public"."creed_member_agent_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_member_agent_permissions" TO "service_role";


--
-- Name: TABLE "creed_member_section_permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_member_section_permissions" TO "anon";
GRANT ALL ON TABLE "public"."creed_member_section_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_member_section_permissions" TO "service_role";


--
-- Name: TABLE "creed_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_members" TO "anon";
GRANT ALL ON TABLE "public"."creed_members" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_members" TO "service_role";


--
-- Name: TABLE "creed_proposals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_proposals" TO "anon";
GRANT ALL ON TABLE "public"."creed_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_proposals" TO "service_role";


--
-- Name: TABLE "creed_quality_reports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_quality_reports" TO "anon";
GRANT ALL ON TABLE "public"."creed_quality_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_quality_reports" TO "service_role";


--
-- Name: TABLE "creed_quality_runs"; Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON TABLE "public"."creed_quality_runs" FROM "anon";
REVOKE ALL ON TABLE "public"."creed_quality_runs" FROM "authenticated";
GRANT ALL ON TABLE "public"."creed_quality_runs" TO "service_role";


--
-- Name: TABLE "creed_section_versions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_section_versions" TO "anon";
GRANT ALL ON TABLE "public"."creed_section_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_section_versions" TO "service_role";


--
-- Name: SEQUENCE "creed_section_versions_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."creed_section_versions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."creed_section_versions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."creed_section_versions_id_seq" TO "service_role";


--
-- Name: TABLE "creed_sections"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_sections" TO "anon";
GRANT ALL ON TABLE "public"."creed_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_sections" TO "service_role";


--
-- Name: TABLE "creed_tokens"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_tokens" TO "anon";
GRANT ALL ON TABLE "public"."creed_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_tokens" TO "service_role";


--
-- Name: TABLE "creed_version_control"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creed_version_control" TO "anon";
GRANT ALL ON TABLE "public"."creed_version_control" TO "authenticated";
GRANT ALL ON TABLE "public"."creed_version_control" TO "service_role";


--
-- Name: TABLE "creeds"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."creeds" TO "anon";
GRANT ALL ON TABLE "public"."creeds" TO "authenticated";
GRANT ALL ON TABLE "public"."creeds" TO "service_role";


--
-- Name: TABLE "oauth_authorization_codes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."oauth_authorization_codes" TO "anon";
GRANT ALL ON TABLE "public"."oauth_authorization_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_authorization_codes" TO "service_role";


--
-- Name: TABLE "oauth_clients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."oauth_clients" TO "anon";
GRANT ALL ON TABLE "public"."oauth_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_clients" TO "service_role";


--
-- Name: TABLE "oauth_token_creeds"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."oauth_token_creeds" TO "anon";
GRANT ALL ON TABLE "public"."oauth_token_creeds" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_token_creeds" TO "service_role";


--
-- Name: TABLE "oauth_tokens"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."oauth_tokens" TO "anon";
GRANT ALL ON TABLE "public"."oauth_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_tokens" TO "service_role";


--
-- Name: TABLE "rate_limit_hits"; Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON TABLE "public"."rate_limit_hits" FROM "anon";
REVOKE ALL ON TABLE "public"."rate_limit_hits" FROM "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_hits" TO "service_role";


--
-- Name: TABLE "sponsor_donations"; Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON TABLE "public"."sponsor_donations" FROM "anon";
REVOKE ALL ON TABLE "public"."sponsor_donations" FROM "authenticated";
GRANT ALL ON TABLE "public"."sponsor_donations" TO "service_role";


--
-- Name: TABLE "sponsors"; Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON TABLE "public"."sponsors" FROM "anon";
REVOKE ALL ON TABLE "public"."sponsors" FROM "authenticated";
GRANT ALL ON TABLE "public"."sponsors" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--
