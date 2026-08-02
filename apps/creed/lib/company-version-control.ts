import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// The company Creed's GitHub sync target + last-sync bookkeeping
// (creed_company_version_control). Configured by an owner/admin; pushes run on
// the team's GitHub token, so the connection and target are both company-level.
// Shaped to match the personal VersionControlRow columns so the same
// getConfiguredRepo / resolveSyncStatus helpers work unchanged.

export type CompanyVersionControlRow = {
  repo_owner: string | null;
  repo_name: string | null;
  branch: string | null;
  path: string | null;
  last_remote_sha: string | null;
  last_remote_message: string | null;
  last_remote_committed_at: string | null;
  last_synced_content_hash: string | null;
  sync_status: string | null;
};

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

export async function readCompanyVersionControl(
  creedId: string
): Promise<CompanyVersionControlRow | null> {
  const { data } = await admin()
    .from("creed_company_version_control")
    .select(
      "repo_owner, repo_name, branch, path, last_remote_sha, last_remote_message, last_remote_committed_at, last_synced_content_hash, sync_status"
    )
    .eq("creed_id", creedId)
    .maybeSingle();
  return (data as CompanyVersionControlRow | null) ?? null;
}

// Persist the outcome of a push (or a status resolve) against the company target.
export async function updateCompanyVersionControlSync(
  creedId: string,
  patch: {
    lastRemoteSha?: string | null;
    lastRemoteMessage?: string | null;
    lastRemoteCommittedAt?: string | null;
    lastSyncedContentHash?: string | null;
    syncStatus?: string;
  }
): Promise<void> {
  const row: Record<string, unknown> = { creed_id: creedId, updated_at: new Date().toISOString() };
  if (patch.lastRemoteSha !== undefined) row.last_remote_sha = patch.lastRemoteSha;
  if (patch.lastRemoteMessage !== undefined) row.last_remote_message = patch.lastRemoteMessage;
  if (patch.lastRemoteCommittedAt !== undefined) row.last_remote_committed_at = patch.lastRemoteCommittedAt;
  if (patch.lastSyncedContentHash !== undefined) row.last_synced_content_hash = patch.lastSyncedContentHash;
  if (patch.syncStatus !== undefined) row.sync_status = patch.syncStatus;
  await admin()
    .from("creed_company_version_control")
    .upsert(row, { onConflict: "creed_id" });
}
