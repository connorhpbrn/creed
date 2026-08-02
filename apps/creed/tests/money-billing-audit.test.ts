import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260731123000_finish_money_billing_audit.sql", import.meta.url),
  "utf8",
);

test("credit reservations are atomic and service-role only", () => {
  assert.match(migration, /create or replace function public\.reserve_credits/);
  assert.match(migration, /from public\.creed_credits where creed_id = p_creed_id for update/);
  assert.match(migration, /raise exception 'insufficient_credits'/);
  assert.match(migration, /revoke all on function public\.reserve_credits[\s\S]*authenticated/);
  assert.match(migration, /grant execute on function public\.reserve_credits[\s\S]*service_role/);
});

test("reservation settlement refunds unused funds and records actual spend", () => {
  assert.match(migration, /create or replace function public\.settle_credit_reservation/);
  assert.match(migration, /reserved_granted_micro_usd - v_used_granted/);
  assert.match(migration, /reserved_purchased_micro_usd - v_used_purchased/);
  assert.match(migration, /'debit', v_actual/);
});

test("invite acceptance and company ownership are concurrency protected", () => {
  assert.match(migration, /creeds_one_company_per_owner_idx/);
  assert.match(migration, /create or replace function public\.accept_company_invite/);
  assert.match(migration, /creed_company_billing where creed_id = i\.creed_id for update/);
  assert.match(migration, /grant execute on function public\.accept_company_invite[\s\S]*service_role/);
});

test("credit top-up refunds are idempotent", () => {
  assert.match(migration, /v_refund_id text := 'refund:' \|\| p_payment_intent_id/);
  assert.match(migration, /purchased_micro_usd = greatest\(0, purchased_micro_usd - t\.amount_micro_usd\)/);
  assert.match(migration, /type in \('topup', 'debit', 'grant', 'refund'\)/);
});
