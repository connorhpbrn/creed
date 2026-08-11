import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isAllowedRedirectUri,
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

test("redirect URI allowlist is exact for https and port-flexible for loopback", () => {
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
      "../../persistence/supabase/migrations/20260809020000_oauth_client_retention.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const oauth = readFileSync(new URL("../lib/oauth.ts", import.meta.url), "utf8");

  assert.match(asMeta, /resource_parameter_supported:\s*true/);
  assert.match(token, /Authorization/);
  assert.match(decision, /invalid_scope/);
  assert.match(decision, /sec-fetch-site/);
  assert.match(retention, /Does not delete clients/);
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
});
