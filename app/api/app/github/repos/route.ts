import { NextResponse } from "next/server";
import { listGitHubRepos } from "@/lib/github";
import {
  requireAuthenticatedUser,
  withAuthenticatedGitHubAccess,
} from "@/lib/github-version-control";
import { resolveManagedCompanyCreedId } from "@/lib/creed-context";
import { withCompanyGitHubAccess } from "@/lib/company-github";

export async function GET() {
  try {
    const { supabase, user } = await requireAuthenticatedUser();
    // Company managers list repos on the TEAM's GitHub connection (so they see
    // the org repos the team can push to); everyone else lists their own.
    const companyId = await resolveManagedCompanyCreedId(supabase, user);
    const repos = companyId
      ? await withCompanyGitHubAccess(companyId, (token) => listGitHubRepos(token))
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
