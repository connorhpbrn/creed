import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { contentSecurityPolicy, requiresCspNonce } from "../lib/csp-policy.ts";
import { normalizeRichTextInput } from "../lib/rich-text.ts";
import { sanitizeNextPath } from "../lib/safe-next.ts";
import { oauthPermissionCeiling, parseOAuthMcpScopes } from "../lib/oauth-scopes.ts";

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
  const lookup = source.indexOf("findOAuthAccessToken(bearer)");

  assert.notEqual(limiter, -1);
  assert.notEqual(lookup, -1);
  assert.ok(limiter < lookup);
});

test("strict CSP uses proxy nonces without a manual layout nonce", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

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
    "/onboarding/company",
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
    "/docs",
    "/changelog",
    "/roadmap",
    "/bench",
    "/stack",
    "/terms",
    "/privacy",
    "/company",
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

test("every nonce route renders per request", () => {
  // A prerendered route under the nonce policy ships HTML whose scripts the
  // browser refuses to run, so each prefix needs `force-dynamic` on its page or
  // on a layout above it.
  const declaresDynamic = (relativePath: string) => {
    const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
    return /export const dynamic = "force-dynamic"/.test(source);
  };

  for (const file of [
    "app/page.tsx",
    "app/(creed-app)/layout.tsx",
    "app/onboarding/layout.tsx",
    "app/invite/[token]/page.tsx",
    "app/payment/success/page.tsx",
    "app/login/page.tsx",
    "app/signup/page.tsx",
    "app/reset-password/page.tsx",
    "app/authorize/page.tsx",
    "app/dev/company-onboarding/page.tsx",
  ]) {
    assert.equal(declaresDynamic(file), true, `${file} must declare force-dynamic`);
  }
});

test("OAuth follow-up migration keeps resources portable and cleanup serialized", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260801162000_correct_security_audit_followups.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /SET resource = NULL/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /DELETE FROM public\.oauth_authorization_codes/i);
  assert.match(migration, /DELETE FROM public\.oauth_tokens/i);
});
