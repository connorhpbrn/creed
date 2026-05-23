import { NextResponse } from "next/server";
import { analyzeCreedQuality, readQualityBaseline, updateSectionQualityBaseline } from "@/lib/ai/quality";
import type { CreedSection } from "@/lib/creed-data";
import { requireApiAuth } from "@/lib/api-auth";

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
      scope?: "full" | "section";
    };

    if (!Array.isArray(body.sections) || body.sections.length > 200) {
      return NextResponse.json({ error: "Missing or oversized sections." }, { status: 400 });
    }

    if (body.readOnly) {
      const result = await readQualityBaseline({
        client: auth.supabase,
        userId: auth.user.id,
        sections: body.sections,
      });

      return NextResponse.json(result);
    }

    const result = await analyzeCreedQuality({
      client: auth.supabase,
      userId: auth.user.id,
      sections: body.sections,
      force: body.force,
      persist: body.scope !== "section",
    });

    if (body.scope === "section" && body.sections.length === 1 && result.report?.sections[0]) {
      const baseline = await updateSectionQualityBaseline({
        client: auth.supabase,
        userId: auth.user.id,
        section: body.sections[0],
        sectionReport: result.report.sections[0],
      });

      return NextResponse.json({
        ...result,
        sectionHashes: baseline.sectionHashes,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not analyze Creed quality." },
      { status: 400 }
    );
  }
}
