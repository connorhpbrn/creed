import { NextResponse } from "next/server";
import { listGitHubBranches } from "@/lib/github";
import { withAuthenticatedGitHubAccess } from "@/lib/github-version-control";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner")?.trim();
    const repo = searchParams.get("repo")?.trim();

    if (!owner || !repo) {
      return NextResponse.json({ error: "Missing repo owner or repo name." }, { status: 400 });
    }

    const branches = await withAuthenticatedGitHubAccess(async ({ integration }) =>
      listGitHubBranches(integration.access_token!, owner, repo)
    );

    return NextResponse.json({
      branches: branches.map((branch) => ({
        name: branch.name,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load GitHub branches.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 }
    );
  }
}
