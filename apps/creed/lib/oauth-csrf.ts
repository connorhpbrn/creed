import "server-only";

import { issueCsrfToken, verifyCsrfToken } from "@/lib/oauth-csrf-core";

function signingSecret() {
  const secret = process.env.CREED_CSRF_SECRET?.trim() ?? process.env.CREED_ENCRYPTION_SECRET?.trim();
  if (!secret) throw new Error("CREED_CSRF_SECRET or CREED_ENCRYPTION_SECRET is required.");
  return secret;
}

export function issueOAuthCsrfToken(userId: string) {
  return issueCsrfToken(signingSecret(), userId);
}

export function verifyOAuthCsrfToken(token: string, userId: string) {
  return verifyCsrfToken(signingSecret(), token, userId);
}
