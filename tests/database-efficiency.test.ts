import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backend = readFileSync("lib/creed-backend.ts", "utf8");
const companySections = readFileSync("lib/company-sections.ts", "utf8");
const github = readFileSync("lib/github.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260801173419_finish_database_efficiency.sql",
  "utf8",
);

test("personal persistence writes only changed rows", () => {
  assert.match(backend, /if \(current && !contentChanged && !metadataChanged\) return \[\]/);
  assert.match(backend, /existingActivityIds\.has\(entry\.id\)/);
  assert.match(backend, /tokenSettings\?\.require_approval !== state\.settings\.requireApproval/);
});

test("wide history reads use explicit columns and bounded agent payloads", () => {
  assert.match(backend, /const PROPOSAL_SELECT =/);
  assert.match(backend, /const ACTIVITY_SELECT =/);
  assert.match(backend, /proposalLimit: 100,[\s\S]*activityLimit: 100/);
});

test("section reorders are batched and privileged", () => {
  assert.match(companySections, /rpc\("update_creed_section_positions"/);
  assert.match(migration, /from unnest\(p_section_ids\) with ordinality/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /creed_proposals_user_id_idx/);
});

test("independent GitHub snapshot reads run together", () => {
  assert.match(github, /const \[file, commits\] = await Promise\.all/);
});
