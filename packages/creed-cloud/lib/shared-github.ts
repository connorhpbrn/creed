import "server-only";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { decryptSecret, encryptSecret } from "@creed/integrations/secret-crypto";
import {
  getGitHubOAuthAppCredentials,
  refreshGitHubAccessToken,
} from "@creed/integrations/github";

// Cloud's team GitHub connection (creed_integrations): a single
// team-wide token, authorized by an owner/admin through the dedicated shared
// GitHub OAuth App and stored encrypted, keyed by creed_id. This is what shared
// pushes / status / repo listing run on - never a member's personal GitHub. The
// shape mirrors the personal creed_integrations helpers so the version-control
// routes can branch on "shared vs personal" and otherwise share the same
// GitHub API calls.

type SharedGitHubRow = {
  creed_id: string;
  status: "connected" | "not-connected" | "disconnected";
  provider_account_id: string | null;
  provider_login: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
};

export type SharedGitHubIntegration = {
  status: "connected" | "not-connected" | "disconnected";
  providerAccountId: string | null;
  providerLogin: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
};

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

function decryptOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value, "shared GitHub token");
  } catch {
    // A malformed/undecryptable token is treated as "not connected" rather than
    // throwing, so a key rotation degrades to a reconnect prompt.
    return null;
  }
}

/**
 * The team's GitHub connection with tokens decrypted, or null when the team has
 * never connected. Always read via the admin client after an app-level
 * owner/admin check - the row is service-role only under RLS.
 */
export async function readSharedGitHubIntegration(
  creedId: string
): Promise<SharedGitHubIntegration | null> {
  const { data } = (await admin()
    .from("creed_integrations")
    .select(
      "creed_id, status, provider_account_id, provider_login, encrypted_access_token, encrypted_refresh_token, token_expires_at"
    )
    .eq("creed_id", creedId)
    .maybeSingle()) as { data: SharedGitHubRow | null };
  if (!data) return null;
  return {
    status: data.status,
    providerAccountId: data.provider_account_id,
    providerLogin: data.provider_login,
    accessToken: decryptOrNull(data.encrypted_access_token),
    refreshToken: decryptOrNull(data.encrypted_refresh_token),
    tokenExpiresAt: data.token_expires_at,
  };
}

/** Store (or replace) the team's GitHub connection. Tokens are encrypted here. */
export async function upsertSharedGitHubIntegration(params: {
  creedId: string;
  connectedBy: string;
  providerAccountId: string | null;
  providerLogin: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await admin()
    .from("creed_integrations")
    .upsert(
      {
        creed_id: params.creedId,
        provider: "github",
        status: "connected",
        provider_account_id: params.providerAccountId,
        provider_login: params.providerLogin,
        encrypted_access_token: encryptSecret(params.accessToken),
        encrypted_refresh_token: params.refreshToken
          ? encryptSecret(params.refreshToken)
          : null,
        token_expires_at: params.tokenExpiresAt,
        connected_by: params.connectedBy,
        updated_at: now,
      },
      { onConflict: "creed_id,provider" }
    );
}

/**
 * Disconnect the team's GitHub: clear the token + identity (status
 * 'disconnected') but keep the row so the UI can distinguish "disconnected"
 * from "never connected". The configured repo/branch is deliberately left in
 * creed_version_control - it is the team's chosen target and is almost
 * always wanted again on reconnect - but its sync bookkeeping is reset so the
 * UI doesn't claim it is still in sync with a token it no longer holds.
 */
export async function clearSharedGitHubIntegration(creedId: string): Promise<void> {
  const db = admin();
  await Promise.all([
    db
      .from("creed_integrations")
      .update({
        status: "disconnected",
        provider_account_id: null,
        provider_login: null,
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("creed_id", creedId),
    db
      .from("creed_version_control")
      .update({ sync_status: "unknown" })
      .eq("creed_id", creedId),
  ]);
}

function shouldRefresh(integration: SharedGitHubIntegration): boolean {
  const creds = getGitHubOAuthAppCredentials();
  if (!integration.refreshToken || !creds.clientId || !creds.clientSecret) {
    return false;
  }
  if (!integration.tokenExpiresAt) return false;
  // Refresh a couple of minutes early to avoid a mid-request expiry.
  return new Date(integration.tokenExpiresAt).getTime() <= Date.now() + 2 * 60 * 1000;
}

async function refreshSharedToken(
  creedId: string,
  integration: SharedGitHubIntegration
): Promise<SharedGitHubIntegration> {
  const creds = getGitHubOAuthAppCredentials();
  if (!integration.refreshToken || !creds.clientId || !creds.clientSecret) {
    return integration;
  }
  const refreshed = await refreshGitHubAccessToken(integration.refreshToken, creds);
  const now = new Date().toISOString();
  await admin()
    .from("creed_integrations")
    .update({
      encrypted_access_token: encryptSecret(refreshed.accessToken),
      encrypted_refresh_token: refreshed.refreshToken
        ? encryptSecret(refreshed.refreshToken)
        : integration.refreshToken
          ? encryptSecret(integration.refreshToken)
          : null,
      token_expires_at: refreshed.expiresAt,
      status: "connected",
      updated_at: now,
    })
    .eq("creed_id", creedId);
  return {
    ...integration,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? integration.refreshToken,
    tokenExpiresAt: refreshed.expiresAt,
    status: "connected",
  };
}

/**
 * Resolve a usable team access token, refreshing first if it is about to
 * expire. Throws a friendly error when the team has not connected GitHub, so
 * routes surface "connect in Settings" rather than a raw 401.
 */
export async function requireSharedGitHubAccess(
  creedId: string
): Promise<{ accessToken: string; integration: SharedGitHubIntegration }> {
  let integration = await readSharedGitHubIntegration(creedId);
  if (!integration?.accessToken) {
    throw new Error(
      "This team hasn't connected GitHub yet. An owner or admin can connect it in Settings."
    );
  }
  if (shouldRefresh(integration)) {
    integration = await refreshSharedToken(creedId, integration);
  }
  return { accessToken: integration.accessToken!, integration };
}

function isRefreshableGitHubError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /bad credentials|token.*expired|expired.*token|401/i.test(message);
}

/**
 * Run a GitHub operation on the team token, retrying once with a forced refresh
 * if GitHub rejects the token as expired. Mirrors withAuthenticatedGitHubAccess
 * for the personal connection.
 */
export async function withSharedGitHubAccess<T>(
  creedId: string,
  operation: (accessToken: string) => Promise<T>
): Promise<T> {
  const { accessToken, integration } = await requireSharedGitHubAccess(creedId);
  try {
    return await operation(accessToken);
  } catch (error) {
    if (!integration.refreshToken || !isRefreshableGitHubError(error)) {
      throw error;
    }
    const refreshed = await refreshSharedToken(creedId, integration);
    if (!refreshed.accessToken) throw error;
    return operation(refreshed.accessToken);
  }
}
