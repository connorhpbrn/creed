import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../persistence/supabase/migrations/20260814222950_sponsor_tables.sql",
  import.meta.url
);
const amountLimitMigrationUrl = new URL(
  "../../persistence/supabase/migrations/20260814223730_sponsor_amount_limit.sql",
  import.meta.url
);
const hardeningMigrationUrl = new URL(
  "../../persistence/supabase/migrations/20260814233340_harden_sponsor_payments.sql",
  import.meta.url
);
const cleanupMigrationUrl = new URL(
  "../../persistence/supabase/migrations/20260814233924_prune_abandoned_sponsor_payments.sql",
  import.meta.url
);
const boundedWallMigrationUrl = new URL(
  "../../persistence/supabase/migrations/20260814234041_bound_sponsor_wall_payload.sql",
  import.meta.url
);

test("sponsorship schema stays isolated and server-only", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /create table public\.sponsors/);
  assert.match(migration, /create table public\.sponsor_donations/);
  assert.match(migration, /references public\.sponsors\(id\) on delete cascade/);
  assert.match(migration, /stripe_payment_intent_id text not null unique/);
  assert.match(migration, /amount_cents between 500 and 50000/);
  assert.match(migration, /alter table public\.sponsors enable row level security/);
  assert.match(
    migration,
    /alter table public\.sponsor_donations enable row level security/
  );
  assert.match(
    migration,
    /revoke all on table public\.sponsors from anon, authenticated/
  );
  assert.match(
    migration,
    /revoke all on table public\.sponsor_donations from anon, authenticated/
  );
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /avatar_color/i);
});

test("sponsor lifecycle is atomic, private, and order-safe", async () => {
  const migration = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(migration, /create or replace function public\.apply_sponsor_donation_event/);
  assert.match(migration, /for update/);
  assert.match(migration, /p_event_created >= dispute_event_created/);
  assert.match(migration, /p_event_created >= refund_event_created/);
  assert.match(migration, /when v_row\.amount_refunded_cents >= v_row\.amount_cents then 'refunded'/);
  assert.match(migration, /revoke all on function public\.list_public_sponsors/);
  assert.match(migration, /grant execute on function public\.list_public_sponsors[\s\S]*to service_role/);
  assert.match(migration, /'sponsor-avatars'/);
});

test("abandoned sponsor attempts are pruned without touching settled payments", async () => {
  const migration = await readFile(cleanupMigrationUrl, "utf8");
  assert.match(migration, /where status in \('pending', 'failed'\)/);
  assert.match(migration, /interval '7 days'/);
  assert.match(migration, /prune-abandoned-sponsor-payments/);
  assert.doesNotMatch(migration, /status in \('succeeded'/);
  assert.match(migration, /revoke all on function public\.prune_abandoned_sponsor_payments/);
});

test("sponsor wall pages keep donation payloads bounded", async () => {
  const migration = await readFile(boundedWallMigrationUrl, "utf8");
  assert.match(migration, /\)\)\[1:12\]::integer\[\] as donation_amounts/);
  assert.match(migration, /limit least\(greatest\(p_limit, 1\), 48\)/);
});

test("sponsorship accepts up to five thousand dollars", async () => {
  const migration = await readFile(amountLimitMigrationUrl, "utf8");

  assert.match(
    migration,
    /drop constraint sponsor_donations_amount_cents_check/
  );
  assert.match(migration, /amount_cents between 500 and 500000/);
});
