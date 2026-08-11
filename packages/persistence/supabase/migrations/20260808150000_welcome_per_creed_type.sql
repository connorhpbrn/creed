-- Welcome tour is once per Creed type: first Personal and first Shared.
-- Keep legacy welcomed_at for compatibility; new columns are the source of truth.

alter table public.creed_entitlements
  add column if not exists welcomed_personal_at timestamptz,
  add column if not exists welcomed_shared_at timestamptz;

comment on column public.creed_entitlements.welcomed_personal_at is
  'When the Personal welcome tour was dismissed for this entitlement.';
comment on column public.creed_entitlements.welcomed_shared_at is
  'When the Shared welcome tour was dismissed for this entitlement.';

-- Existing dismissals were the Personal tour (Shared was gated off).
update public.creed_entitlements
set welcomed_personal_at = welcomed_at
where welcomed_at is not null
  and welcomed_personal_at is null;
