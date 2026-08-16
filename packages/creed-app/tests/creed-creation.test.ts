import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  CREED_NAME_MAX_LENGTH,
  validateNewCreedInput,
} from "@creed/core/creed-creation";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("creation validation accepts trimmed Personal and Shared names", () => {
  assert.deepEqual(validateNewCreedInput({ name: "  Research  ", type: "personal" }), {
    ok: true,
    value: { name: "Research", type: "personal" },
  });
  assert.deepEqual(validateNewCreedInput({ name: "Studio", type: "shared" }), {
    ok: true,
    value: { name: "Studio", type: "shared" },
  });
});

test("creation validation rejects blank, long, and unknown input", () => {
  assert.equal(validateNewCreedInput({ name: " ", type: "personal" }).ok, false);
  assert.equal(
    validateNewCreedInput({
      name: "x".repeat(CREED_NAME_MAX_LENGTH + 1),
      type: "shared",
    }).ok,
    false,
  );
  assert.equal(validateNewCreedInput({ name: "Valid", type: "company" }).ok, false);
  assert.equal(validateNewCreedInput(null).ok, false);
});

test("creation migration permits unlimited Personal Creeds and owns the seed atomically", async () => {
  const baseline = (await source("../../apps/cloud/supabase/migrations/20260815155608_cloud_baseline.sql"))
    .replaceAll('"', "")
    .toLowerCase();
  assert.doesNotMatch(baseline, /creeds_one_personal_per_owner/);
  assert.match(baseline, /create or replace function public\.create_owned_creed\(/i);
  assert.match(baseline, /p_user_id uuid/i);
  assert.match(baseline, /if p_user_id is null/i);
  assert.match(baseline, /insert into public\.creeds/i);
  assert.match(baseline, /insert into public\.creed_members/i);
  assert.match(baseline, /role\)\s+values \(v_creed_id, p_user_id, 'owner'\)/i);
  assert.match(baseline, /insert into public\.creed_sections/i);
  assert.match(baseline, /grant all on function public\.create_owned_creed\(p_user_id uuid, p_name text, p_type text\) to service_role/i);
  assert.doesNotMatch(
    baseline,
    /grant all on function public\.create_owned_creed[^\n]*to authenticated/,
  );
});

test("neutral creation route authenticates, validates, activates, and opens the file", async () => {
  const route = await source("../creed-cloud/app/api/app/creeds/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /requireApiAuth\(\)/);
  assert.match(route, /validateNewCreedInput/);
  assert.match(route, /getSupabaseAdminClient/);
  assert.match(route, /\.rpc\("create_owned_creed"/);
  assert.match(route, /p_user_id: auth\.user\.id/);
  assert.match(route, /setActiveCreed/);
  assert.match(route, /forOnboarding/);
  assert.match(route, /onboarding_stage: "shared"/);
  assert.doesNotMatch(route, /setupPath/);
  assert.doesNotMatch(route, /company/i);
});

test("switcher keeps creation and identity affordances visible", async () => {
  const switcher = await source("components/creed/creed-switcher.tsx");
  assert.match(switcher, /<ShortcutKey className="hidden md:inline-flex">C<\/ShortcutKey>/);
  assert.match(switcher, /New Creed/);
  assert.match(switcher, /<Plus/);
  assert.doesNotMatch(switcher, /creeds\.length <= 1/);
  assert.doesNotMatch(switcher, /needsSetup/);
  assert.doesNotMatch(switcher, /\/onboarding\/shared\?creedId=/);

  const dialog = await source("components/creed/new-creed-dialog.tsx");
  assert.match(dialog, /label: "Personal"/);
  assert.match(dialog, /label: "Shared"/);
  assert.match(dialog, /autoFocus/);
  assert.match(dialog, /aria-pressed/);
  assert.match(dialog, /role="alert"/);
  assert.match(dialog, /Cancel/);
  assert.match(dialog, /Creating/);
  assert.doesNotMatch(dialog, /setupPath/);
});

test("mobile Shared switches skip realtime presence without forcing a reload", async () => {
  const provider = await source("components/creed/creed-provider.tsx");
  const presenceEffect = provider.indexOf(
    'window.matchMedia("(max-width: 767px)").matches',
  );
  const realtimeChannel = provider.indexOf("getSupabaseBrowserClient()", presenceEffect);

  assert.notEqual(presenceEffect, -1);
  assert.ok(realtimeChannel > presenceEffect);
  assert.match(provider.slice(presenceEffect, realtimeChannel), /typeof WebSocket/);
  assert.match(provider.slice(presenceEffect, realtimeChannel), /return;/);
  assert.doesNotMatch(provider, /window\.location\.reload\(\)/);
});
