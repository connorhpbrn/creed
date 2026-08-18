import "server-only";
// Minimal OAuth 2.1 authorization-server logic for the Creed MCP endpoint.
// Opaque tokens only (no JWT): each token is random, stored as a SHA-256 hash
// for lookup plus an AES-256-GCM ciphertext, mirroring the proven pattern in
// lib/creed-backend.ts. This keeps every token per-client revocable and adds
// no new crypto or dependencies. PKCE S256 is mandatory; codes are single-use
// and short-lived. The admin (service-role) client is used throughout because
// the oauth_* tables are service-role only.
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, hashSecret } from "@creed/integrations/secret-crypto";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import { getSiteUrl } from "@creed/persistence/supabase/env";
import { log } from "@/lib/observability";
import { verifyPkceS256 } from "@creed/integrations/oauth-redirect";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";

export { isAllowedRedirectUri, verifyPkceS256 } from "@creed/integrations/oauth-redirect";

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
  creed_grants: CreedGrant[] | null;
  resource: string | null;
  used_at: string | null;
};

// A per-Creed MCP grant chosen on the consent screen: which Creed the agent may
// touch and its ceiling mode. Persisted to oauth_token_creeds when the token is
// issued; carried on the authorization code in between.
export type CreedGrantMode = "read-only" | "proposal-only" | "direct";
export type CreedGrant = { creedId: string; mode: CreedGrantMode };
type TokenRow = {
  id: string;
  client_id: string;
  user_id: string;
  scope: string;
  revoked_at: string | null;
  access_expires_at: string;
  refresh_expires_at: string;
  resource: string | null;
};
type PersistedTokenRow = TokenRow & {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  ready_at: string | null;
};

const ACCESS_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_TTL_MS = 60 * 1000; // 60 seconds
const REFRESH_REPLAY_GRACE_MS = 60 * 1000;

export const DEFAULT_SCOPE = "read propose";
export const DIRECT_EDIT_SCOPE = "direct_edit";
export function oauthResource() {
  // Must match protected-resource metadata and MCP WWW-Authenticate, which use
  // getSiteUrl() (trims NEXT_PUBLIC_SITE_URL). A raw env read here used to
  // diverge on whitespace and break authorize/token/MCP resource checks.
  return `${getSiteUrl().replace(/\/$/, "")}/mcp`;
}

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
  resource: string | null;
  // The oauth_tokens row id, used to look up per-Creed grants
  // (oauth_token_creeds) for Shared Creeds.
  tokenId: string;
};

function generateOpaqueToken(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("hex")}`;
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
  const { data, error } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const row = (data as ClientRow | null) ?? null;
  if (!row) {
    return null;
  }
  void admin
    .from("oauth_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("client_id", row.client_id)
    .then(undefined, () => {});
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
  creedGrants: CreedGrant[];
  resource: string;
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
    // The Creeds the user granted this connection, carried to token issue.
    creed_grants: input.creedGrants,
    resource: input.resource,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    throw new Error(error.message);
  }
  return code;
}

export async function validateAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string;
}): Promise<{ userId: string; scope: string; creedGrants: CreedGrant[]; resource: string; alreadyUsed: boolean } | { error: string }> {
  const admin = adminDb();
  const { data, error } = await admin
    .from("oauth_authorization_codes")
    .select("client_id, user_id, redirect_uri, code_challenge, scope, expires_at, creed_grants, resource, used_at")
    .eq("code_hash", hashSecret(input.code))
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
  if ((row.resource !== null && row.resource !== input.resource) || input.resource !== oauthResource()) {
    return { error: "invalid_target" };
  }

  return {
    userId: row.user_id,
    scope: row.scope,
    creedGrants: row.creed_grants ?? [],
    resource: input.resource,
    alreadyUsed: row.used_at !== null,
  };
}

export async function issueTokenPair(input: {
  clientId: string;
  userId: string;
  scope: string;
  creedGrants: CreedGrant[];
  resource: string;
  authorizationCodeHash?: string;
  parentTokenId?: string;
}): Promise<IssuedTokens> {
  const admin = adminDb();
  const accessToken = generateOpaqueToken("creed_at");
  const refreshToken = generateOpaqueToken("creed_rt");
  const now = Date.now();

  const { data, error } = await admin
    .from("oauth_tokens")
    .insert({
      access_token_hash: hashSecret(accessToken),
      refresh_token_hash: hashSecret(refreshToken),
      encrypted_access_token: encryptSecret(accessToken),
      encrypted_refresh_token: encryptSecret(refreshToken),
      client_id: input.clientId,
      user_id: input.userId,
      scope: input.scope,
      resource: input.resource,
      authorization_code_hash: input.authorizationCodeHash ?? null,
      parent_token_id: input.parentTokenId ?? null,
      ready_at: null,
      access_expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
      refresh_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (isMissingLifecycleSchema(error)) {
      return issueLegacyTokenPair(input);
    }
    const existing = await findIssuedToken({
      authorizationCodeHash: input.authorizationCodeHash,
      parentTokenId: input.parentTokenId,
    });
    if (existing) return existing;
    throw new Error(error?.message ?? "Could not issue token.");
  }

  const tokenId = (data as { id: string }).id;
  try {
    await writeTokenCreedGrants(admin, tokenId, input.creedGrants);
    const { error: readyError } = await admin
      .from("oauth_tokens")
      .update({ ready_at: new Date().toISOString() })
      .eq("id", tokenId);
    if (readyError) throw new Error(readyError.message);
  } catch (grantError) {
    await admin.from("oauth_tokens").delete().eq("id", tokenId);
    throw grantError instanceof Error
      ? grantError
      : new Error("Could not persist OAuth Creed grants.");
  }

  return {
    accessToken,
    refreshToken,
    scope: input.scope,
    accessExpiresInSeconds: Math.floor(ACCESS_TTL_MS / 1000),
  };
}

function isMissingLifecycleSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.code === "PGRST204" ||
        /authorization_code_hash|parent_token_id|ready_at/i.test(error.message ?? "")),
  );
}

async function issueLegacyTokenPair(input: {
  clientId: string;
  userId: string;
  scope: string;
  creedGrants: CreedGrant[];
  resource: string;
}): Promise<IssuedTokens> {
  const admin = adminDb();
  const accessToken = generateOpaqueToken("creed_at");
  const refreshToken = generateOpaqueToken("creed_rt");
  const now = Date.now();
  const { data, error } = await admin
    .from("oauth_tokens")
    .insert({
      access_token_hash: hashSecret(accessToken),
      refresh_token_hash: hashSecret(refreshToken),
      encrypted_access_token: encryptSecret(accessToken),
      encrypted_refresh_token: encryptSecret(refreshToken),
      client_id: input.clientId,
      user_id: input.userId,
      scope: input.scope,
      resource: input.resource,
      access_expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
      refresh_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Could not issue token.");
  const tokenId = (data as { id: string }).id;
  try {
    await writeTokenCreedGrants(admin, tokenId, input.creedGrants);
  } catch (grantError) {
    await admin.from("oauth_tokens").delete().eq("id", tokenId);
    throw grantError;
  }
  return {
    accessToken,
    refreshToken,
    scope: input.scope,
    accessExpiresInSeconds: Math.floor(ACCESS_TTL_MS / 1000),
  };
}

async function findIssuedToken(input: {
  authorizationCodeHash?: string;
  parentTokenId?: string;
}): Promise<IssuedTokens | null> {
  if (!input.authorizationCodeHash && !input.parentTokenId) return null;
  const admin = adminDb();
  let query = admin
    .from("oauth_tokens")
    .select("id, client_id, user_id, scope, revoked_at, access_expires_at, refresh_expires_at, resource, encrypted_access_token, encrypted_refresh_token, ready_at");
  query = input.authorizationCodeHash
    ? query.eq("authorization_code_hash", input.authorizationCodeHash)
    : query.eq("parent_token_id", input.parentTokenId as string);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const row = data as PersistedTokenRow;
  if (row.revoked_at || !row.ready_at) return null;
  return {
    accessToken: decryptSecret(row.encrypted_access_token, "OAuth access token"),
    refreshToken: decryptSecret(row.encrypted_refresh_token, "OAuth refresh token"),
    scope: row.scope,
    accessExpiresInSeconds: Math.max(
      1,
      Math.floor((new Date(row.access_expires_at).getTime() - Date.now()) / 1000),
    ),
  };
}

export async function completeAuthorizationCodeExchange(input: {
  code: string;
  clientId: string;
  userId: string;
  scope: string;
  creedGrants: CreedGrant[];
  resource: string;
  alreadyUsed: boolean;
}): Promise<IssuedTokens | null> {
  const codeHash = hashSecret(input.code);
  if (input.alreadyUsed) {
    return findIssuedToken({ authorizationCodeHash: codeHash });
  }
  const tokens = await issueTokenPair({
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    creedGrants: input.creedGrants,
    resource: input.resource,
    authorizationCodeHash: codeHash,
  });
  const { error } = await adminDb()
    .from("oauth_authorization_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", codeHash)
    .is("used_at", null);
  if (error) {
    log.warn("OAuth code exchanged but could not be marked used", { clientId: input.clientId });
  }
  return tokens;
}

// Persist the per-Creed grants for a freshly-issued token. Deduped by creed_id
// (last mode wins) so a malformed duplicate can't violate the PK. A token with
// no grants writes nothing; MCP enforcement treats a grant-less token as
// personal-only, so access never silently widens.
//
// Non-empty grants must succeed: otherwise Shared Allow would mint a token that
// silently falls back to personal-only. Callers delete the token row on throw.
async function writeTokenCreedGrants(
  admin: SupabaseLikeClient,
  tokenId: string,
  grants: CreedGrant[]
) {
  const byCreed = new Map<string, CreedGrantMode>();
  for (const grant of grants) {
    if (grant.creedId) byCreed.set(grant.creedId, grant.mode);
  }
  if (byCreed.size === 0) return;
  const rows = [...byCreed].map(([creedId, mode]) => ({
    token_id: tokenId,
    creed_id: creedId,
    mode,
  }));
  const { error } = await admin.from("oauth_token_creeds").insert(rows);
  if (error) {
    log.error("Could not persist OAuth Creed grants", { tokenId }, error);
    throw new Error(error.message);
  }
}

export async function rotateRefreshToken(
  refreshToken: string,
  clientId: string,
  resource: string,
): Promise<IssuedTokens | { error: string }> {
  const admin = adminDb();
  const { data, error } = await admin
    .from("oauth_tokens")
    .select("id, client_id, user_id, scope, revoked_at, refresh_expires_at, resource")
    .eq("refresh_token_hash", hashSecret(refreshToken))
    .maybeSingle();

  if (error) {
    return { error: "server_error" };
  }
  const row = (data as TokenRow | null) ?? null;
  if (!row) {
    return { error: "invalid_grant" };
  }
  if (
    row.client_id !== clientId ||
    (row.resource !== null && row.resource !== resource) ||
    resource !== oauthResource()
  ) {
    return { error: "invalid_grant" };
  }
  if (new Date(row.refresh_expires_at).getTime() < Date.now()) {
    return { error: "invalid_grant" };
  }

  if (row.revoked_at) {
    const withinReplayGrace =
      Date.now() - new Date(row.revoked_at).getTime() <= REFRESH_REPLAY_GRACE_MS;
    try {
      const replacement = withinReplayGrace
        ? await findIssuedToken({ parentTokenId: row.id })
        : null;
      return replacement ?? { error: "invalid_grant" };
    } catch {
      return { error: "server_error" };
    }
  }

  // Carry the old token's per-Creed grants onto the rotated token, otherwise a
  // connection would lose its Creed scoping on the first refresh (and MCP would
  // fall back to personal-only for a token that had been granted a shared).
  const { data: grantRows, error: grantError } = await admin
    .from("oauth_token_creeds")
    .select("creed_id, mode")
    .eq("token_id", row.id);
  if (grantError) {
    return { error: "server_error" };
  }
  const creedGrants: CreedGrant[] = ((grantRows as Array<{ creed_id: string; mode: CreedGrantMode }> | null) ?? []).map(
    (g) => ({ creedId: g.creed_id, mode: g.mode })
  );

  let replacement: IssuedTokens;
  try {
    replacement = await issueTokenPair({
      clientId: row.client_id,
      userId: row.user_id,
      scope: row.scope,
      creedGrants,
      resource,
      parentTokenId: row.id,
    });
  } catch (issueError) {
    log.error("Could not prepare OAuth refresh replacement", { tokenId: row.id }, issueError);
    return { error: "server_error" };
  }

  const { error: claimError } = await admin
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("revoked_at", null)
    .select("id");
  if (claimError) {
    return { error: "server_error" };
  }
  return replacement;
}

export async function findOAuthAccessToken(
  token: string
): Promise<ResolvedAccessToken | null> {
  const lookup = await lookupOAuthAccessToken(token);
  return lookup.status === "ok" ? lookup.token : null;
}

export type OAuthAccessLookup =
  | { status: "ok"; token: ResolvedAccessToken }
  | { status: "invalid" }
  | { status: "unavailable" };

export async function lookupOAuthAccessToken(
  token: string
): Promise<OAuthAccessLookup> {
  const admin = adminDb();
  const { data, error } = await admin
    .from("oauth_tokens")
    .select("id, client_id, user_id, scope, resource, revoked_at, access_expires_at")
    .eq("access_token_hash", hashSecret(token))
    .maybeSingle();

  if (error) {
    return { status: "unavailable" };
  }

  const row = (data as TokenRow | null) ?? null;
  if (!row || row.revoked_at) {
    return { status: "invalid" };
  }
  if (new Date(row.access_expires_at).getTime() < Date.now()) {
    return { status: "invalid" };
  }

  // Best-effort last-used stamp on every OAuth/MCP request. Swallow rejections
  // so a transient DB blip can't become an unhandled promise rejection.
  void admin
    .from("oauth_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(undefined, () => {});

  let client: OAuthClient | null;
  try {
    client = await getOAuthClient(row.client_id);
  } catch {
    return { status: "unavailable" };
  }
  return {
    status: "ok",
    token: {
      userId: row.user_id,
      clientId: row.client_id,
      clientName: client?.clientName ?? null,
      scope: row.scope,
      resource: row.resource,
      tokenId: row.id,
    },
  };
}

export async function revokeOAuthTokensForUser(userId: string, clientId?: string) {
  const admin = adminDb();
  let query = admin
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (clientId) {
    query = query.eq("client_id", clientId);
  }
  await query;
}

// RFC 7009 token revocation for public OAuth clients such as Creed CLI. The
// caller must prove the client id that owns the opaque token, so one client can
// never revoke another client's grant. Both token forms are accepted because
// clients are allowed to revoke either one.
export async function revokeOAuthToken(token: string, clientId: string) {
  const admin = adminDb();
  const tokenHash = hashSecret(token);
  const accessLookup = await admin
    .from("oauth_tokens")
    .select("id, user_id, client_id")
    .eq("access_token_hash", tokenHash)
    .eq("client_id", clientId)
    .maybeSingle();
  if (accessLookup.error) return { ok: false as const, error: "server_error" };
  const refreshLookup = accessLookup.data
    ? null
    : await admin
        .from("oauth_tokens")
        .select("id, user_id, client_id")
        .eq("refresh_token_hash", tokenHash)
        .eq("client_id", clientId)
        .maybeSingle();
  if (refreshLookup?.error) return { ok: false as const, error: "server_error" };
  const row = (accessLookup.data ?? refreshLookup?.data) as {
    id: string;
    user_id: string;
    client_id: string;
  } | null;
  // RFC 7009 deliberately returns success for an unknown token so the endpoint
  // cannot be used as a token oracle.
  if (!row) return { ok: true as const, userId: null, clientId: null };

  const revokedAt = new Date().toISOString();
  const { error: revokeError } = await admin
    .from("oauth_tokens")
    .update({ revoked_at: revokedAt })
    .eq("id", row.id);
  if (revokeError) return { ok: false as const, error: "server_error" };

  return {
    ok: true as const,
    userId: row.user_id,
    clientId: row.client_id,
    tokenId: row.id,
  };
}
