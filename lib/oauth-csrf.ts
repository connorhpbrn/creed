import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 10 * 60;

function signingSecret() {
  const secret = process.env.CREED_CSRF_SECRET?.trim() ?? process.env.CREED_ENCRYPTION_SECRET?.trim();
  if (!secret) throw new Error("CREED_CSRF_SECRET or CREED_ENCRYPTION_SECRET is required.");
  return secret;
}

function signature(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function issueOAuthCsrfToken() {
  const payload = `${Date.now()}.${randomBytes(24).toString("base64url")}`;
  return `${payload}.${signature(payload)}`;
}

export function verifyOAuthCsrfToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  const issuedAt = Number(parts[0]);
  return Number.isFinite(issuedAt) && Date.now() - issuedAt >= 0 && Date.now() - issuedAt <= MAX_AGE_SECONDS * 1000;
}

export function oauthCsrfCookieName(token: string) {
  const suffix = createHmac("sha256", signingSecret())
    .update(`cookie:${token}`)
    .digest("hex")
    .slice(0, 20);
  return `creed_oauth_csrf_${suffix}`;
}

export const OAUTH_CSRF_MAX_AGE = MAX_AGE_SECONDS;
