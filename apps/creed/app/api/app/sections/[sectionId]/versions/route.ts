import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listSectionVersions } from "@/lib/company-sections";

type Ctx = { params: Promise<{ sectionId: string }> };

// GET /api/app/sections/[sectionId]/versions?creedId= - list a section's
// stored versions, newest first. Company owner/admin only (enforced in the
// lib); backs the History sheet.
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const { sectionId } = await ctx.params;

  const creedId = new URL(request.url).searchParams.get("creedId");
  if (!creedId) {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }

  const result = await listSectionVersions({
    creedId,
    user: auth.user,
    sectionId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.code === "forbidden" ? 403 : 400 },
    );
  }
  return NextResponse.json({ versions: result.versions });
}
