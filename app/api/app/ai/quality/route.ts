import { NextResponse } from "next/server";
import { analyzeCreedQuality, readQualityBaseline } from "@/lib/ai/quality";
import type { CreedSection } from "@/lib/creed-data";
import { requireApiAuth } from "@/lib/api-auth";
import { resolveActiveCreed } from "@/lib/creed-context";
import { getCompanyAccessState, getPersonalCreedId } from "@/lib/creed-membership";
import { canRunAnalysis } from "@/lib/creed-permissions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

// Quality analysis can take 30–90s depending on the model. Give the route
// enough budget to finish even if the client disconnects mid-flight, so the
// server-side persist always completes.
export const maxDuration = 300;

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

    // Every report is keyed by creed_id: a company report by the shared company
    // creed (billed to the company wallet, owner/admin-run), a personal report by
    // the user's personal creed (billed to their wallet, unchanged). Every member
    // can read the shared company baseline for the sections they can see (their
    // client only sends visible sections, so hidden-section scores never reach
    // them).
    const admin = getSupabaseAdminClient();
    const active = await resolveActiveCreed(auth.supabase, auth.user);
    const companyEntry = active?.creeds.find(
      (c) => c.id === active.creedId && c.type === "company"
    );
    const companyId = companyEntry ? active!.creedId : undefined;
    const reportCreedId = companyId ?? (await getPersonalCreedId(admin, auth.user.id));
    if (!reportCreedId) {
      return NextResponse.json({ error: "No Creed found for this account." }, { status: 400 });
    }

    if (body.readOnly) {
      const result = await readQualityBaseline({
        client: auth.supabase,
        userId: auth.user.id,
        creedId: reportCreedId,
        sections: body.sections,
        // Company reads show the one shared report to every member: the stored
        // overall score + full narrative, identical to what the owner sees, not a
        // per-viewer recompute over their visible subset. No-op for personal.
        companyRead: Boolean(companyId),
      });

      return NextResponse.json(result);
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

    if (companyId) {
      const access = await getCompanyAccessState(admin, companyId);
      if (access === "frozen") {
        return NextResponse.json(
          { error: "This company Creed is read-only until billing is fixed." },
          { status: 403 }
        );
      }

      const role = companyEntry!.role;
      if (!canRunAnalysis(role)) {
        return NextResponse.json(
          { error: "Only an owner or admin can run company analysis." },
          { status: 403 }
        );
      }
    }

    const result = await analyzeCreedQuality({
      client: auth.supabase,
      userId: auth.user.id,
      creedId: reportCreedId,
      companyId,
      sections: body.sections,
      force: body.force,
      targetSectionIds: Array.isArray(body.targetSectionIds)
        ? body.targetSectionIds.filter((id): id is string => typeof id === "string")
        : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not analyze Creed quality." },
      { status: 400 }
    );
  }
}
