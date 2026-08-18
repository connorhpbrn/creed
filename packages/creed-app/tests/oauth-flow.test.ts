import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildOAuthRedirectUri,
  isAllowedRedirectUri,
  isValidOAuthRedirectUri,
  verifyPkceS256,
} from "@creed/integrations/oauth-redirect";

function base64UrlSha256(input: string) {
  return createHash("sha256").update(input).digest("base64url");
}

test("PKCE S256 verifies the RFC 7636 challenge", () => {
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
  const challenge = base64UrlSha256(verifier);
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256(`${verifier}x`, challenge), false);
  assert.equal(verifyPkceS256("", challenge), false);
});

test("OAuth registration accepts secure web and native redirects only", () => {
  assert.equal(isValidOAuthRedirectUri("https://chatgpt.com/callback"), true);
  assert.equal(isValidOAuthRedirectUri("http://127.0.0.1:4567/callback"), true);
  assert.equal(isValidOAuthRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback"), true);
  assert.equal(isValidOAuthRedirectUri("http://example.com/callback"), false);
  assert.equal(isValidOAuthRedirectUri("https://user:pass@example.com/callback"), false);
  assert.equal(isValidOAuthRedirectUri("https://example.com/callback#fragment"), false);
  assert.equal(isValidOAuthRedirectUri("javascript:alert(1)"), false);
});

test("OAuth authorization responses preserve callback state and use query parameters", () => {
  const redirect = new URL(buildOAuthRedirectUri("http://127.0.0.1:3118/callback", {
    code: "creed_ac_test",
    state: "client-state",
  }));
  assert.equal(redirect.pathname, "/callback");
  assert.equal(redirect.searchParams.get("code"), "creed_ac_test");
  assert.equal(redirect.searchParams.get("state"), "client-state");
});

test("redirect URI allowlist is exact except for a loopback port", () => {
  const registered = [
    "https://chatgpt.com/connector/oauth/callback",
    "http://127.0.0.1:3118/callback",
    "cursor://anysphere.cursor-mcp/oauth/callback",
  ];
  assert.equal(
    isAllowedRedirectUri("https://chatgpt.com/connector/oauth/callback", registered),
    true,
  );
  assert.equal(
    isAllowedRedirectUri("https://evil.example/connector/oauth/callback", registered),
    false,
  );
  assert.equal(
    isAllowedRedirectUri("http://127.0.0.1:9999/callback", registered),
    true,
  );
  assert.equal(
    isAllowedRedirectUri("http://127.0.0.1:9999/other", registered),
    false,
  );
  assert.equal(
    isAllowedRedirectUri("http://localhost:9999/callback", registered),
    false,
  );
  assert.equal(
    isAllowedRedirectUri("http://127.0.0.1:9999/callback?other=1", registered),
    false,
  );
  assert.equal(
    isAllowedRedirectUri("http://[::1]:4000/callback", [
      "http://[::1]:3118/callback",
    ]),
    true,
  );
  assert.equal(
    isAllowedRedirectUri(
      "cursor://anysphere.cursor-mcp/oauth/callback",
      registered,
    ),
    true,
  );
});

test("OAuth surfaces advertise resource support and token Basic CORS", () => {
  const asMeta = readFileSync(
    new URL("../app/.well-known/oauth-authorization-server/route.ts", import.meta.url),
    "utf8",
  );
  const token = readFileSync(new URL("../app/token/route.ts", import.meta.url), "utf8");
  const decision = readFileSync(
    new URL("../../creed-cloud/app/authorize/decision/route.ts", import.meta.url),
    "utf8",
  );
  const retention = readFileSync(
    new URL(
      "../../../apps/cloud/supabase/migrations/20260815155608_cloud_baseline.sql",
      import.meta.url,
    ),
    "utf8",
  ).replaceAll('"', "").toLowerCase();
  const oauth = readFileSync(new URL("../lib/oauth.ts", import.meta.url), "utf8");

  assert.match(asMeta, /resource_parameter_supported:\s*true/);
  assert.match(token, /Authorization/);
  assert.match(decision, /invalid_scope/);
  assert.match(decision, /sec-fetch-site/);
  assert.match(retention, /does not delete clients/);
  assert.doesNotMatch(
    retention,
    /delete from public\.oauth_clients/,
  );
  assert.match(oauth, /getSiteUrl\(\)/);
  assert.match(oauth, /\.is\("revoked_at", null\)/);
});

test("MCP distinguishes missing bearer discovery from invalid token", () => {
  const mcp = readFileSync(new URL("../app/mcp/route.ts", import.meta.url), "utf8");
  assert.match(mcp, /function unauthorized\(/);
  assert.match(mcp, /function invalidToken\(/);
  assert.match(mcp, /error="invalid_token"/);
  assert.match(mcp, /lookupOAuthAccessToken\(bearer\)/);
  assert.match(mcp, /lookup\.status === "unavailable"/);
  assert.match(mcp, /resource_metadata=.*oauth-protected-resource\/mcp/);
});

test("OAuth token lifecycle is retryable without exposing partial successors", () => {
  const oauth = readFileSync(new URL("../lib/oauth.ts", import.meta.url), "utf8");
  const token = readFileSync(new URL("../app/token/route.ts", import.meta.url), "utf8");
  const cloud = readFileSync(
    new URL(
      "../../../apps/cloud/supabase/migrations/20260815155608_cloud_baseline.sql",
      import.meta.url,
    ),
    "utf8",
  )
    .replaceAll('"', "")
    .toLowerCase();
  const open = readFileSync(
    new URL(
      "../../../apps/open/supabase/migrations/20260815162526_open_baseline.sql",
      import.meta.url,
    ),
    "utf8",
  )
    .replaceAll('"', "")
    .toLowerCase();

  assert.match(oauth, /authorizationCodeHash/);
  assert.match(oauth, /parentTokenId/);
  assert.match(oauth, /ready_at/);
  assert.match(oauth, /REFRESH_REPLAY_GRACE_MS/);
  assert.doesNotMatch(oauth, /oauth_authorization_codes"\)\s*\.update[\s\S]{0,120}\.select/);
  assert.match(token, /completeAuthorizationCodeExchange/);
  for (const migration of [cloud, open]) {
    assert.match(migration, /create unique index oauth_tokens_authorization_code_hash_idx/);
    assert.match(migration, /create unique index oauth_tokens_parent_token_id_idx/);
    assert.match(migration, /ready_at timestamp with time zone/);
  }
});

test("OAuth consent always returns a GET callback after a validated decision", () => {
  for (const edition of ["creed-cloud", "creed-open"]) {
    const decision = readFileSync(
      new URL(`../../${edition}/app/authorize/decision/route.ts`, import.meta.url),
      "utf8",
    );
    assert.match(decision, /NextResponse\.redirect\(buildOAuthRedirectUri\(redirectUri, params\), 303\)/);
    assert.match(decision, /error: "server_error"/);
    assert.match(decision, /error: "login_required"/);
    assert.match(decision, /requestedScopes\.some/);
  }
});
