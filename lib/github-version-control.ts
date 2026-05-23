import type { User } from "@supabase/supabase-js";
import type { GitHubSyncStatus } from "@/lib/creed-data";
import {
  readGitHubIntegration,
  readVersionControlConfig,
  upsertGitHubIntegration,
} from "@/lib/creed-backend";
import {
  isGitHubTokenRefreshConfigured,
  refreshGitHubAccessToken,
} from "@/lib/github";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function hasLinkedGitHubIdentity(user: {
  identities?: Array<{
    provider?: string;
    identity_data?: Record<string, unknown> | null;
  }>;
}) {
  const githubIdentity =
    (user.identities ?? []).find((identity) => identity.provider === "github") ?? null;

  if (!githubIdentity) {
    return false;
  }

  const identityData = githubIdentity.identity_data ?? {};
  return Boolean(
    githubIdentity.provider === "github" &&
      ((typeof identityData.user_name === "string" && identityData.user_name.trim()) ||
        (typeof identityData.preferred_username === "string" &&
          identityData.preferred_username.trim()) ||
        (typeof identityData.sub === "string" && identityData.sub.trim()) ||
        (typeof identityData.id === "string" && identityData.id.trim()))
  );
}

async function enrichAuthenticatedUser(user: User): Promise<User> {
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(user.id);
    if (error || !data.user) {
      return user;
    }

    return data.user;
  } catch {
    return user;
  }
}

function canRefreshGitHubIntegration(integration: {
  refresh_token?: string | null;
}) {
  return Boolean(integration.refresh_token?.trim() && isGitHubTokenRefreshConfigured());
}

function shouldRefreshGitHubIntegration(integration: {
  refresh_token?: string | null;
  token_expires_at?: string | null;
}) {
  if (!canRefreshGitHubIntegration(integration) || !integration.token_expires_at) {
    return false;
  }

  return new Date(integration.token_expires_at).getTime() <= Date.now() + 2 * 60 * 1000;
}

function isRefreshableGitHubError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /bad credentials|token.*expired|expired.*token|401/i.test(message);
}

async function refreshGitHubIntegrationIfPossible(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  integration: NonNullable<Awaited<ReturnType<typeof readGitHubIntegration>>>,
  force = false
) {
  if (!canRefreshGitHubIntegration(integration)) {
    return integration;
  }

  if (!force && !shouldRefreshGitHubIntegration(integration) && integration.access_token) {
    return integration;
  }

  const refreshed = await refreshGitHubAccessToken(integration.refresh_token!.trim());

  await upsertGitHubIntegration(supabase, userId, {
    status: "connected",
    providerAccountId: integration.provider_account_id,
    providerLogin: integration.provider_login,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    tokenExpiresAt: refreshed.expiresAt,
  });

  return {
    ...integration,
    access_token: refreshed.accessToken,
    refresh_token: refreshed.refreshToken,
    token_expires_at: refreshed.expiresAt,
    status: "connected" as const,
  };
}

export async function requireAuthenticatedGitHubAccess() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const enrichedUser = await enrichAuthenticatedUser(user);
  let integration = await readGitHubIntegration(supabase, user.id);
  if (integration) {
    integration = await refreshGitHubIntegrationIfPossible(supabase, user.id, integration);
  }
  if (!integration?.access_token) {
    if (
      hasLinkedGitHubIdentity(enrichedUser) ||
      integration?.status === "connected" ||
      integration?.provider_login
    ) {
      throw new Error(
        "GitHub is linked, but repo access is missing. Disconnect and reconnect GitHub once on this origin to refresh the token."
      );
    }

    throw new Error("GitHub is not connected.");
  }

  const versionControl = await readVersionControlConfig(supabase, user.id);

  return {
    supabase,
    user: enrichedUser,
    integration,
    versionControl,
  };
}

export async function withAuthenticatedGitHubAccess<T>(
  operation: (
    context: Awaited<ReturnType<typeof requireAuthenticatedGitHubAccess>>
  ) => Promise<T>
) {
  let context = await requireAuthenticatedGitHubAccess();

  try {
    return await operation(context);
  } catch (error) {
    if (!context.integration || !isRefreshableGitHubError(error)) {
      throw error;
    }

    const refreshedIntegration = await refreshGitHubIntegrationIfPossible(
      context.supabase,
      context.user.id,
      context.integration,
      true
    );

    context = {
      ...context,
      integration: refreshedIntegration,
    };

    return operation(context);
  }
}

export async function requireAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const enrichedUser = await enrichAuthenticatedUser(user);

  return { supabase, user: enrichedUser };
}

export { hasLinkedGitHubIdentity };

export function getConfiguredRepo(versionControl?: {
  repo_owner?: string | null;
  repo_name?: string | null;
  branch?: string | null;
  path?: string | null;
} | null) {
  const repoOwner = versionControl?.repo_owner?.trim() ?? "";
  const repoName = versionControl?.repo_name?.trim() ?? "";
  const branch = versionControl?.branch?.trim() ?? "";
  const path = versionControl?.path?.trim() || "creed.md";

  if (!repoOwner || !repoName || !branch) {
    return null;
  }

  return {
    repoOwner,
    repoName,
    branch,
    path,
  };
}

export function resolveSyncStatus(args: {
  localHash: string;
  remoteHash?: string | null;
  lastSyncedHash?: string | null;
}): GitHubSyncStatus {
  const remoteHash = args.remoteHash ?? null;
  const lastSyncedHash = args.lastSyncedHash ?? null;

  if (!remoteHash) {
    return args.localHash ? "local-ahead" : "unknown";
  }

  if (remoteHash === args.localHash) {
    return "up-to-date";
  }

  if (lastSyncedHash && lastSyncedHash === args.localHash) {
    return "remote-ahead";
  }

  if (lastSyncedHash && lastSyncedHash === remoteHash) {
    return "local-ahead";
  }

  return "diverged";
}
