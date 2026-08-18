import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  emailHasCloudAccess,
  parseCloudAccessMode,
  parseCloudTesterEmails,
} from "../../creed-cloud/lib/cloud-access-core.ts";

test("Cloud access defaults to public when the temporary flag is absent", () => {
  assert.equal(parseCloudAccessMode(undefined), "public");
  assert.equal(emailHasCloudAccess("public", new Set(), undefined), true);
});

test("private Cloud access normalizes and restricts tester emails", () => {
  const testers = parseCloudTesterEmails(" One@Example.com, two@example.com, ");
  assert.equal(emailHasCloudAccess("private", testers, "one@example.com"), true);
  assert.equal(emailHasCloudAccess("private", testers, " TWO@example.com "), true);
  assert.equal(emailHasCloudAccess("private", testers, "other@example.com"), false);
  assert.equal(emailHasCloudAccess("private", testers, null), false);
});

test("private tester access survives switching to a Shared Creed", async () => {
  const root = new URL("../", import.meta.url);
  const [home, layout] = await Promise.all([
    readFile(new URL("../creed-cloud/app/page.tsx", root), "utf8"),
    readFile(new URL("../creed-cloud/app/(creed-app)/layout.tsx", root), "utf8"),
  ]);

  assert.match(home, /const hasAccess = paid \|\| \(sharedAccess && paidSharedAccess\)/);
  assert.match(
    layout,
    /const hasAccess = cloudEntitled \|\| \(sharedAccess && sharedOwnerEntitled\)/,
  );
});
