import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../apps/cloud/supabase/migrations/20260815155608_cloud_baseline.sql",
  import.meta.url,
);

async function migrationSource() {
  return (await readFile(migrationUrl, "utf8")).replaceAll('"', "").toLowerCase();
}

test("sponsorship schema stays isolated and server-only", async () => {
  const migration = await migrationSource();

  assert.match(migration, /create table if not exists public\.sponsors/);
  assert.match(migration, /create table if not exists public\.sponsor_donations/);
  assert.match(migration, /foreign key \(sponsor_id\) references public\.sponsors\(id\) on delete cascade/);
  assert.match(migration, /sponsor_donations_stripe_payment_intent_id_key unique \(stripe_payment_intent_id\)/);
  assert.match(migration, /amount_cents >= 500[\s\S]*amount_cents <= 500000/);
  assert.match(migration, /alter table public\.sponsors enable row level security/);
  assert.match(
    migration,
    /alter table public\.sponsor_donations enable row level security/
  );
  assert.doesNotMatch(migration, /grant .* on table public\.sponsors to (?:anon|authenticated)/);
  assert.doesNotMatch(migration, /grant .* on table public\.sponsor_donations to (?:anon|authenticated)/);
  assert.doesNotMatch(migration, /create policy .* on public\.(?:sponsors|sponsor_donations)/i);
  assert.doesNotMatch(migration, /avatar_color/i);
});

test("sponsor lifecycle is atomic, private, and order-safe", async () => {
  const migration = await migrationSource();
  assert.match(migration, /create or replace function public\.apply_sponsor_donation_event/);
  assert.match(migration, /for update/);
  assert.match(migration, /p_event_created >= dispute_event_created/);
  assert.match(migration, /p_event_created >= refund_event_created/);
  assert.match(migration, /when v_row\.amount_refunded_cents >= v_row\.amount_cents then 'refunded'/);
  assert.match(migration, /revoke all on function public\.list_public_sponsors/);
  assert.match(migration, /grant all on function public\.list_public_sponsors[\s\S]*to service_role/);
});

test("abandoned sponsor attempts are pruned without touching settled payments", async () => {
  const migration = await migrationSource();
  assert.match(migration, /where status in \('pending', 'failed'\)/);
  assert.match(migration, /interval '7 days'/);
  assert.match(migration, /prune_abandoned_sponsor_payments/);
  assert.doesNotMatch(migration, /status in \('succeeded'/);
  assert.match(migration, /revoke all on function public\.prune_abandoned_sponsor_payments/);
});

test("sponsor wall pages keep donation payloads bounded", async () => {
  const migration = await migrationSource();
  assert.match(migration, /\)\)\[1:12\]::integer\[\] as donation_amounts/);
  assert.match(migration, /limit least\(greatest\(p_limit, 1\), 48\)/);
});

test("sponsorship accepts up to five thousand dollars", async () => {
  const migration = await migrationSource();

  assert.match(
    migration,
    /sponsor_donations_amount_cents_check/
  );
  assert.match(migration, /amount_cents >= 500[\s\S]*amount_cents <= 500000/);
});
