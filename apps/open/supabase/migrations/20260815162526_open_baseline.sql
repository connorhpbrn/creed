


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "private"."creed_role"("p_creed_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select role
  from public.creed_members
  where creed_id = p_creed_id and user_id = (select auth.uid());
$$;


ALTER FUNCTION "private"."creed_role"("p_creed_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."creed_type"("p_creed_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select type from public.creeds where id = p_creed_id;
$$;


ALTER FUNCTION "private"."creed_type"("p_creed_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text") IS 'Atomically applies an owner-validated onboarding mutation. Service role only.';



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


CREATE OR REPLACE FUNCTION "public"."create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text") RETURNS TABLE("id" "uuid", "type" "text", "name" "text", "onboarding_stage" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_creed_id uuid;
begin
  if p_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  p_name := btrim(p_name);
  if p_name = '' or char_length(p_name) > 80 then
    raise exception 'invalid creed name' using errcode = '22023';
  end if;
  if p_type <> 'personal' then
    raise exception 'invalid creed type' using errcode = '22023';
  end if;

  insert into public.creeds (type, name, owner_user_id, onboarding_stage)
  values (p_type, p_name, p_user_id, null)
  returning creeds.id into v_creed_id;

  insert into public.creed_members (creed_id, user_id, role)
  values (v_creed_id, p_user_id, 'owner');

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
    'identity',
    0,
    'rich-text',
    'Identity',
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


COMMENT ON FUNCTION "public"."create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text") IS 'Atomically creates an owned Creed ready for the file. Service role only; caller must pass the authenticated user id.';



CREATE OR REPLACE FUNCTION "public"."creed_schema_version"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(max(version), '')::text
  from supabase_migrations.schema_migrations;
$$;


ALTER FUNCTION "public"."creed_schema_version"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."creed_schema_version"() IS 'Returns the newest applied Supabase migration to the service role for installation readiness checks.';



CREATE OR REPLACE FUNCTION "public"."get_creed_state_tick"("p_creed_id" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select floor(extract(epoch from greatest(updated_at, sync_updated_at)) * 1000)::bigint
  from public.creeds
  where id = p_creed_id;
$$;


ALTER FUNCTION "public"."get_creed_state_tick"("p_creed_id" "uuid") OWNER TO "postgres";


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


COMMENT ON FUNCTION "public"."guard_oauth_client_registration"() IS 'Caps oauth_clients and prunes expired codes/tokens. Does not delete clients; MCP hosts cache client_id across reconnects.';



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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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


COMMENT ON TABLE "public"."creed_getting_started" IS 'Per-user, per-Creed Get started checklist progress and dismiss state.';



CREATE TABLE IF NOT EXISTS "public"."creed_installation" (
    "singleton" boolean DEFAULT true NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "creed_installation_singleton_check" CHECK ("singleton")
);


ALTER TABLE "public"."creed_installation" OWNER TO "postgres";


COMMENT ON TABLE "public"."creed_installation" IS 'Private single-owner identity for a self-hosted Creed Open installation. Service-role access only.';



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


CREATE TABLE IF NOT EXISTS "public"."creed_members" (
    "creed_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "creed_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."creed_members" OWNER TO "postgres";


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


ALTER TABLE "public"."creed_section_versions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."creed_section_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



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
    CONSTRAINT "creeds_type_check" CHECK (("type" = 'personal'::"text"))
);


ALTER TABLE "public"."creeds" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."oauth_clients" (
    "client_id" "text" NOT NULL,
    "client_name" "text" DEFAULT 'MCP Client'::"text" NOT NULL,
    "redirect_uris" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."oauth_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oauth_token_creeds" (
    "token_id" "uuid" NOT NULL,
    "creed_id" "uuid" NOT NULL,
    "mode" "text" DEFAULT 'proposal-only'::"text" NOT NULL,
    CONSTRAINT "oauth_token_creeds_mode_check" CHECK (("mode" = ANY (ARRAY['read-only'::"text", 'proposal-only'::"text", 'direct'::"text"])))
);


ALTER TABLE "public"."oauth_token_creeds" OWNER TO "postgres";


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


COMMENT ON COLUMN "public"."oauth_tokens"."authorization_code_hash" IS 'Idempotency key that lets a valid authorization-code exchange return its already-issued token pair after a lost response.';


COMMENT ON COLUMN "public"."oauth_tokens"."parent_token_id" IS 'The refresh-token row replaced by this row; unique to prevent concurrent refreshes from minting competing successors.';


COMMENT ON COLUMN "public"."oauth_tokens"."ready_at" IS 'Set only after the token row and its Creed grants are fully persisted, so retries never observe a partial token.';


CREATE TABLE IF NOT EXISTS "public"."rate_limit_hits" (
    "key" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "hit_count" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rate_limit_hits_hit_count_check" CHECK (("hit_count" >= 0))
);


ALTER TABLE "public"."rate_limit_hits" OWNER TO "postgres";


ALTER TABLE ONLY "public"."creed_activity"
    ADD CONSTRAINT "creed_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creed_ai_settings"
    ADD CONSTRAINT "creed_ai_settings_pkey" PRIMARY KEY ("creed_id");



ALTER TABLE ONLY "public"."creed_ai_usage"
    ADD CONSTRAINT "creed_ai_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creed_audit_log"
    ADD CONSTRAINT "creed_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creed_connections"
    ADD CONSTRAINT "creed_connections_pkey" PRIMARY KEY ("creed_id", "connection_id");



ALTER TABLE ONLY "public"."creed_getting_started"
    ADD CONSTRAINT "creed_getting_started_pkey" PRIMARY KEY ("user_id", "creed_id");



ALTER TABLE ONLY "public"."creed_installation"
    ADD CONSTRAINT "creed_installation_owner_user_id_key" UNIQUE ("owner_user_id");



ALTER TABLE ONLY "public"."creed_installation"
    ADD CONSTRAINT "creed_installation_pkey" PRIMARY KEY ("singleton");



ALTER TABLE ONLY "public"."creed_integrations"
    ADD CONSTRAINT "creed_integrations_pkey" PRIMARY KEY ("creed_id", "provider");



ALTER TABLE ONLY "public"."creed_mcp_clients"
    ADD CONSTRAINT "creed_mcp_clients_pkey" PRIMARY KEY ("creed_id", "client_id");



ALTER TABLE ONLY "public"."creed_mcp_read_events"
    ADD CONSTRAINT "creed_mcp_read_events_pkey" PRIMARY KEY ("creed_id", "client_id", "day");



ALTER TABLE ONLY "public"."creed_members"
    ADD CONSTRAINT "creed_members_pkey" PRIMARY KEY ("creed_id", "user_id");



ALTER TABLE ONLY "public"."creed_proposals"
    ADD CONSTRAINT "creed_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creed_quality_reports"
    ADD CONSTRAINT "creed_quality_reports_pkey" PRIMARY KEY ("creed_id");



ALTER TABLE ONLY "public"."creed_quality_runs"
    ADD CONSTRAINT "creed_quality_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creed_section_versions"
    ADD CONSTRAINT "creed_section_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creed_sections"
    ADD CONSTRAINT "creed_sections_pkey" PRIMARY KEY ("creed_id", "section_id");



ALTER TABLE ONLY "public"."creed_tokens"
    ADD CONSTRAINT "creed_tokens_pkey" PRIMARY KEY ("creed_id");



ALTER TABLE ONLY "public"."creed_version_control"
    ADD CONSTRAINT "creed_version_control_pkey" PRIMARY KEY ("creed_id");



ALTER TABLE ONLY "public"."creeds"
    ADD CONSTRAINT "creeds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("code_hash");



ALTER TABLE ONLY "public"."oauth_clients"
    ADD CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("client_id");



ALTER TABLE ONLY "public"."oauth_token_creeds"
    ADD CONSTRAINT "oauth_token_creeds_pkey" PRIMARY KEY ("token_id", "creed_id");



ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_hits"
    ADD CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("key");



CREATE INDEX "creed_activity_created_idx" ON "public"."creed_activity" USING "btree" ("created_at");



CREATE INDEX "creed_activity_creed_created_idx" ON "public"."creed_activity" USING "btree" ("creed_id", "created_at" DESC);



CREATE INDEX "creed_activity_proposal_id_idx" ON "public"."creed_activity" USING "btree" ("proposal_id");



CREATE INDEX "creed_activity_user_created_idx" ON "public"."creed_activity" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "creed_ai_usage_creed_created_idx" ON "public"."creed_ai_usage" USING "btree" ("creed_id", "created_at" DESC);



CREATE INDEX "creed_ai_usage_user_created_idx" ON "public"."creed_ai_usage" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "creed_audit_log_action_created_at_idx" ON "public"."creed_audit_log" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "creed_audit_log_creed_created_idx" ON "public"."creed_audit_log" USING "btree" ("creed_id", "created_at" DESC);



CREATE INDEX "creed_audit_log_user_id_created_at_idx" ON "public"."creed_audit_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "creed_connections_creed_updated_idx" ON "public"."creed_connections" USING "btree" ("creed_id", "updated_at" DESC);



CREATE INDEX "creed_connections_user_updated_idx" ON "public"."creed_connections" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "creed_getting_started_creed_idx" ON "public"."creed_getting_started" USING "btree" ("creed_id");



CREATE INDEX "creed_integrations_creed_provider_idx" ON "public"."creed_integrations" USING "btree" ("creed_id", "provider");



CREATE INDEX "creed_mcp_clients_creed_last_seen_idx" ON "public"."creed_mcp_clients" USING "btree" ("creed_id", "last_seen_at" DESC);



CREATE INDEX "creed_mcp_clients_user_last_seen_idx" ON "public"."creed_mcp_clients" USING "btree" ("user_id", "last_seen_at" DESC);



CREATE INDEX "creed_mcp_read_events_creed_day_idx" ON "public"."creed_mcp_read_events" USING "btree" ("creed_id", "day" DESC);



CREATE INDEX "creed_mcp_read_events_user_day_idx" ON "public"."creed_mcp_read_events" USING "btree" ("user_id", "day" DESC);



CREATE UNIQUE INDEX "creed_members_one_owner_per_creed" ON "public"."creed_members" USING "btree" ("creed_id") WHERE ("role" = 'owner'::"text");



CREATE INDEX "creed_members_user_idx" ON "public"."creed_members" USING "btree" ("user_id");



CREATE INDEX "creed_proposals_creed_created_idx" ON "public"."creed_proposals" USING "btree" ("creed_id", "created_at" DESC);



CREATE INDEX "creed_proposals_creed_status_idx" ON "public"."creed_proposals" USING "btree" ("creed_id", "status");



CREATE INDEX "creed_proposals_user_created_idx" ON "public"."creed_proposals" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "creed_proposals_user_id_idx" ON "public"."creed_proposals" USING "btree" ("user_id");



CREATE INDEX "creed_quality_reports_creed_hash_idx" ON "public"."creed_quality_reports" USING "btree" ("creed_id", "content_hash");



CREATE INDEX "creed_quality_reports_user_hash_idx" ON "public"."creed_quality_reports" USING "btree" ("user_id", "content_hash");



CREATE INDEX "creed_quality_runs_creed_created_idx" ON "public"."creed_quality_runs" USING "btree" ("creed_id", "created_at" DESC);



CREATE UNIQUE INDEX "creed_quality_runs_one_active_request_idx" ON "public"."creed_quality_runs" USING "btree" ("creed_id", "request_key") WHERE ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"]));



CREATE UNIQUE INDEX "creed_quality_runs_one_running_per_creed_idx" ON "public"."creed_quality_runs" USING "btree" ("creed_id") WHERE ("status" = 'running'::"text");



CREATE INDEX "creed_section_versions_lookup_idx" ON "public"."creed_section_versions" USING "btree" ("creed_id", "section_id", "id" DESC);



CREATE INDEX "creed_sections_creed_position_idx" ON "public"."creed_sections" USING "btree" ("creed_id", "position");



CREATE INDEX "creed_sections_template_idx" ON "public"."creed_sections" USING "btree" ("template");



CREATE INDEX "creed_sections_user_position_idx" ON "public"."creed_sections" USING "btree" ("user_id", "position");



CREATE UNIQUE INDEX "creed_tokens_direct_edit_token_hash_idx" ON "public"."creed_tokens" USING "btree" ("direct_edit_token_hash") WHERE ("direct_edit_token_hash" IS NOT NULL);



CREATE UNIQUE INDEX "creed_tokens_proposal_token_hash_idx" ON "public"."creed_tokens" USING "btree" ("proposal_token_hash") WHERE ("proposal_token_hash" IS NOT NULL);



CREATE UNIQUE INDEX "creed_tokens_read_token_hash_idx" ON "public"."creed_tokens" USING "btree" ("read_token_hash") WHERE ("read_token_hash" IS NOT NULL);



CREATE INDEX "creeds_owner_idx" ON "public"."creeds" USING "btree" ("owner_user_id");



CREATE INDEX "oauth_authorization_codes_user_idx" ON "public"."oauth_authorization_codes" USING "btree" ("user_id");



CREATE INDEX "oauth_token_creeds_creed_idx" ON "public"."oauth_token_creeds" USING "btree" ("creed_id");



CREATE UNIQUE INDEX "oauth_tokens_access_hash_idx" ON "public"."oauth_tokens" USING "btree" ("access_token_hash");



CREATE UNIQUE INDEX "oauth_tokens_authorization_code_hash_idx" ON "public"."oauth_tokens" USING "btree" ("authorization_code_hash") WHERE ("authorization_code_hash" IS NOT NULL);



CREATE UNIQUE INDEX "oauth_tokens_parent_token_id_idx" ON "public"."oauth_tokens" USING "btree" ("parent_token_id") WHERE ("parent_token_id" IS NOT NULL);



CREATE UNIQUE INDEX "oauth_tokens_refresh_hash_idx" ON "public"."oauth_tokens" USING "btree" ("refresh_token_hash");



CREATE INDEX "oauth_tokens_user_client_idx" ON "public"."oauth_tokens" USING "btree" ("user_id", "client_id");



CREATE INDEX "rate_limit_hits_updated_at_idx" ON "public"."rate_limit_hits" USING "btree" ("updated_at");



CREATE OR REPLACE TRIGGER "guard_oauth_client_registration" BEFORE INSERT ON "public"."oauth_clients" FOR EACH STATEMENT EXECUTE FUNCTION "public"."guard_oauth_client_registration"();



CREATE OR REPLACE TRIGGER "touch_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_ai_settings" FOR EACH ROW EXECUTE FUNCTION "private"."touch_creed_sync_tick"();



CREATE OR REPLACE TRIGGER "touch_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_integrations" FOR EACH ROW EXECUTE FUNCTION "private"."touch_creed_sync_tick"();



CREATE OR REPLACE TRIGGER "touch_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_tokens" FOR EACH ROW EXECUTE FUNCTION "private"."touch_creed_sync_tick"();



CREATE OR REPLACE TRIGGER "touch_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_version_control" FOR EACH ROW EXECUTE FUNCTION "private"."touch_creed_sync_tick"();



CREATE OR REPLACE TRIGGER "touch_getting_started_creed_sync_tick" AFTER INSERT OR DELETE OR UPDATE ON "public"."creed_getting_started" FOR EACH ROW EXECUTE FUNCTION "private"."touch_getting_started_creed_sync_tick"();



ALTER TABLE ONLY "public"."creed_activity"
    ADD CONSTRAINT "creed_activity_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_activity"
    ADD CONSTRAINT "creed_activity_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."creed_proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."creed_activity"
    ADD CONSTRAINT "creed_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_ai_settings"
    ADD CONSTRAINT "creed_ai_settings_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_ai_settings"
    ADD CONSTRAINT "creed_ai_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."creed_ai_usage"
    ADD CONSTRAINT "creed_ai_usage_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_ai_usage"
    ADD CONSTRAINT "creed_ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_audit_log"
    ADD CONSTRAINT "creed_audit_log_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_audit_log"
    ADD CONSTRAINT "creed_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_connections"
    ADD CONSTRAINT "creed_connections_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_connections"
    ADD CONSTRAINT "creed_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_getting_started"
    ADD CONSTRAINT "creed_getting_started_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_getting_started"
    ADD CONSTRAINT "creed_getting_started_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_installation"
    ADD CONSTRAINT "creed_installation_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."creed_integrations"
    ADD CONSTRAINT "creed_integrations_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."creed_integrations"
    ADD CONSTRAINT "creed_integrations_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_mcp_clients"
    ADD CONSTRAINT "creed_mcp_clients_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_mcp_clients"
    ADD CONSTRAINT "creed_mcp_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_mcp_read_events"
    ADD CONSTRAINT "creed_mcp_read_events_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_mcp_read_events"
    ADD CONSTRAINT "creed_mcp_read_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_members"
    ADD CONSTRAINT "creed_members_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_members"
    ADD CONSTRAINT "creed_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_proposals"
    ADD CONSTRAINT "creed_proposals_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_proposals"
    ADD CONSTRAINT "creed_proposals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_quality_reports"
    ADD CONSTRAINT "creed_quality_reports_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_quality_reports"
    ADD CONSTRAINT "creed_quality_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_quality_runs"
    ADD CONSTRAINT "creed_quality_runs_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_quality_runs"
    ADD CONSTRAINT "creed_quality_runs_shared_creed_id_fkey" FOREIGN KEY ("shared_creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_quality_runs"
    ADD CONSTRAINT "creed_quality_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_section_versions"
    ADD CONSTRAINT "creed_section_versions_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_sections"
    ADD CONSTRAINT "creed_sections_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_sections"
    ADD CONSTRAINT "creed_sections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_tokens"
    ADD CONSTRAINT "creed_tokens_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_tokens"
    ADD CONSTRAINT "creed_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creed_version_control"
    ADD CONSTRAINT "creed_version_control_configured_by_fkey" FOREIGN KEY ("configured_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."creed_version_control"
    ADD CONSTRAINT "creed_version_control_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creeds"
    ADD CONSTRAINT "creeds_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_token_creeds"
    ADD CONSTRAINT "oauth_token_creeds_creed_id_fkey" FOREIGN KEY ("creed_id") REFERENCES "public"."creeds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_token_creeds"
    ADD CONSTRAINT "oauth_token_creeds_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "public"."oauth_tokens"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_parent_token_id_fkey" FOREIGN KEY ("parent_token_id") REFERENCES "public"."oauth_tokens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users insert own getting started" ON "public"."creed_getting_started" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."creed_members" "membership"
  WHERE (("membership"."creed_id" = "creed_getting_started"."creed_id") AND ("membership"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Users read own getting started" ON "public"."creed_getting_started" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update own getting started" ON "public"."creed_getting_started" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."creed_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_ai_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_ai_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creed_audit_log_select_own" ON "public"."creed_audit_log" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."creed_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_getting_started" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_installation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_mcp_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_mcp_read_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_quality_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_quality_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_section_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creed_version_control" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."creeds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "managers delete creed integrations" ON "public"."creed_integrations" FOR DELETE TO "authenticated" USING (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "managers delete creed version control" ON "public"."creed_version_control" FOR DELETE TO "authenticated" USING (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "managers insert creed version control" ON "public"."creed_version_control" FOR INSERT TO "authenticated" WITH CHECK (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "managers manage creed integrations" ON "public"."creed_integrations" FOR INSERT TO "authenticated" WITH CHECK (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "managers update creed integrations" ON "public"."creed_integrations" FOR UPDATE TO "authenticated" USING (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "managers update creed version control" ON "public"."creed_version_control" FOR UPDATE TO "authenticated" USING (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "members read activity" ON "public"."creed_activity" FOR SELECT TO "authenticated" USING (("private"."creed_role"("creed_id") IS NOT NULL));



CREATE POLICY "members read connections" ON "public"."creed_connections" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));



CREATE POLICY "members read creed integrations" ON "public"."creed_integrations" FOR SELECT TO "authenticated" USING (("private"."creed_role"("creed_id") IS NOT NULL));



CREATE POLICY "members read creed version control" ON "public"."creed_version_control" FOR SELECT TO "authenticated" USING (("private"."creed_role"("creed_id") IS NOT NULL));



CREATE POLICY "members read mcp clients" ON "public"."creed_mcp_clients" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));



CREATE POLICY "members read mcp read events" ON "public"."creed_mcp_read_events" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR ("private"."creed_role"("creed_id") IS NOT NULL)));



CREATE POLICY "members read proposals" ON "public"."creed_proposals" FOR SELECT TO "authenticated" USING (("private"."creed_role"("creed_id") IS NOT NULL));



CREATE POLICY "members read quality reports" ON "public"."creed_quality_reports" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));



CREATE POLICY "members read sections" ON "public"."creed_sections" FOR SELECT TO "authenticated" USING (("private"."creed_role"("creed_id") IS NOT NULL));



CREATE POLICY "members read their creed roster" ON "public"."creed_members" FOR SELECT USING (("private"."creed_role"("creed_id") IS NOT NULL));



CREATE POLICY "members read their creeds" ON "public"."creeds" FOR SELECT USING (("private"."creed_role"("id") IS NOT NULL));



ALTER TABLE "public"."oauth_authorization_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."oauth_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."oauth_token_creeds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."oauth_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "oauth_tokens_delete_own" ON "public"."oauth_tokens" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "oauth_tokens_select_own" ON "public"."oauth_tokens" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "owners manage creed ai settings" ON "public"."creed_ai_settings" TO "authenticated" USING (("private"."creed_role"("creed_id") = 'owner'::"text")) WITH CHECK (("private"."creed_role"("creed_id") = 'owner'::"text"));



CREATE POLICY "personal owner deletes activity" ON "public"."creed_activity" FOR DELETE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));



CREATE POLICY "personal owner deletes proposals" ON "public"."creed_proposals" FOR DELETE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));



CREATE POLICY "personal owner deletes sections" ON "public"."creed_sections" FOR DELETE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));



CREATE POLICY "personal owner inserts activity" ON "public"."creed_activity" FOR INSERT TO "authenticated" WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));



CREATE POLICY "personal owner inserts proposals" ON "public"."creed_proposals" FOR INSERT TO "authenticated" WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));



CREATE POLICY "personal owner inserts sections" ON "public"."creed_sections" FOR INSERT TO "authenticated" WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));



CREATE POLICY "personal owner updates activity" ON "public"."creed_activity" FOR UPDATE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text"))) WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));



CREATE POLICY "personal owner updates proposals" ON "public"."creed_proposals" FOR UPDATE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text"))) WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));



CREATE POLICY "personal owner updates sections" ON "public"."creed_sections" FOR UPDATE TO "authenticated" USING ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text"))) WITH CHECK ((("private"."creed_type"("creed_id") = 'personal'::"text") AND ("private"."creed_role"("creed_id") = 'owner'::"text")));



ALTER TABLE "public"."rate_limit_hits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users and managers can read creed ai usage" ON "public"."creed_ai_usage" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (("creed_id" IS NOT NULL) AND ("private"."creed_role"("creed_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))));



CREATE POLICY "users can delete their creed quality reports" ON "public"."creed_quality_reports" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "users can insert their creed ai usage" ON "public"."creed_ai_usage" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "users can insert their creed quality reports" ON "public"."creed_quality_reports" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "users can manage their creed tokens" ON "public"."creed_tokens" TO "authenticated" USING (("private"."creed_role"("creed_id") = 'owner'::"text")) WITH CHECK ((("private"."creed_role"("creed_id") = 'owner'::"text") AND (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "users can update their creed quality reports" ON "public"."creed_quality_reports" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "users read own token grants" ON "public"."oauth_token_creeds" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."oauth_tokens" "t"
  WHERE (("t"."id" = "oauth_token_creeds"."token_id") AND ("t"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."creed_role"("p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."creed_role"("p_creed_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."creed_role"("p_creed_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."creed_type"("p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."creed_type"("p_creed_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."creed_type"("p_creed_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."touch_creed_sync_tick"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."touch_getting_started_creed_sync_tick"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."touch_personal_creed_sync_tick"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_creed_onboarding_action"("p_creed_id" "uuid", "p_actor_user_id" "uuid", "p_action" "text", "p_name" "text", "p_sections" "jsonb", "p_activity_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer, "p_cost" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer, "p_cost" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_owned_creed"("p_user_id" "uuid", "p_name" "text", "p_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."creed_schema_version"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."creed_schema_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_creed_state_tick"("p_creed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_creed_state_tick"("p_creed_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_oauth_client_registration"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_oauth_client_registration"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_mcp_read"("p_user_id" "uuid", "p_client_id" "text", "p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_mcp_read"("p_user_id" "uuid", "p_client_id" "text", "p_day" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_mcp_read_for_creed"("p_creed_id" "uuid", "p_reader_user_id" "uuid", "p_client_id" "text", "p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_mcp_read_for_creed"("p_creed_id" "uuid", "p_reader_user_id" "uuid", "p_client_id" "text", "p_day" "date") TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_activity" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_activity" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_activity" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_ai_settings" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_ai_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_ai_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_ai_usage" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_ai_usage" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_ai_usage" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_audit_log" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_audit_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_audit_log" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_connections" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_connections" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_connections" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_getting_started" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_getting_started" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_getting_started" TO "service_role";



REVOKE ALL ON TABLE "public"."creed_installation" FROM "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."creed_installation" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_integrations" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_integrations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_integrations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_mcp_clients" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_mcp_clients" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_mcp_clients" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_mcp_read_events" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_mcp_read_events" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_mcp_read_events" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_members" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_members" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_members" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_proposals" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_proposals" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_proposals" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_quality_reports" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_quality_reports" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_quality_reports" TO "service_role";



GRANT ALL ON TABLE "public"."creed_quality_runs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_section_versions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_section_versions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_section_versions" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."creed_section_versions_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."creed_section_versions_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."creed_section_versions_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_sections" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_sections" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_sections" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_tokens" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_tokens" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_tokens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_version_control" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_version_control" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creed_version_control" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creeds" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creeds" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."creeds" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_authorization_codes" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_authorization_codes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_authorization_codes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_clients" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_clients" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_clients" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_token_creeds" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_token_creeds" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_token_creeds" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_tokens" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_tokens" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."oauth_tokens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rate_limit_hits" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";

REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon", "authenticated";

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  "public"."creeds",
  "public"."creed_members",
  "public"."creed_sections",
  "public"."creed_section_versions",
  "public"."creed_proposals",
  "public"."creed_activity",
  "public"."creed_connections",
  "public"."creed_getting_started",
  "public"."creed_integrations",
  "public"."creed_mcp_clients",
  "public"."creed_mcp_read_events",
  "public"."creed_quality_reports",
  "public"."creed_ai_settings",
  "public"."creed_ai_usage",
  "public"."creed_tokens",
  "public"."creed_version_control"
TO "authenticated";

GRANT USAGE,SELECT ON SEQUENCE "public"."creed_section_versions_id_seq" TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon", "authenticated";
