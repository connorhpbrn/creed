import { createHash, timingSafeEqual } from "node:crypto";

function base64UrlSha256(input: string) {
  return createHash("sha256").update(input).digest("base64url");
}

// RFC 7636 S256: BASE64URL(SHA256(verifier)) === challenge, compared in
// constant time.
export function verifyPkceS256(verifier: string, challenge: string) {
  if (!verifier || !challenge) {
    return false;
  }
  const computed = Buffer.from(base64UrlSha256(verifier));
  const expected = Buffer.from(challenge);
  if (computed.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(computed, expected);
}

function isLoopbackHostname(hostname: string) {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

const BLOCKED_REDIRECT_SCHEMES = new Set(["javascript", "data", "vbscript", "file"]);

export function isValidOAuthRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return false;
  }
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    const scheme = url.protocol.replace(/:$/, "").toLowerCase();
    if (!scheme || BLOCKED_REDIRECT_SCHEMES.has(scheme)) return false;
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:") return isLoopbackHostname(url.hostname);
    // RFC 8252 permits private-use schemes for native application callbacks.
    return /^[a-z][a-z0-9+.-]*$/.test(scheme);
  } catch {
    return false;
  }
}

export function buildOAuthRedirectUri(
  redirectUri: string,
  params: Readonly<Record<string, string>>,
) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// A redirect_uri is allowed only if it exactly matches one the client
// registered, with one exception: native apps (RFC 8252) register a loopback
// redirect and use an ephemeral port at runtime, so a loopback URI matches a
// registered loopback URI with the same path regardless of port.
export function isAllowedRedirectUri(uri: string, registered: string[]) {
  if (registered.includes(uri)) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  const isLoopback = parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname);
  if (!isLoopback) {
    return false;
  }

  return registered.some((candidate) => {
    try {
      const registeredUri = new URL(candidate);
      return (
        registeredUri.protocol === "http:" &&
        registeredUri.hostname === parsed.hostname &&
        registeredUri.pathname === parsed.pathname &&
        registeredUri.search === parsed.search &&
        registeredUri.hash === parsed.hash
      );
    } catch {
      return false;
    }
  });
}
