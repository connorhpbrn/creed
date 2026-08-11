import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../persistence/supabase/migrations/20260808100000_creed_baseline.sql", import.meta.url),
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

test("invite acceptance and shared ownership are concurrency protected", () => {
  assert.match(migration, /creed_members_one_owner_per_creed/);
  assert.match(migration, /create or replace function public\.accept_shared_invite/);
  assert.match(migration, /from public\.creed_invites[\s\S]*for update/);
  assert.match(migration, /grant execute on function public\.accept_shared_invite[\s\S]*service_role/);
});

test("credit top-up refunds are idempotent", () => {
  assert.match(migration, /v_refund_id text := 'refund:' \|\| p_payment_intent_id/);
  assert.match(migration, /purchased_micro_usd = greatest\(0, purchased_micro_usd - t\.amount_micro_usd\)/);
  assert.match(migration, /type in \('topup', 'debit', 'grant', 'refund'\)/);
});

test("bonus credit home transfer moves granted only", () => {
  const bonusMigration = readFileSync(
    new URL(
      "../../persistence/supabase/migrations/20260808181045_bonus_credits_granted_only.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(bonusMigration, /create or replace function public\.transfer_credit_home/);
  assert.match(bonusMigration, /granted_micro_usd = v_to_granted \+ v_granted/);
  assert.doesNotMatch(
    bonusMigration,
    /purchased_micro_usd = v_to_purchased \+ v_purchased/,
  );
  assert.match(bonusMigration, /Collapse any granted balance left on non-home/);
});

test("off-home spend is purchased-only and home assignment is atomic", () => {
  const hardening = readFileSync(
    new URL(
      "../../persistence/supabase/migrations/20260808181103_bonus_spend_home_hardening.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(hardening, /p_purchased_only boolean default false/);
  assert.match(hardening, /create or replace function public\.set_credit_home/);
  assert.match(hardening, /pg_advisory_xact_lock/);
  assert.match(hardening, /perform public\.transfer_credit_home\(r\.creed_id, p_creed_id\)/);
  assert.match(
    hardening,
    /insert into public\.creed_credit_homes[\s\S]*on conflict \(user_id\) do update/,
  );
  assert.match(
    hardening,
    /revoke all on function public\.reserve_credits\(uuid, bigint, text, text, uuid, boolean\)[\s\S]*authenticated/,
  );
  assert.match(
    hardening,
    /grant execute on function public\.set_credit_home\(uuid, uuid\)[\s\S]*service_role/,
  );
});

test("invite-only members soft-fail credits home and personal creed load", () => {
  const creditHome = readFileSync(
    new URL("../../creed-cloud/lib/ai/credit-home.ts", import.meta.url),
    "utf8",
  );
  const credits = readFileSync(
    new URL("../../creed-cloud/lib/ai/credits.ts", import.meta.url),
    "utf8",
  );
  const backend = readFileSync(
    new URL("../lib/creed-backend.ts", import.meta.url),
    "utf8",
  );

  // No owned Creed → null home, not a hard throw into Account / route errors.
  assert.match(creditHome, /Promise<string \| null>/);
  assert.match(creditHome, /invite-only Shared members/);
  assert.doesNotMatch(
    creditHome,
    /if \(!fallback\) \{\s*throw new Error\("Credits are temporarily unavailable"\)/,
  );

  // Empty ledger when there is no viewer Creed / home to read.
  assert.match(credits, /Invite-only Shared members own no Creed/);
  assert.match(credits, /creditsHomeCreedId: null/);

  // Missing Personal Creed returns a blank shell instead of throwing.
  assert.doesNotMatch(
    backend,
    /throw new Error\("Could not resolve the Personal Creed\."\)/,
  );
  assert.match(backend, /Brand-new \/ invite-only accounts have no Personal Creed yet/);
});

test("credit history lists purchased top-ups only", () => {
  const credits = readFileSync(
    new URL("../../creed-cloud/lib/ai/credits.ts", import.meta.url),
    "utf8",
  );
  const dialog = readFileSync(
    new URL("../../creed-cloud/components/creed/credits-history-dialog.tsx", import.meta.url),
    "utf8",
  );

  assert.match(credits, /\.eq\("type", "topup"\)/);
  assert.match(credits, /View history is purchases only/);
  assert.doesNotMatch(credits, /\.eq\("type", "debit"\)/);
  assert.match(dialog, /Purchases for this Creed/);
  assert.doesNotMatch(dialog, /Monthly model usage/);
  assert.doesNotMatch(dialog, /Monthly allowance/);
});
