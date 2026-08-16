import { after, NextResponse } from "next/server";
import { readQualityBaseline } from "@/lib/ai/quality";
import type { CreedSection } from "@creed/core/creed-data";
import { requireApiAuth } from "@/lib/api-auth";
import { resolveActiveCreed, resolveMemberCreedById } from "@/lib/creed-context";
import { getPersonalCreedId } from "@/lib/creed-membership";
import { canRunAnalysis } from "@creed/core/creed-permissions";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createQualityRun,
  executeQualityRun,
  readLatestActiveQualityRun,
  readQualityRun,
  requeueStaleQualityRun,
  toPublicQualityRun,
} from "@/lib/ai/quality-runs";

// Quality analysis can take 30–90s depending on the model. Give the route
// enough budget to finish even if the client disconnects mid-flight, so the
// server-side persist always completes.
export const maxDuration = 300;

function scheduleQualityRun(runId: string) {
  after(async () => {
    await executeQualityRun(runId);
  });
}

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const runId = new URL(request.url).searchParams.get("runId")?.trim();
    if (!runId) {
      return NextResponse.json({ error: "Missing analysis run." }, { status: 400 });
    }
    let row = await readQualityRun(runId);
    if (!row || !(await resolveMemberCreedById(auth.supabase, auth.user, row.creed_id))) {
      return NextResponse.json({ error: "Analysis run not found." }, { status: 404 });
    }
    row = await requeueStaleQualityRun(row);
    if (row.status === "queued") scheduleQualityRun(row.id);
    return NextResponse.json({ run: toPublicQualityRun(row) });
  } catch {
    return NextResponse.json({ error: "Could not load analysis status." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as {
      sections?: CreedSection[];
      force?: boolean;
      readOnly?: boolean;
      targetSectionIds?: string[];
    };

    if (!Array.isArray(body.sections) || body.sections.length > 200) {
      return NextResponse.json({ error: "Missing or oversized sections." }, { status: 400 });
    }

    // Every report is keyed by creed_id: a shared report by the Shared Creed
    // creed (billed to the shared wallet, owner/admin-run), a personal report by
    // the user's personal creed (billed to their wallet, unchanged). Every member
    // can read the Shared baseline for the sections they can see (their
    // client only sends visible sections, so hidden-section scores never reach
    // them).
    const admin = getSupabaseAdminClient();
    const active = await resolveActiveCreed(auth.supabase, auth.user);
    const sharedEntry = active?.creeds.find(
      (c) => c.id === active.creedId && c.type === "shared"
    );
    const sharedCreedId = sharedEntry ? active!.creedId : undefined;
    const reportCreedId = active?.creedId ?? (await getPersonalCreedId(admin, auth.user.id));
    if (!reportCreedId) {
      return NextResponse.json({ error: "No Creed found for this account." }, { status: 400 });
    }

    if (body.readOnly) {
      const [result, run] = await Promise.all([
        readQualityBaseline({
          client: auth.supabase,
          userId: auth.user.id,
          creedId: reportCreedId,
          sections: body.sections,
          // Shared reads show the one shared report to every member. The stored
          // overall remains identical while section visibility is caller-scoped.
          sharedRead: Boolean(sharedCreedId),
        }),
        readLatestActiveQualityRun(reportCreedId),
      ]);

      if (run?.status === "queued") scheduleQualityRun(run.id);
      return NextResponse.json({ ...result, run });
    }

    const rateLimit = await checkRateLimit({
      scope: "ai-quality",
      identifier: auth.user.id,
      limit: 3,
      windowMs: 60_000,
    });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many quality analysis requests." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    if (sharedCreedId) {
      const role = sharedEntry!.role;
      if (!canRunAnalysis(role)) {
        return NextResponse.json(
          { error: "Only an owner or admin can run shared analysis." },
          { status: 403 }
        );
      }
    }

    const run = await createQualityRun({
      userId: auth.user.id,
      creedId: reportCreedId,
      sharedCreedId,
      sections: body.sections,
      force: Boolean(body.force),
      targetSectionIds: Array.isArray(body.targetSectionIds)
        ? body.targetSectionIds.filter((id): id is string => typeof id === "string")
        : undefined,
    });
    if (run.status === "queued") scheduleQualityRun(run.id);
    return NextResponse.json({ run }, { status: 202 });
  } catch {
    return NextResponse.json(
      { error: "Could not analyze Creed quality." },
      { status: 400 }
    );
  }
}
