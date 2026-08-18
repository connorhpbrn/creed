// Reads the Supabase session's expiry straight out of its auth cookie, without
// any network. The proxy refreshes the session on app-route requests, but a
// refresh is only meaningful when the access token is actually near expiry -
// calling auth.getUser() on every navigation added a Supabase round trip
// (typically 100-300ms) to every page switch in the app.
//
// The cookie is written by @supabase/ssr: `sb-<ref>-auth-token`, optionally
// split into `.0`, `.1`, ... chunks, holding `base64-<base64url(JSON)>` where
// the JSON carries `expires_at` in unix seconds. Anything unexpected here -
// format changes, truncation, a non-JSON value - returns null, and the caller
// treats null as "refresh now", so a parsing surprise can only ever cost the
// round trip we would have made anyway.

type CookiePair = { name: string; value: string };

// Refresh when the token has less than this long to live. Wide enough that a
// render using the token straight after the proxy cannot see it expire.
export const SESSION_REFRESH_WINDOW_SECONDS = 120;

function decodeBase64(value: string): string | null {
  try {
    // Cookie payloads are base64url; atob wants standard base64.
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    if (typeof atob === "function") return atob(normalized);
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export function readSessionExpiresAt(cookies: CookiePair[]): number | null {
  const chunks = cookies
    .filter(
      ({ name }) =>
        name.startsWith("sb-") &&
        name.includes("auth-token") &&
        // The PKCE code-verifier cookie shares the prefix but is not a session.
        !name.includes("code-verifier"),
    )
    // Unchunked cookies sort before `.0`; chunk suffixes sort numerically for
    // the single-digit counts Supabase produces.
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  if (chunks.length === 0) return null;

  const joined = chunks.map(({ value }) => value).join("");
  const payload = joined.startsWith("base64-")
    ? decodeBase64(joined.slice("base64-".length))
    : joined;
  if (!payload) return null;

  try {
    const session: unknown = JSON.parse(payload);
    if (
      typeof session === "object" &&
      session !== null &&
      "expires_at" in session &&
      typeof session.expires_at === "number" &&
      Number.isFinite(session.expires_at)
    ) {
      return session.expires_at;
    }
    return null;
  } catch {
    return null;
  }
}

export function sessionNeedsRefresh(
  cookies: CookiePair[],
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const expiresAt = readSessionExpiresAt(cookies);
  if (expiresAt === null) return true;
  return expiresAt - nowSeconds < SESSION_REFRESH_WINDOW_SECONDS;
}
