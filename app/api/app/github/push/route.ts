import { NextResponse } from "next/server";
import { loadCreedState, persistCreedState } from "@/lib/creed-backend";
import { getGitHubFileSnapshot, pushGitHubFile } from "@/lib/github";
import {
  getConfiguredRepo,
  requireAuthenticatedUser,
  withAuthenticatedGitHubAccess,
} from "@/lib/github-version-control";
import { resolveManagedCompanyCreedId } from "@/lib/creed-context";
import { withCompanyGitHubAccess } from "@/lib/company-github";
import { readCompanyVersionControl, updateCompanyVersionControlSync } from "@/lib/company-version-control";
import { checkRateLimit } from "@/lib/rate-limit";

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

    // Company managers push the company file to the COMPANY target on the TEAM's
    // GitHub connection (never a personal token); the sync bookkeeping lands on
    // the company row. Personal Creeds push on the user's own connection.
    const companyId = await resolveManagedCompanyCreedId(supabase, user);
    if (companyId) {
      const companyVc = await readCompanyVersionControl(companyId);
      const companyRepo = getConfiguredRepo(companyVc);
      if (!companyRepo) {
        throw new Error("Version control is not configured yet. Choose a repo in Settings first");
      }
      const payload = await withCompanyGitHubAccess(companyId, async (token) => {
        const remote = await getGitHubFileSnapshot(
          token,
          companyRepo.repoOwner,
          companyRepo.repoName,
          companyRepo.path,
          companyRepo.branch
        );
        const result = await pushGitHubFile({
          accessToken: token,
          owner: companyRepo.repoOwner,
          repo: companyRepo.repoName,
          branch: companyRepo.branch,
          path: companyRepo.path,
          message,
          content: markdown,
          currentSha: remote?.sha ?? null,
        });
        return result;
      });
      await updateCompanyVersionControlSync(companyId, {
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
    const message = "Could not push Creed to GitHub.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 }
    );
  }
}
