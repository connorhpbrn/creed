import { NextResponse } from "next/server";
import { listGitHubRepos } from "@creed/integrations/github";
import {
  requireAuthenticatedUser,
  withAuthenticatedGitHubAccess,
} from "@/lib/github-version-control";
import {
  resolveManagedSharedCreedId,
  withSharedGitHubAccess,
} from "@creed/edition/github";

export async function GET() {
  try {
    const { supabase, user } = await requireAuthenticatedUser();
    // Shared managers list repos on the TEAM's GitHub connection (so they see
    // the org repos the team can push to); everyone else lists their own.
    const sharedId = await resolveManagedSharedCreedId(supabase, user);
    const repos = sharedId
      ? await withSharedGitHubAccess(sharedId, (token) => listGitHubRepos(token))
      : await withAuthenticatedGitHubAccess(({ integration }) =>
          listGitHubRepos(integration.access_token!)
        );

    return NextResponse.json({
      repos: repos.map((repo) => ({
        id: repo.id,
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        private: repo.private,
      })),
    });
  } catch (error) {
    const message = "Could not load GitHub repos.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 }
    );
  }
}
