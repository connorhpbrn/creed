import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("first run asks for type first, defaults personal, and branches by selection", async () => {
  const screen = await source("components/creed/onboarding-screen.tsx");
  assert.match(screen, /Who is this Creed for\?/);
  assert.match(screen, /label="Personal"/);
  assert.match(screen, /label="Shared"/);
  assert.match(
    screen,
    /useState<"personal" \| "shared" \| null>\(\s*"personal",?\s*\)/,
  );
  assert.match(screen, /const TYPE_STEP = 0/);
  assert.match(screen, /const WELCOME_STEP = 1/);
  assert.match(screen, /setStep\(WELCOME_STEP\)/);
  assert.doesNotMatch(screen, /forOnboarding: true/);
  assert.match(screen, /router\.push\("\/onboarding\/shared"\)/);
  assert.match(screen, /handleSkip/);
  assert.doesNotMatch(screen, /↵ to continue/);
  assert.doesNotMatch(
    screen,
    /onFocus=\{\(\) => iconRef\.current\?\.startAnimation\(\)\}/,
  );
});

test("Shared onboarding returns to the type picker and keeps a permanent Skip", async () => {
  const screen = await source(
    "../creed-cloud/components/creed/shared-onboarding-screen.tsx",
  );
  const page = await source("../creed-cloud/app/onboarding/page.tsx");
  assert.match(screen, /onPreviewBackToType/);
  assert.match(screen, /\/onboarding\?pick=1/);
  assert.match(screen, /handleSkipOnboarding/);
  assert.doesNotMatch(screen, /↵ to continue/);
  assert.doesNotMatch(screen, /exitToPersonal/);
  assert.match(page, /forceTypePick/);
  assert.match(page, /pick === "1"/);
});

test("Shared onboarding persists only at completion and checks out unpaid owners", async () => {
  const screen = await source(
    "../creed-cloud/components/creed/shared-onboarding-screen.tsx",
  );
  assert.match(screen, /async function persistSharedCreed/);
  assert.match(screen, /forOnboarding: true/);
  assert.match(screen, /await persistSharedCreed/);
  assert.match(screen, /if \(!paid\)/);
  assert.match(screen, /await startCheckout/);
});

test("Bonus credits render only when a subscription allowance exists", async () => {
  const [personal, shared, account] = await Promise.all([
    source("components/creed/settings-screen.tsx"),
    source("../creed-cloud/components/creed/shared-settings.tsx"),
    source("../creed-cloud/components/creed/account-dialog.tsx"),
  ]);
  assert.match(personal, /credits\?\.allowanceResets && isCreditsHome/);
  assert.match(shared, /allowanceResets && isCreditsHome/);
  assert.match(account, /\{bonusResets \? \(/);
});

test("Shared onboarding copy is neutral and has no plan or seat assumptions", async () => {
  const [screen, compiler, prompt] = await Promise.all([
    source("../creed-cloud/components/creed/shared-onboarding-screen.tsx"),
    source("../creed-cloud/lib/onboarding/compile-shared.ts"),
    source("../creed-core/creed-prompts.ts"),
  ]);
  const userFacing = `${screen}\n${compiler}\n${prompt}`;
  assert.doesNotMatch(userFacing, /company Creed|your company|whole company/i);
  assert.doesNotMatch(userFacing, /\bseat(s)?\b|\bbilling\b/i);
  // Checkout API still passes plan: "personal"; that is not user-facing copy.
  assert.doesNotMatch(
    userFacing.replace(/plan:\s*"personal"/g, ""),
    /\bplan\b/i,
  );
  assert.match(userFacing, /Shared Creed/);
  assert.match(userFacing, /Invite others/);
});

test("additional Creeds open in the file without a setup divert", async () => {
  const [switcher, route, createReady] = await Promise.all([
    source("components/creed/creed-switcher.tsx"),
    source("../creed-cloud/app/api/app/creeds/route.ts"),
    source(
      "../persistence/supabase/migrations/20260808140000_creed_create_ready.sql",
    ),
  ]);
  assert.doesNotMatch(switcher, /\/onboarding\/shared\?creedId=/);
  assert.doesNotMatch(route, /\/onboarding\/shared\?creedId=/);
  assert.match(
    createReady,
    /onboarding_stage\)\s+values \(p_type, p_name, v_user_id, null\)/,
  );
  await assert.rejects(source("app/onboarding/additional-creed/page.tsx"));
  await assert.rejects(
    source("components/creed/additional-creed-setup-screen.tsx"),
  );
});

test("setup API authenticates, checks ownership, and clears resume state", async () => {
  const route = await source(
    "../creed-cloud/app/api/app/creeds/onboarding/route.ts",
  );
  assert.match(route, /requireApiAuth\(\)/);
  assert.match(
    route,
    /getCreedRole\(auth\.supabase, auth\.user\.id, creedId\)/,
  );
  assert.match(route, /role !== "owner"/);
  assert.match(route, /apply_creed_onboarding_action/);
  for (const action of ["complete", "seed-shared", "compose"]) {
    assert.match(route, new RegExp(`p_action: "${action}"`));
  }
  assert.doesNotMatch(route, /seed-personal/);
  assert.doesNotMatch(route, /\.from\("creed_sections"\)\s*\.delete\(\)/);
  assert.match(route, /setActiveCreed\(auth\.supabase, auth\.user, creedId\)/);
});

test("unknown setup actions are rejected before database mutation", async () => {
  const route = await source(
    "../creed-cloud/app/api/app/creeds/onboarding/route.ts",
  );
  assert.match(route, /Unknown onboarding action\./);
  assert.match(route, /\{ status: 400 \}/);
});

test("Personal claim and compose use the same transactional onboarding RPC", async () => {
  const [claim, compose] = await Promise.all([
    source("../creed-cloud/app/api/app/claim/route.ts"),
    source("app/api/app/onboarding/compose/route.ts"),
  ]);
  assert.match(claim, /apply_creed_onboarding_action/);
  assert.match(claim, /p_action: "replace-placeholder"/);
  assert.match(compose, /apply_creed_onboarding_action/);
  assert.match(compose, /p_action: "compose"/);
  assert.doesNotMatch(claim, /persistCreedState/);
  assert.doesNotMatch(compose, /persistCreedState/);
});

test("legacy Company onboarding route is removed", async () => {
  await assert.rejects(source("app/onboarding/company/page.tsx"));
  const shared = await source("../creed-cloud/app/onboarding/shared/page.tsx");
  assert.match(shared, /if \(creedId\)/);
  assert.match(shared, /\.eq\("user_id", user\.id\)/);
  assert.match(shared, /joined\?\.role !== "owner"/);
});
