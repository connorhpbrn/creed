import { NextResponse } from "next/server";
import { listGitHubBranches } from "@/lib/github";
import {
  requireAuthenticatedUser,
  withAuthenticatedGitHubAccess,
} from "@/lib/github-version-control";
import { resolveManagedCompanyCreedId } from "@/lib/creed-context";
import { withCompanyGitHubAccess } from "@/lib/company-github";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner")?.trim();
    const repo = searchParams.get("repo")?.trim();

    if (!owner || !repo) {
      return NextResponse.json({ error: "Missing repo owner or repo name." }, { status: 400 });
    }

    const { supabase, user } = await requireAuthenticatedUser();
    // Company managers resolve branches on the TEAM token; everyone else on
    // their own connection.
    const companyId = await resolveManagedCompanyCreedId(supabase, user);
    const branches = companyId
      ? await withCompanyGitHubAccess(companyId, (token) =>
          listGitHubBranches(token, owner, repo)
        )
      : await withAuthenticatedGitHubAccess(({ integration }) =>
          listGitHubBranches(integration.access_token!, owner, repo)
        );

    return NextResponse.json({
      branches: branches.map((branch) => ({
        name: branch.name,
      })),
    });
  } catch (error) {
    const message = "Could not load GitHub branches.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 }
    );
  }
}
