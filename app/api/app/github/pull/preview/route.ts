import { NextResponse } from "next/server";
import { parseCreedMarkdown } from "@/lib/creed-markdown";
import { getGitHubFileSnapshot } from "@/lib/github";
import {
  getConfiguredRepo,
  resolveSyncStatus,
  withAuthenticatedGitHubAccess,
} from "@/lib/github-version-control";
import { resolveManagedCompanyCreedId } from "@/lib/creed-context";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { localHash?: string };
    const payload = await withAuthenticatedGitHubAccess(async ({
      supabase,
      user,
      integration,
      versionControl,
    }) => {
      // Pulling GitHub into a shared company file (an import that overwrites
      // sections) is not supported yet; company managers push out only.
      if (await resolveManagedCompanyCreedId(supabase, user)) {
        throw new Error("Pulling from GitHub into a company Creed isn't supported yet. You can push to GitHub.");
      }
      const configuredRepo = getConfiguredRepo(versionControl);

      if (!configuredRepo) {
        throw new Error("GitHub version control is not configured yet. Choose a repo in Settings first");
      }

      const remoteFile = await getGitHubFileSnapshot(
        integration.access_token!,
        configuredRepo.repoOwner,
        configuredRepo.repoName,
        configuredRepo.path,
        configuredRepo.branch
      );

      if (!remoteFile) {
        throw new Error("No creed.md in this repo yet. Push first");
      }

      const parsed = parseCreedMarkdown(remoteFile.content);
      const syncStatus = resolveSyncStatus({
        localHash: body.localHash?.trim() ?? "",
        remoteHash: remoteFile.contentHash,
        lastSyncedHash: versionControl?.last_synced_content_hash ?? null,
      });

      return {
        repoOwner: configuredRepo.repoOwner,
        repoName: configuredRepo.repoName,
        branch: configuredRepo.branch,
        path: configuredRepo.path,
        syncStatus,
        remoteSha: remoteFile.sha,
        remoteMessage: remoteFile.commitMessage ?? null,
        remoteCommittedAt: remoteFile.committedAt ?? null,
        remoteContentHash: remoteFile.contentHash,
        warnings: parsed.warnings,
        sections: parsed.sections,
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = "Could not preview GitHub import.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : error instanceof Error && error.message.includes("No creed.md") ? 404 : 400 }
    );
  }
}
