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
        isLoopbackHostname(registeredUri.hostname) &&
        registeredUri.pathname === parsed.pathname
      );
    } catch {
      return false;
    }
  });
}
