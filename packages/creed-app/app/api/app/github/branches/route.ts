import { NextResponse } from "next/server";
import { listGitHubBranches } from "@creed/integrations/github";
import {
  requireAuthenticatedUser,
  withAuthenticatedGitHubAccess,
} from "@/lib/github-version-control";
import {
  resolveManagedSharedCreedId,
  withSharedGitHubAccess,
} from "@creed/edition/github";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner")?.trim();
    const repo = searchParams.get("repo")?.trim();

    if (!owner || !repo) {
      return NextResponse.json({ error: "Missing repo owner or repo name." }, { status: 400 });
    }

    const { supabase, user } = await requireAuthenticatedUser();
    // Shared managers resolve branches on the TEAM token; everyone else on
    // their own connection.
    const sharedId = await resolveManagedSharedCreedId(supabase, user);
    const branches = sharedId
      ? await withSharedGitHubAccess(sharedId, (token) =>
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
