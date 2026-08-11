import { NextResponse } from "next/server";
import { loadCreedState, persistCreedState } from "@/lib/creed-backend";
import { getGitHubFileSnapshot, pushGitHubFile } from "@creed/integrations/github";
import {
  getConfiguredRepo,
  requireAuthenticatedUser,
  withAuthenticatedGitHubAccess,
} from "@/lib/github-version-control";
import {
  readSharedVersionControl,
  resolveManagedSharedCreedId,
  updateSharedVersionControlSync,
  withSharedGitHubAccess,
} from "@creed/edition/github";
import { checkRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/observability";

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

    const { supabase, user } = await requireAuthenticatedUser();
    const rateLimit = await checkRateLimit({ scope: "github-push", identifier: user.id, limit: 10, windowMs: 60_000 });
    if (!rateLimit.ok) return NextResponse.json({ error: "Too many GitHub push requests." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });

    // Shared managers push the shared file to the SHARED target on the TEAM's
    // GitHub connection (never a personal token); the sync bookkeeping lands on
    // the shared row. Personal Creeds push on the user's own connection.
    const sharedId = await resolveManagedSharedCreedId(supabase, user);
    if (sharedId) {
      const sharedVc = await readSharedVersionControl(sharedId);
      const sharedRepo = getConfiguredRepo(sharedVc);
      if (!sharedRepo) {
        throw new Error("Version control is not configured yet. Choose a repo in Settings first");
      }
      const payload = await withSharedGitHubAccess(sharedId, async (token) => {
        const remote = await getGitHubFileSnapshot(
          token,
          sharedRepo.repoOwner,
          sharedRepo.repoName,
          sharedRepo.path,
          sharedRepo.branch
        );
        const result = await pushGitHubFile({
          accessToken: token,
          owner: sharedRepo.repoOwner,
          repo: sharedRepo.repoName,
          branch: sharedRepo.branch,
          path: sharedRepo.path,
          message,
          content: markdown,
          currentSha: remote?.sha ?? null,
        });
        return result;
      });
      await updateSharedVersionControlSync(sharedId, {
        lastRemoteSha: payload.sha,
        lastRemoteMessage: payload.message,
        lastRemoteCommittedAt: payload.committedAt,
        lastSyncedContentHash: localHash,
        syncStatus: "up-to-date",
      });
      return NextResponse.json({
        ok: true,
        syncStatus: "up-to-date" as const,
        remoteSha: payload.sha,
        remoteMessage: payload.message,
        remoteCommittedAt: payload.committedAt,
      });
    }

    const result = await withAuthenticatedGitHubAccess(async ({
      supabase: personalSupabase,
      user: personalUser,
      integration,
      versionControl,
    }) => {
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

      const loaded = await loadCreedState(personalSupabase, personalUser);
      const nextState = {
        ...loaded.state,
        settings: {
          ...loaded.state.settings,
          versionControl: {
            ...loaded.state.settings.versionControl,
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

      await persistCreedState(personalSupabase, personalUser.id, nextState);

      return {
        ok: true,
        syncStatus: "up-to-date" as const,
        remoteSha: pushResult.sha,
        remoteMessage: pushResult.message,
        remoteCommittedAt: pushResult.committedAt,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    log.error("GitHub push failed", { route: "/api/app/github/push" }, error);
    const message =
      error instanceof Error && error.message && error.message !== "Unauthorized"
        ? error.message
        : "Could not push Creed to GitHub.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 }
    );
  }
}
