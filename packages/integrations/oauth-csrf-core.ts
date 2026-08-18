import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Pure token logic, split out of lib/oauth-csrf so it can be unit tested
// without the `server-only` import (same split as secret-crypto-core).

export const OAUTH_CSRF_MAX_AGE = 10 * 60;

// The signature covers the user the token was minted for, and that binding is
// what ties a consent submission to the person who loaded the consent screen.
//
// This used to be a double-submit cookie. It could never work: the consent
// screen is a Server Component, and `cookies().set()` throws anywhere outside a
// Server Action or Route Handler, so every paid user reaching the screen hit the
// error boundary instead of Allow / Deny and MCP auth could not complete at all.
//
// Binding to the session user is also the stronger check. An attacker cannot
// mint a token for someone else's id (no secret), and cannot read the victim's
// token out of the page (same-origin), so a cross-site consent POST fails on the
// token as well as on the origin check in the decision route.
function signature(secret: string, payload: string, userId: string) {
  return createHmac("sha256", secret).update(`${payload}:${userId}`).digest("base64url");
}

export function issueCsrfToken(secret: string, userId: string, now = Date.now()) {
  const payload = `${now}.${randomBytes(24).toString("base64url")}`;
  return `${payload}.${signature(secret, payload, userId)}`;
}

export function verifyCsrfToken(
  secret: string,
  token: string,
  userId: string,
  now = Date.now(),
) {
  if (!token || !userId) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signature(secret, payload, userId));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

  const issuedAt = Number(parts[0]);
  const age = now - issuedAt;
  return Number.isFinite(issuedAt) && age >= 0 && age <= OAUTH_CSRF_MAX_AGE * 1000;
}
