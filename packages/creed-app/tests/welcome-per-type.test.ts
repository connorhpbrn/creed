import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { shouldShowWelcome } from "@creed/core/welcome-state";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("welcome show rule treats missing dismissal as show and post-paid dismissal as hide", () => {
  assert.equal(shouldShowWelcome("2026-01-01T00:00:00.000Z", null), true);
  assert.equal(
    shouldShowWelcome("2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"),
    false,
  );
  assert.equal(
    shouldShowWelcome("2026-03-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"),
    true,
  );
  assert.equal(shouldShowWelcome(null, null), false);
});

test("welcome is tracked once per Creed type", async () => {
  const [migration, stripe, layout, shell, dialog, seen] = await Promise.all([
    source("../../apps/cloud/supabase/migrations/20260815155608_cloud_baseline.sql")
      .then((sql) => sql.replaceAll('"', "").toLowerCase()),
    source("../creed-cloud/lib/stripe.ts"),
    source("../creed-cloud/app/(creed-app)/layout.tsx"),
    source("components/creed/app-shell-layout.tsx"),
    source("components/creed/welcome-dialog.tsx"),
    source("../creed-cloud/app/api/welcome/seen/route.ts"),
  ]);
  assert.match(migration, /welcomed_personal_at/);
  assert.match(migration, /welcomed_shared_at/);
  assert.match(stripe, /showPersonal/);
  assert.match(stripe, /showShared/);
  assert.match(stripe, /welcomed_shared_at/);
  assert.match(layout, /showWelcomePersonal/);
  assert.match(layout, /showWelcomeShared/);
  assert.match(shell, /sharedRole === "owner"/);
  assert.match(dialog, /welcomeStorageKey\(variant\)/);
  assert.match(dialog, /JSON\.stringify\(\{ variant \}\)/);
  assert.match(dialog, /hostedAccounts/);
  assert.match(dialog, /if \(!persistWelcomeOnServer\) return/);
  assert.match(seen, /parseVariant/);
  assert.match(seen, /markEntitlementWelcomed\(user\.id, variant\)/);
});
