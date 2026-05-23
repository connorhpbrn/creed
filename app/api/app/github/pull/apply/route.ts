import { NextResponse } from "next/server";
import type { CreedSection } from "@/lib/creed-data";
import { loadCreedState, persistCreedState } from "@/lib/creed-backend";
import { requireAuthenticatedUser } from "@/lib/github-version-control";

type ApplyBody = {
  sections?: CreedSection[];
  remoteSha?: string | null;
  remoteMessage?: string | null;
  remoteCommittedAt?: string | null;
  remoteContentHash?: string | null;
};

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAuthenticatedUser();
    const body = (await request.json()) as ApplyBody;

    if (!Array.isArray(body.sections) || body.sections.length === 0) {
      return NextResponse.json({ error: "Missing imported sections." }, { status: 400 });
    }

    const result = await loadCreedState(supabase, user);
    // Pull is authoritative. Force every imported section to be
    // agent-writable so connected agents (Codex / Claude / MCP clients)
    // can edit them post-pull. Without this, sections inherit the
    // parser's historical `agentWritable: false` and the MCP contract
    // reports zero editable sections. Healing here also fixes rows that
    // a prior pull wrote with `false`. The next pull rewrites them.
    const importedSections = body.sections.map((section) => ({
      ...section,
      agentWritable: true,
    }));
    const nextState = {
      ...result.state,
      syncLabel: "Saved just now",
      sections: importedSections,
      proposals: [],
      settings: {
        ...result.state.settings,
        versionControl: {
          ...result.state.settings.versionControl,
          lastRemoteSha: body.remoteSha ?? undefined,
          lastRemoteMessage: body.remoteMessage ?? undefined,
          lastRemoteCommittedAt: body.remoteCommittedAt ?? undefined,
          lastSyncedContentHash: body.remoteContentHash ?? undefined,
          syncStatus: "up-to-date" as const,
        },
      },
      mutationTick: result.state.mutationTick + 1,
      sectionRevisions: Object.fromEntries(
        body.sections.map((section) => [section.id, 1])
      ),
    };

    await persistCreedState(supabase, user.id, nextState);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import Creed from GitHub.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 }
    );
  }
}
