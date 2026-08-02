import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const hardening = readFileSync(
  new URL("../supabase/migrations/20260706120641_company_p0_hardening.sql", import.meta.url),
  "utf8",
);
const keying = readFileSync(
  new URL("../supabase/migrations/20260705090000_company_keys_and_rls.sql", import.meta.url),
  "utf8",
);
const spendGrant = readFileSync(
  new URL(
    "../supabase/migrations/20260706121522_revoke_credit_spend_total_client_execute.sql",
    import.meta.url,
  ),
  "utf8",
);
const mcpUsage = readFileSync(
  new URL("../supabase/migrations/20260706121914_mcp_usage_creed_scope.sql", import.meta.url),
  "utf8",
);
const creedBackend = readFileSync(
  new URL("../lib/creed-backend.ts", import.meta.url),
  "utf8",
);
const mcpRoute = readFileSync(
  new URL("../app/mcp/route.ts", import.meta.url),
  "utf8",
);

test("company keying migration creates missing personal creed shells before NOT NULL", () => {
  assert.match(keying, /insert into public\.creeds \(id, type, name, owner_user_id\)/);
  assert.match(keying, /where exists \([\s\S]*select 1[\s\S]*from public\.creed_sections/);
  assert.match(keying, /alter table public\.creed_sections alter column creed_id set not null/);
  assert.match(keying, /primary key \(creed_id, section_id\)/);
});

test("lifetime seat purchases apply through one service-role RPC", () => {
  assert.match(hardening, /create or replace function public\.apply_company_lifetime_seat_purchase/);
  assert.match(hardening, /insert into public\.creed_seat_purchases/);
  assert.match(hardening, /update public\.creed_company_billing/);
  assert.match(hardening, /raise exception 'company billing row not found for creed %'/);
  assert.match(
    hardening,
    /revoke all on function public\.apply_company_lifetime_seat_purchase\(text, uuid, integer\)[\s\S]+from public, anon, authenticated/,
  );
  assert.match(
    hardening,
    /grant execute on function public\.apply_company_lifetime_seat_purchase\(text, uuid, integer\)[\s\S]+to service_role/,
  );
});

test("ownership transfer validates inside the database transaction", () => {
  assert.match(hardening, /create or replace function public\.transfer_creed_ownership/);
  assert.match(hardening, /source user is not the company owner/);
  assert.match(hardening, /target user is not an active non-owner member/);
  assert.match(hardening, /expected exactly one outgoing owner/);
  assert.match(hardening, /expected exactly one incoming owner/);
});

test("credit spend aggregate is no longer callable by authenticated clients", () => {
  assert.match(
    spendGrant,
    /revoke all on function public\.credit_spend_total\(uuid\) from public, anon, authenticated/,
  );
  assert.match(spendGrant, /grant execute on function public\.credit_spend_total\(uuid\) to service_role/);
});

test("mcp read usage increments by creed scope after company keying", () => {
  assert.match(mcpUsage, /create or replace function public\.increment_mcp_read_for_creed/);
  assert.match(mcpUsage, /insert into public\.creed_mcp_read_events \(creed_id, user_id, client_id, day, read_count\)/);
  assert.match(mcpUsage, /on conflict \(creed_id, client_id, day\)/);
  assert.match(mcpUsage, /reader is not an active member of this creed/);
  assert.match(
    mcpUsage,
    /revoke all on function public\.increment_mcp_read_for_creed\(uuid, uuid, text, date\) from public, anon, authenticated/,
  );
});

test("mcp usage app writes carry the active creed scope", () => {
  assert.match(mcpRoute, /recordMcpClientUsage\(admin as never, userId, clientName, state\.creedId\)/);
  assert.match(creedBackend, /const targetCreedId = creedId \?\? \(await getPersonalCreedId\(db, userId\)\)/);
  assert.match(creedBackend, /onConflict: "creed_id,client_id"/);
  assert.match(creedBackend, /onConflict: "creed_id,connection_id"/);
  assert.match(creedBackend, /"increment_mcp_read_for_creed"/);
});

test("personal state loading is scoped to the personal creed id", () => {
  assert.match(creedBackend, /getPersonalCreedId\(db, user\.id\)/);
  assert.match(creedBackend, /\.from\("creed_sections"\)[\s\S]+\.eq\("creed_id", personalCreedId\)/);
  assert.match(creedBackend, /\.from\("creed_proposals"\)[\s\S]+\.eq\("creed_id", personalCreedId\)/);
  assert.match(creedBackend, /\.from\("creed_activity"\)[\s\S]+\.eq\("creed_id", personalCreedId\)/);
  assert.match(creedBackend, /\.from\("creed_connections"\)[\s\S]+\.eq\("creed_id", personalCreedId\)/);
  assert.match(creedBackend, /readMcpClientRows\(db, user\.id, personalCreedId\)/);
});
