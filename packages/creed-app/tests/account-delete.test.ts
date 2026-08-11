import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("account delete clears credit home before auth user delete", () => {
  const route = source("../../creed-cloud/app/api/app/account/route.ts");
  const homeMigration = source(
    "../../persistence/supabase/migrations/20260808160000_credits_home_creed.sql",
  );

  // The restrict exists so Creed delete can reassign the pot deliberately.
  assert.match(
    homeMigration,
    /creed_id uuid not null references public\.creeds\(id\) on delete restrict/,
  );

  // Account delete must remove the home row first or owned-Creed cascade fails.
  const homeClearAt = route.indexOf('from("creed_credit_homes")');
  const creedsDeleteAt = route.indexOf('.eq("owner_user_id", userId)');
  const deleteUserAt = route.indexOf("admin.deleteUser");
  assert.ok(homeClearAt >= 0, "expected creed_credit_homes delete");
  assert.ok(creedsDeleteAt >= 0, "expected owned creeds delete");
  assert.ok(deleteUserAt >= 0, "expected auth admin.deleteUser");
  assert.ok(
    homeClearAt < creedsDeleteAt && creedsDeleteAt < deleteUserAt,
    "credit home, then owned creeds, then deleteUser",
  );
  assert.match(route, /\.delete\(\)\s*\.eq\("user_id", userId\)/);
});

test("account delete does not block success on signOut", () => {
  const route = source("../../creed-cloud/app/api/app/account/route.ts");
  assert.match(route, /Promise\.race/);
  assert.match(route, /auth\.signOut\(\)/);
  const signOutAt = route.indexOf("auth.signOut()");
  const okAt = route.indexOf("NextResponse.json({ ok: true })");
  assert.ok(signOutAt >= 0 && okAt > signOutAt);
});

test("client account delete fails closed when persistence is off", () => {
  const provider = source("../components/creed/creed-provider.tsx");
  assert.match(
    provider,
    /if \(!persistenceEnabled\) \{\s*throw new Error\("Account deletion requires a configured backend\."\)/,
  );
});
