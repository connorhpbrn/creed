import "server-only";
// Minimal OAuth 2.1 authorization-server logic for the Creed MCP endpoint.
// Opaque tokens only (no JWT): each token is random, stored as a SHA-256 hash
// for lookup plus an AES-256-GCM ciphertext, mirroring the proven pattern in
// lib/creed-backend.ts. This keeps every token per-client revocable and adds
// no new crypto or dependencies. PKCE S256 is mandatory; codes are single-use
// and short-lived. The admin (service-role) client is used throughout because
// the oauth_* tables are service-role only.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { encryptSecret, hashSecret } from "@/lib/secret-crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// The admin client's generated types don't know about the oauth_* tables, so we
// access them through the same loose structural shim creed-backend uses and cast
// row shapes explicitly.
function adminDb(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

type ClientRow = { client_id: string; client_name: string; redirect_uris: string[] | null };
type CodeRow = {
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  expires_at: string;
};
type TokenRow = {
  id: string;
  client_id: string;
  user_id: string;
  scope: string;
  revoked_at: string | null;
  access_expires_at: string;
  refresh_expires_at: string;
};

const ACCESS_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_TTL_MS = 60 * 1000; // 60 seconds

export const DEFAULT_SCOPE = "read propose";
export const DIRECT_EDIT_SCOPE = "direct_edit";

export type OAuthClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
};

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  scope: string;
};

export type ResolvedAccessToken = {
  userId: string;
  clientId: string;
  clientName: string | null;
  scope: string;
};

function generateOpaqueToken(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("hex")}`;
}

function base64UrlSha256(input: string) {
  return createHash("sha256").update(input).digest("base64url");
}

// RFC 7636 S256: BASE64URL(SHA256(verifier)) === challenge, compared in
// constant time.
function verifyPkceS256(verifier: string, challenge: string) {
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

  const isLoopback =
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (!isLoopback) {
    return false;
  }

  return registered.some((candidate) => {
    try {
      const registeredUri = new URL(candidate);
      return (
        registeredUri.protocol === "http:" &&
        (registeredUri.hostname === "127.0.0.1" || registeredUri.hostname === "localhost") &&
        registeredUri.pathname === parsed.pathname
      );
    } catch {
      return false;
    }
  });
}

export async function registerOAuthClient(input: {
  clientName?: string;
  redirectUris: string[];
}): Promise<OAuthClient> {
  const admin = adminDb();
  const clientId = generateOpaqueToken("creed_client");
  const clientName = (input.clientName?.trim() || "MCP Client").slice(0, 120);
  const redirectUris = input.redirectUris;

  const { error } = await admin.from("oauth_clients").insert({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
  });
  if (error) {
    throw new Error(error.message);
  }

  return { clientId, clientName, redirectUris };
}

export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const admin = adminDb();
  const { data } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  const row = (data as ClientRow | null) ?? null;
  if (!row) {
    return null;
  }
  return {
    clientId: row.client_id,
    clientName: row.client_name,
    redirectUris: row.redirect_uris ?? [],
  };
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}): Promise<string> {
  const admin = adminDb();
  const code = generateOpaqueToken("creed_ac");
  const { error } = await admin.from("oauth_authorization_codes").insert({
    code_hash: hashSecret(code),
    client_id: input.clientId,
    user_id: input.userId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    scope: input.scope,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    throw new Error(error.message);
  }
  return code;
}

// Single-use redemption: claim the row by flipping used_at in the same
// statement that selects it, so a replayed code finds nothing to claim.
export async function redeemAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ userId: string; scope: string } | { error: string }> {
  const admin = adminDb();
  const { data, error } = await admin
    .from("oauth_authorization_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", hashSecret(input.code))
    .is("used_at", null)
    .select("client_id, user_id, redirect_uri, code_challenge, scope, expires_at")
    .maybeSingle();

  if (error) {
    return { error: "server_error" };
  }
  const row = (data as CodeRow | null) ?? null;
  if (!row) {
    return { error: "invalid_grant" };
  }
  if (row.client_id !== input.clientId) {
    return { error: "invalid_grant" };
  }
  if (row.redirect_uri !== input.redirectUri) {
    return { error: "invalid_grant" };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { error: "invalid_grant" };
  }
  if (!verifyPkceS256(input.codeVerifier, row.code_challenge)) {
    return { error: "invalid_grant" };
  }

  return { userId: row.user_id, scope: row.scope };
}

export async function issueTokenPair(input: {
  clientId: string;
  userId: string;
  scope: string;
}): Promise<IssuedTokens> {
  const admin = adminDb();
  const accessToken = generateOpaqueToken("creed_at");
  const refreshToken = generateOpaqueToken("creed_rt");
  const now = Date.now();

  const { error } = await admin.from("oauth_tokens").insert({
    access_token_hash: hashSecret(accessToken),
    refresh_token_hash: hashSecret(refreshToken),
    encrypted_access_token: encryptSecret(accessToken),
    encrypted_refresh_token: encryptSecret(refreshToken),
    client_id: input.clientId,
    user_id: input.userId,
    scope: input.scope,
    access_expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
  });
  if (error) {
    throw new Error(error.message);
  }

  return {
    accessToken,
    refreshToken,
    scope: input.scope,
    accessExpiresInSeconds: Math.floor(ACCESS_TTL_MS / 1000),
  };
}

// Refresh rotation: the presented refresh token is revoked and a fresh pair is
// issued, so a leaked-and-replayed refresh token is single-use.
export async function rotateRefreshToken(
  refreshToken: string
): Promise<IssuedTokens | { error: string }> {
  const admin = adminDb();
  const { data, error } = await admin
    .from("oauth_tokens")
    .select("id, client_id, user_id, scope, revoked_at, refresh_expires_at")
    .eq("refresh_token_hash", hashSecret(refreshToken))
    .maybeSingle();

  if (error) {
    return { error: "server_error" };
  }
  const row = (data as TokenRow | null) ?? null;
  if (!row || row.revoked_at) {
    return { error: "invalid_grant" };
  }
  if (new Date(row.refresh_expires_at).getTime() < Date.now()) {
    return { error: "invalid_grant" };
  }

  await admin
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", row.id);

  return issueTokenPair({
    clientId: row.client_id,
    userId: row.user_id,
    scope: row.scope,
  });
}

export async function findOAuthAccessToken(
  token: string
): Promise<ResolvedAccessToken | null> {
  const admin = adminDb();
  const { data } = await admin
    .from("oauth_tokens")
    .select("id, client_id, user_id, scope, revoked_at, access_expires_at")
    .eq("access_token_hash", hashSecret(token))
    .maybeSingle();

  const row = (data as TokenRow | null) ?? null;
  if (!row || row.revoked_at) {
    return null;
  }
  if (new Date(row.access_expires_at).getTime() < Date.now()) {
    return null;
  }

  void admin
    .from("oauth_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  const client = await getOAuthClient(row.client_id);
  return {
    userId: row.user_id,
    clientId: row.client_id,
    clientName: client?.clientName ?? null,
    scope: row.scope,
  };
}
