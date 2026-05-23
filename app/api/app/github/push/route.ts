import { NextResponse } from "next/server";
import { loadCreedState, persistCreedState } from "@/lib/creed-backend";
import { getGitHubFileSnapshot, pushGitHubFile } from "@/lib/github";
import { getConfiguredRepo, withAuthenticatedGitHubAccess } from "@/lib/github-version-control";

type PushBody = {
  markdown?: string;
  localHash?: string;
  message?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PushBody;
    const markdown = body.markdown?.trim();
    const localHash = body.localHash?.trim();
    const message = body.message?.trim() || "Update Creed";

    if (!markdown || !localHash) {
      return NextResponse.json({ error: "Missing markdown or local hash." }, { status: 400 });
    }

    const payload = await withAuthenticatedGitHubAccess(async ({
      supabase,
      user,
      integration,
      versionControl,
    }) => {
      const configuredRepo = getConfiguredRepo(versionControl);

      if (!configuredRepo) {
        throw new Error("GitHub version control is not configured yet. Choose a repo in Settings first.");
      }

      const remoteFile = await getGitHubFileSnapshot(
        integration.access_token!,
        configuredRepo.repoOwner,
        configuredRepo.repoName,
        configuredRepo.path,
        configuredRepo.branch
      );

      const pushResult = await pushGitHubFile({
        accessToken: integration.access_token!,
        owner: configuredRepo.repoOwner,
        repo: configuredRepo.repoName,
        branch: configuredRepo.branch,
        path: configuredRepo.path,
        message,
        content: markdown,
        currentSha: remoteFile?.sha ?? null,
      });

      const result = await loadCreedState(supabase, user);
      const nextState = {
        ...result.state,
        settings: {
          ...result.state.settings,
          versionControl: {
            ...result.state.settings.versionControl,
            repoOwner: configuredRepo.repoOwner,
            repoName: configuredRepo.repoName,
            branch: configuredRepo.branch,
            path: "creed.md" as const,
            lastRemoteSha: pushResult.sha,
            lastRemoteMessage: pushResult.message,
            lastRemoteCommittedAt: pushResult.committedAt,
            lastSyncedContentHash: localHash,
            syncStatus: "up-to-date" as const,
          },
        },
      };

      await persistCreedState(supabase, user.id, nextState);

      return {
        ok: true,
        syncStatus: "up-to-date" as const,
        remoteSha: pushResult.sha,
        remoteMessage: pushResult.message,
        remoteCommittedAt: pushResult.committedAt,
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not push Creed to GitHub.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 }
    );
  }
}
