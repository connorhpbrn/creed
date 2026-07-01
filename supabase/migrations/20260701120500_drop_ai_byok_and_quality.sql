-- Remove the bring-your-own-key (BYOK) AI layer and the AI quality-scoring
-- feature. Creed no longer makes any model calls: there is no per-user API key
-- storage, no AI spend tracking, and no auto-generated quality reports. These
-- tables and their policies are dropped here. Forward-only and idempotent.

drop policy if exists "users can manage their creed ai settings" on public.creed_ai_settings;
drop policy if exists "users can read their creed ai usage" on public.creed_ai_usage;
drop policy if exists "users can insert their creed ai usage" on public.creed_ai_usage;
drop policy if exists "users can manage their creed quality reports" on public.creed_quality_reports;

drop index if exists public.creed_ai_usage_user_created_idx;
drop index if exists public.creed_quality_reports_user_hash_idx;

drop table if exists public.creed_ai_usage;
drop table if exists public.creed_quality_reports;
drop table if exists public.creed_ai_settings;
