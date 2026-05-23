import { NextResponse } from "next/server";
import { getGitHubFileSnapshot } from "@/lib/github";
import {
  getConfiguredRepo,
  hasLinkedGitHubIdentity,
  requireAuthenticatedUser,
  resolveSyncStatus,
  withAuthenticatedGitHubAccess,
} from "@/lib/github-version-control";
import { readGitHubIntegration, readVersionControlConfig } from "@/lib/creed-backend";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const localHash = searchParams.get("localHash")?.trim() ?? "";
    const { supabase, user } = await requireAuthenticatedUser();
    const integration = await readGitHubIntegration(supabase, user.id);
    const versionControl = await readVersionControlConfig(supabase, user.id);
    const configuredRepo = getConfiguredRepo(versionControl);

    const linkedIdentity = hasLinkedGitHubIdentity(user);

    if (!integration?.access_token || !configuredRepo) {
      return NextResponse.json({
        connected: Boolean(integration?.access_token) || linkedIdentity,
        configured: false,
        syncStatus: "not-configured",
      });
    }

    const payload = await withAuthenticatedGitHubAccess(async ({ integration: activeIntegration }) => {
      const remoteFile = await getGitHubFileSnapshot(
        activeIntegration.access_token!,
        configuredRepo.repoOwner,
        configuredRepo.repoName,
        configuredRepo.path,
        configuredRepo.branch
      );

      const syncStatus = resolveSyncStatus({
        localHash,
        remoteHash: remoteFile?.contentHash ?? null,
        lastSyncedHash: versionControl?.last_synced_content_hash ?? null,
      });

      return {
        connected: true,
        configured: true,
        repoOwner: configuredRepo.repoOwner,
        repoName: configuredRepo.repoName,
        branch: configuredRepo.branch,
        path: configuredRepo.path,
        syncStatus,
        remoteSha: remoteFile?.sha ?? null,
        remoteMessage: remoteFile?.commitMessage ?? null,
        remoteCommittedAt: remoteFile?.committedAt ?? null,
        remoteContentHash: remoteFile?.contentHash ?? null,
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load GitHub status.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 }
    );
  }
}
