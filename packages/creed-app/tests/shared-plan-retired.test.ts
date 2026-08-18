import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("old Company and billing app routes are absent", () => {
  for (const path of [
    "app/api/app/company",
    "app/api/app/billing/plans/route.ts",
  ]) assert.equal(existsSync(join(root, path)), false, path);
});

test("neutral Creed routes require API authentication", () => {
  const routes = [
    "../creed-cloud/app/api/app/creeds/route.ts",
    "../creed-cloud/app/api/app/creeds/invites/route.ts",
    "../creed-cloud/app/api/app/creeds/permissions/route.ts",
    "../creed-cloud/app/api/app/creeds/members/[userId]/route.ts",
  ];
  for (const route of routes) assert.match(read(route), /requireApiAuth\(\)/, route);
});

test("shared collaboration does not depend on billing or seats", () => {
  for (const path of [
    "lib/creed-membership.ts",
    "../creed-cloud/lib/shared-admin.ts",
    "lib/shared-sections.ts",
    "../creed-cloud/lib/creed-invites.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /creed_company_billing|company-billing|no_seats|frozenResult/, path);
  }
});

test("renamed backend modules replace Company-prefixed files", () => {
  for (const path of [
    "../creed-cloud/lib/shared-admin.ts",
    "lib/shared-sections.ts",
    "../creed-cloud/lib/shared-github.ts",
    "../creed-cloud/lib/creed-invites.ts",
    "../creed-cloud/lib/creed-version-control.ts",
  ]) assert.equal(existsSync(join(root, path)), true, path);
  for (const path of [
    "lib/company-admin.ts",
    "lib/company-sections.ts",
    "lib/company-github.ts",
    "lib/company-invites.ts",
    "lib/company-version-control.ts",
    "lib/company-billing.ts",
  ]) assert.equal(existsSync(join(root, path)), false, path);
});
