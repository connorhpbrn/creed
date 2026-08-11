import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const baseline = readFileSync(
  new URL("../../persistence/supabase/migrations/20260808100000_creed_baseline.sql", import.meta.url),
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

function tableDefinition(name: string) {
  const start = baseline.indexOf(`create table public.${name} (`);
  assert.notEqual(start, -1, `missing ${name}`);
  const bodyStart = baseline.indexOf("\n", start) + 1;
  const end = baseline.indexOf("\n);", bodyStart);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return baseline.slice(bodyStart, end);
}

test("baseline defines only personal and shared Creed types", () => {
  assert.match(baseline, /check \(type in \('personal', 'shared'\)\)/);
  assert.match(baseline, /primary key \(creed_id, section_id\)/);
  assert.doesNotMatch(baseline, /company/i);
});

test("baseline contains no workspace billing, seats, or lifetime purchases", () => {
  assert.doesNotMatch(baseline, /creed_company_billing/i);
  assert.doesNotMatch(baseline, /\bseat(?:s|_\w*)?\b/i);
  assert.doesNotMatch(baseline, /\blifetime\b/i);
});

test("ownership transfer validates inside the database transaction", () => {
  assert.match(baseline, /create or replace function public\.transfer_creed_ownership/);
  assert.match(baseline, /source user is not the shared owner/);
  assert.match(baseline, /target user is not an active non-owner member/);
  assert.match(baseline, /expected exactly one outgoing owner/);
  assert.match(baseline, /expected exactly one incoming owner/);
});

test("onboarding writes are owner-checked atomic RPC actions", () => {
  assert.match(baseline, /create or replace function public\.apply_creed_onboarding_action/);
  assert.match(baseline, /actor is not the creed owner/);
  for (const action of [
    "complete",
    "seed-personal",
    "seed-shared",
    "replace-placeholder",
    "compose",
  ]) {
    assert.match(baseline, new RegExp(`p_action (?:=|in \\([^)]*) '${action}'`));
  }
  assert.match(
    baseline,
    /revoke all on function public\.apply_creed_onboarding_action[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    baseline,
    /grant execute on function public\.apply_creed_onboarding_action[\s\S]*to service_role/,
  );
});

test("Creed token changes touch their exact Personal or Shared Creed", () => {
  assert.match(
    baseline,
    /create trigger touch_creed_sync_tick\s+after insert or update or delete on public\.creed_tokens\s+for each row execute function private\.touch_creed_sync_tick\(\)/,
  );
  assert.doesNotMatch(
    baseline,
    /on public\.creed_tokens\s+for each row execute function private\.touch_personal_creed_sync_tick\(\)/,
  );
});

test("credit spend aggregate is no longer callable by authenticated clients", () => {
  assert.match(
    baseline,
    /revoke all on function public\.credit_spend_total\(uuid\) from public, anon, authenticated/,
  );
  assert.match(baseline, /grant execute on function public\.credit_spend_total\(uuid\) to service_role/);
});

test("credits are exclusively Creed scoped", () => {
  assert.doesNotMatch(tableDefinition("creed_credits"), /\buser_id\b/);
  assert.doesNotMatch(tableDefinition("creed_credit_transactions"), /^\s*user_id\b/m);
  assert.match(tableDefinition("creed_credit_transactions"), /\bspent_by_user_id\b/);
  assert.doesNotMatch(
    baseline,
    /function public\.debit_credits\(uuid, bigint, text, text\)/,
  );
  assert.doesNotMatch(baseline, /function public\.credit_spend_total\(\)/);
  assert.doesNotMatch(baseline, /creed_credits_user_id_idx/);
  assert.doesNotMatch(baseline, /creed_credit_transactions_user_created_idx/);
});

test("settings and GitHub persistence use one Creed-scoped table each", () => {
  for (const table of [
    "creed_ai_settings",
    "creed_integrations",
    "creed_version_control",
  ]) {
    assert.match(tableDefinition(table), /\bcreed_id\b/);
    assert.doesNotMatch(tableDefinition(table), /^\s*user_id\b/m);
  }
  assert.doesNotMatch(
    baseline,
    /creed_(?:shared|shared)_(?:ai_settings|version_control|github_integration)/,
  );
});

test("mcp read usage increments by Creed scope", () => {
  assert.match(baseline, /create or replace function public\.increment_mcp_read_for_creed/);
  assert.match(baseline, /insert into public\.creed_mcp_read_events \(creed_id, user_id, client_id, day, read_count\)/);
  assert.match(baseline, /on conflict \(creed_id, client_id, day\)/);
  assert.match(baseline, /reader is not an active member of this creed/);
  assert.doesNotMatch(
    baseline,
    /from public\.creed_members[\s\S]{0,200}\bstatus\s*=\s*'active'/,
  );
  assert.match(
    baseline,
    /revoke all on function public\.increment_mcp_read_for_creed\(uuid, uuid, text, date\) from public, anon, authenticated/,
  );
});

test("HTTP credentials are keyed and resolved by Creed", () => {
  assert.match(tableDefinition("creed_tokens"), /\bcreed_id uuid primary key\b/);
  assert.match(creedBackend, /\.select\("user_id, creed_id"\)/);
  assert.match(creedBackend, /loadCreedState\(db, userData\.user, \{[\s\S]*creedId,/);
  assert.match(creedBackend, /ensureTokenRow\(db, user\.id, personalCreedId\)/);
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
