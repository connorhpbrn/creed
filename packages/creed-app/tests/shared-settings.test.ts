import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const settings = read("components/creed/settings-screen.tsx");
const sharedSettings = read("../creed-cloud/components/creed/shared-settings.tsx");

test("settings selects the active Creed and keeps common sections", () => {
  assert.match(settings, /state\.creedType === "shared"/);
  for (const heading of [
    "Profile",
    "Agent edit behaviour",
    "Integrations",
    "Model usage",
    "Version control",
    "Archived",
    "Data",
  ]) {
    assert.match(settings, new RegExp(heading));
    assert.match(sharedSettings, new RegExp(heading));
  }
});

test("Shared settings expose collaboration only for the right roles", () => {
  assert.match(sharedSettings, /const isManager = role === "owner" \|\| role === "admin"/);
  assert.match(sharedSettings, /const isOwner = role === "owner"/);
  assert.match(sharedSettings, /Members & permissions/);
  assert.match(sharedSettings, /if \(isManager\)/);
  assert.match(sharedSettings, /if \(isOwner\)/);
  assert.match(sharedSettings, /Transfer ownership/);
  assert.match(sharedSettings, /Delete Creed/);
});

test("legacy settings, onboarding, marketing, and seat UI are absent", () => {
  for (const path of [
    "components/creed/company-settings.tsx",
    "components/creed/company-onboarding-screen.tsx",
    "components/marketing/company-page-view.tsx",
    "components/creed/buy-seats-dialog.tsx",
    "components/creed/remove-seats-dialog.tsx",
    "lib/seat-config.ts",
  ]) {
    assert.equal(existsSync(join(root, path)), false, path);
  }
  assert.doesNotMatch(sharedSettings, /\bseats?\b|company billing/i);
});
