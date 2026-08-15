import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { contentSecurityPolicy, requiresCspNonce } from "../lib/csp-policy.ts";
import {
  issueCsrfToken,
  verifyCsrfToken,
  OAUTH_CSRF_MAX_AGE,
} from "@creed/integrations/oauth-csrf-core";
import { normalizeRichTextInput } from "@creed/core/rich-text";
import { sanitizeNextPath } from "../lib/safe-next.ts";
import { oauthPermissionCeiling, parseOAuthMcpScopes } from "@creed/core/oauth-scopes";

test("rich text removes executable markup and unsafe links", () => {
  const html = normalizeRichTextInput({
    contentHtml: '<p onclick="alert(1)">Safe<script>alert(1)</script><a href="javascript:alert(1)">link</a></p>',
  });
  assert.equal(html, "<p>Safe<a>link</a></p>");
});

test("rich text preserves the editor allow-list", () => {
  const html = normalizeRichTextInput({
    contentHtml: '<blockquote class="creed-callout"><p><span class="creed-inline-tag" data-tag="goals">Goals</span> <a href="https://example.com">link</a></p></blockquote>',
  });
  assert.match(html, /creed-callout/);
  assert.match(html, /data-tag="goals"/);
  assert.match(html, /href="https:\/\/example.com"/);
});

test("next redirects remain same-origin paths", () => {
  assert.equal(sanitizeNextPath("/settings?tab=ai#key"), "/settings?tab=ai#key");
  assert.equal(sanitizeNextPath("//evil.example"), "/");
  assert.equal(sanitizeNextPath("/\\evil.example"), "/");
  assert.equal(sanitizeNextPath("https://evil.example"), "/");
});

test("OAuth direct-edit scope does not depend on propose scope", () => {
  const directOnly = parseOAuthMcpScopes("read direct_edit");
  assert.equal(oauthPermissionCeiling(directOnly), "direct");
  assert.equal(directOnly.propose, false);
  assert.equal(directOnly.directEdit, true);
});

test("MCP rejects abusive bearer traffic before access-token lookup", () => {
  const source = readFileSync(new URL("../app/mcp/route.ts", import.meta.url), "utf8");
  const limiter = source.indexOf('scope: "creed-mcp-auth"');
  const lookup = source.indexOf("lookupOAuthAccessToken(bearer)");

  assert.notEqual(limiter, -1);
  assert.notEqual(lookup, -1);
  assert.ok(limiter < lookup);
});

test("strict CSP uses proxy nonces without a manual layout nonce", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../../creed-app/proxy.ts", import.meta.url), "utf8");

  assert.doesNotMatch(layout, /from ["']next\/headers["']/);
  assert.match(layout, /src="\/theme-init\.js"/);
  assert.match(proxy, /requestHeaders\.set\("x-nonce", nonce\)/);
  assert.match(contentSecurityPolicy("abc123"), /'nonce-abc123'/);
});

test("the nonce policy covers the app and credential surface, and nothing else", () => {
  // The root layout must NOT force dynamic rendering: that applied the nonce
  // policy's per-request cost to the marketing pages too, and blocked their
  // JSON-LD. Scope belongs to lib/csp-policy.
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(layout, /^export const dynamic/m);

  for (const pathname of [
    "/",
    "/file",
    "/connections",
    "/settings",
    "/onboarding",
    "/onboarding/shared",
    "/invite/abc",
    "/payment/success",
    "/login",
    "/signup",
    "/reset-password",
    "/authorize",
  ]) {
    assert.equal(requiresCspNonce(pathname), true, `${pathname} must get a nonce`);
  }

  for (const pathname of [
    "/home",
    "/pricing",
    "/changelog",
    "/roadmap",
    "/bench",
    "/stack",
    "/terms",
    "/privacy",
    "/payment/cancelled",
  ]) {
    assert.equal(
      requiresCspNonce(pathname),
      false,
      `${pathname} is prerendered, so a nonce would block its own scripts`,
    );
  }
});

test("nonce and inline policies stay mutually exclusive", () => {
  // A browser ignores 'unsafe-inline' whenever a nonce is present, so emitting
  // both would silently drop the inline allowance the public pages depend on.
  const withNonce = contentSecurityPolicy("abc123");
  const withoutNonce = contentSecurityPolicy(null);

  assert.match(withNonce, /script-src [^;]*'nonce-abc123'/);
  assert.doesNotMatch(withNonce, /script-src [^;]*unsafe-inline/);
  assert.match(withoutNonce, /script-src [^;]*'unsafe-inline'/);
  assert.doesNotMatch(withoutNonce, /nonce-/);

  // Everything outside script-src is identical between the two.
  const directives = (csp: string) =>
    csp.split("; ").filter((directive) => !directive.startsWith("script-src "));
  assert.deepEqual(directives(withNonce), directives(withoutNonce));
});

test("OAuth consent CSP allows https, loopback http, and cursor form redirects", () => {
  const consent = contentSecurityPolicy("abc123", { oauthConsent: true });
  const app = contentSecurityPolicy("abc123");
  assert.match(
    consent,
    /form-action 'self' https: http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\* http:\/\/\[::1\]:\* cursor:/,
  );
  assert.match(app, /form-action 'self'/);
  assert.doesNotMatch(app, /form-action 'self' https:/);
});

test("every nonce route renders per request", () => {
  // A prerendered route under the nonce policy ships HTML whose scripts the
  // browser refuses to run, so each prefix needs `force-dynamic` on its page or
  // on a layout above it.
  const declaresDynamic = (relativePath: string) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    return /export const dynamic = "force-dynamic"/.test(source);
  };

  for (const file of [
    "../../creed-cloud/app/page.tsx",
    "../../creed-cloud/app/(creed-app)/layout.tsx",
    "../app/onboarding/layout.tsx",
    "../../creed-cloud/app/invite/[token]/page.tsx",
    "../../creed-cloud/app/payment/success/page.tsx",
    "../../creed-cloud/app/login/page.tsx",
    "../../creed-cloud/app/signup/page.tsx",
    "../../creed-cloud/app/reset-password/page.tsx",
    "../../creed-cloud/app/authorize/page.tsx",
  ]) {
    assert.equal(declaresDynamic(file), true, `${file} must declare force-dynamic`);
  }
});

test("consent tokens bind to the session user and never to a cookie", () => {
  const secret = "test-csrf-secret";
  const token = issueCsrfToken(secret, "user-a");

  assert.equal(verifyCsrfToken(secret, token, "user-a"), true);
  // A token minted for one account cannot authorise another's consent POST.
  assert.equal(verifyCsrfToken(secret, token, "user-b"), false);
  assert.equal(verifyCsrfToken(secret, "", "user-a"), false);
  assert.equal(verifyCsrfToken(secret, token, ""), false);
  assert.equal(verifyCsrfToken(secret, `${token}tampered`, "user-a"), false);
  assert.equal(verifyCsrfToken("other-secret", token, "user-a"), false);
  // Expiry is enforced from the timestamp baked into the payload.
  const issuedAt = 1_000_000;
  const old = issueCsrfToken(secret, "user-a", issuedAt);
  assert.equal(verifyCsrfToken(secret, old, "user-a", issuedAt + 60_000), true);
  assert.equal(
    verifyCsrfToken(secret, old, "user-a", issuedAt + (OAUTH_CSRF_MAX_AGE + 1) * 1000),
    false,
  );

  // The consent screen is a Server Component: `cookies().set()` throws there, so
  // every paid user reaching it crashed into the error boundary and MCP auth
  // could not complete. Nothing on this page may write a cookie again.
  const page = readFileSync(new URL("../../creed-cloud/app/authorize/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /cookies\(\)/);
  assert.match(page, /issueOAuthCsrfToken\(user\.id\)/);

  // And the decision route must check the token against the resolved session.
  const decision = readFileSync(
    new URL("../../creed-cloud/app/authorize/decision/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(decision, /verifyOAuthCsrfToken\(csrfToken, user\.id\)/);
  // Compare against the call site, not the import at the top of the file.
  const verifyAt = decision.indexOf("verifyOAuthCsrfToken(csrfToken, user.id)");
  assert.ok(
    decision.indexOf("supabase.auth.getUser()") < verifyAt,
    "the token check needs the session user, so it must come after it is resolved",
  );
  assert.ok(
    verifyAt < decision.indexOf("issueAuthorizationCode({"),
    "no authorization code may be issued before the token is verified",
  );
});

test("the consent screen degrades to a message instead of the error boundary", () => {
  const page = readFileSync(new URL("../../creed-cloud/app/authorize/page.tsx", import.meta.url), "utf8");

  assert.match(page, /try \{\s*return await renderAuthorize\(params\)/);
  assert.match(page, /log\.error\("authorize consent screen failed"/);
});

test("OAuth baseline keeps resources portable and cleanup serialized", () => {
  const migration = readFileSync(
    new URL("../../../apps/cloud/supabase/migrations/20260815155608_cloud_baseline.sql", import.meta.url),
    "utf8",
  ).replaceAll('"', "").toLowerCase();

  assert.match(
    migration,
    /create table if not exists public\.oauth_authorization_codes \([\s\S]*resource text[\s\S]*\);/i,
  );
  assert.match(
    migration,
    /create table if not exists public\.oauth_tokens \([\s\S]*resource text[\s\S]*\);/i,
  );
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /DELETE FROM public\.oauth_authorization_codes/i);
  assert.match(migration, /DELETE FROM public\.oauth_tokens/i);
});
