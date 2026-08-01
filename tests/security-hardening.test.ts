import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("root theme initialization stays static and same-origin", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

  assert.doesNotMatch(layout, /from ["']next\/headers["']/);
  assert.match(layout, /src="\/theme-init\.js"/);
  assert.doesNotMatch(proxy, /x-nonce|nonce=/);
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
