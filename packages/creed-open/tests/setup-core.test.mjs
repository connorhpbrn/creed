import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRemoteReadiness,
  getSupabaseProjectRef,
  isPublishableKey,
  isSecretKey,
  mergeEnvironment,
  parseEnvironment,
  validateEnvironment,
  validateSiteUrl,
} from "../scripts/setup-core.mjs";

test("environment merging preserves comments and unrelated values", () => {
  const source = "# Existing configuration\nUNCHANGED=value\nNEXT_PUBLIC_SITE_URL=http://old.local\n";
  const merged = mergeEnvironment(source, {
    NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
    CREED_OWNER_SECRET: "owner-secret",
  });

  assert.match(merged, /^# Existing configuration/m);
  assert.match(merged, /^UNCHANGED=value$/m);
  assert.match(merged, /^NEXT_PUBLIC_SITE_URL=http:\/\/localhost:3001$/m);
  assert.match(merged, /^CREED_OWNER_SECRET=owner-secret$/m);
  assert.equal((merged.match(/NEXT_PUBLIC_SITE_URL=/g) ?? []).length, 1);
});

test("environment parsing ignores comments and preserves values containing equals", () => {
  assert.deepEqual(parseEnvironment("# comment\nA=one=two\nB=three\n"), {
    A: "one=two",
    B: "three",
  });
});

test("project references are derived only from hosted Supabase URLs", () => {
  assert.equal(
    getSupabaseProjectRef("https://abcdefghijklmnopqrst.supabase.co"),
    "abcdefghijklmnopqrst",
  );
  assert.equal(getSupabaseProjectRef("http://abcdefghijklmnopqrst.supabase.co"), null);
  assert.equal(getSupabaseProjectRef("https://example.com"), null);
});

test("site URLs allow HTTPS origins and loopback development only", () => {
  assert.equal(validateSiteUrl("https://creed.example"), true);
  assert.equal(validateSiteUrl("http://localhost:3001"), true);
  assert.equal(validateSiteUrl("http://127.0.0.1:3001"), true);
  assert.equal(validateSiteUrl("http://creed.example"), false);
  assert.equal(validateSiteUrl("https://creed.example/path"), false);
});

test("environment validation checks required values and secret strength", () => {
  const valid = {
    NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    SUPABASE_SECRET_KEY: "sb_secret_example",
    CREED_OWNER_SECRET: "o".repeat(32),
    CREED_ENCRYPTION_SECRET: "e".repeat(32),
  };
  assert.deepEqual(validateEnvironment(valid), []);
  assert.match(validateEnvironment({ ...valid, CREED_OWNER_SECRET: "short" })[0], /32 characters/);
});

test("legacy Supabase keys cannot be swapped between browser and server", () => {
  const legacyKey = (role) => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
    return `${header}.${payload}.signature`;
  };
  const anon = legacyKey("anon");
  const serviceRole = legacyKey("service_role");

  assert.equal(isPublishableKey(anon), true);
  assert.equal(isSecretKey(anon), false);
  assert.equal(isSecretKey(serviceRole), true);
  assert.equal(isPublishableKey(serviceRole), false);
});

test("remote readiness verifies the exact schema version without exposing keys", async () => {
  const values = {
    NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    SUPABASE_SECRET_KEY: "sb_secret_example",
    CREED_OWNER_SECRET: "o".repeat(32),
    CREED_ENCRYPTION_SECRET: "e".repeat(32),
  };
  const requests = [];
  const readiness = await checkRemoteReadiness(values, async (url, options) => {
    requests.push({ url, options });
    return url.endsWith("/auth/v1/settings")
      ? new Response("{}", { status: 200 })
      : new Response(JSON.stringify("20260818034113"), { status: 200 });
  });

  assert.deepEqual(readiness, { ready: true, schemaVersion: "20260818034113" });
  assert.equal(requests[0].url.endsWith("/auth/v1/settings"), true);
  assert.equal(requests[0].options.headers.apikey, values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(requests[1].url.endsWith("/rest/v1/rpc/creed_schema_version"), true);
  assert.equal(requests[1].options.headers.apikey, values.SUPABASE_SECRET_KEY);
  assert.equal("authorization" in requests[1].options.headers, false);
});

test("remote readiness stops when Supabase rejects the publishable key", async () => {
  const values = {
    NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    SUPABASE_SECRET_KEY: "sb_secret_example",
    CREED_OWNER_SECRET: "o".repeat(32),
    CREED_ENCRYPTION_SECRET: "e".repeat(32),
  };
  let requests = 0;
  const readiness = await checkRemoteReadiness(values, async () => {
    requests += 1;
    return new Response("{}", { status: 401 });
  });

  assert.deepEqual(readiness, { ready: false, reason: "publishable-key" });
  assert.equal(requests, 1);
});
