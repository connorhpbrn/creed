import { NextResponse } from "next/server";
import { getPublicSponsor } from "@creed/cloud/lib/sponsors";
import { log } from "@/lib/observability";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) {
    return NextResponse.json({ error: "Sponsor not found." }, { status: 404 });
  }
  try {
    const sponsor = await getPublicSponsor(id);
    if (!sponsor) {
      return NextResponse.json({ error: "Sponsor not found." }, { status: 404 });
    }
    return NextResponse.json({ sponsor }, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    log.error(
      "sponsor_detail_load_failed",
      {},
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json({ error: "Could not load the sponsor." }, { status: 500 });
  }
}
