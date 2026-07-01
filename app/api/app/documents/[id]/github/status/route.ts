import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getGitHubFileSnapshot } from "@/lib/github";
import { resolveSyncStatus, withAuthenticatedGitHubAccess } from "@/lib/github-version-control";
import { hashDocumentContent, readSharedDocumentById, serializeSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const payload = await withAuthenticatedGitHubAccess(async ({ integration }) => {
      const admin = getSupabaseAdminClient();
      const document = await readSharedDocumentById(admin, id);
      if (!document) {
        throw new Error("Document not found.");
      }
      if (
        !document.githubRepoOwner ||
        !document.githubRepoName ||
        !document.githubBranch ||
        !document.githubPath
      ) {
        return { connected: true, configured: false, syncStatus: "not-configured" as const };
      }

      const remoteFile = await getGitHubFileSnapshot(
        integration.access_token!,
        document.githubRepoOwner,
        document.githubRepoName,
        document.githubPath,
        document.githubBranch
      );

      const syncStatus = resolveSyncStatus({
        localHash: hashDocumentContent(serializeSharedDocument(document)),
        remoteHash: remoteFile?.contentHash ?? null,
        lastSyncedHash: document.lastSyncedContentHash,
      });

      return {
        connected: true,
        configured: true,
        repoOwner: document.githubRepoOwner,
        repoName: document.githubRepoName,
        branch: document.githubBranch,
        path: document.githubPath,
        syncStatus,
        remoteSha: remoteFile?.sha ?? null,
        remoteMessage: remoteFile?.commitMessage ?? null,
        remoteCommittedAt: remoteFile?.committedAt ?? null,
        remoteContentHash: remoteFile?.contentHash ?? null,
      };
    }, auth);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load document GitHub status.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 }
    );
  }
}
