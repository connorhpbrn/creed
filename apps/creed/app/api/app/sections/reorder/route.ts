import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { reorderCompanySections } from "@/lib/company-sections";

// POST /api/app/sections/reorder { creedId, sectionIds } - owner/admin reorder
// of a company Creed's sections. The order persists (section positions) so every
// member picks it up on their next sync. Role is re-checked in the lib.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as { creedId?: unknown; sectionIds?: unknown };
  if (
    typeof b.creedId !== "string" ||
    !Array.isArray(b.sectionIds) ||
    !b.sectionIds.every((id) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "creedId and sectionIds are required." },
      { status: 400 },
    );
  }

  const result = await reorderCompanySections({
    creedId: b.creedId,
    user: auth.user,
    sectionIds: b.sectionIds as string[],
  });
  if (!result.ok) {
    const status =
      result.code === "forbidden" || result.code === "frozen" ? 403 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }
  return NextResponse.json({ ok: true });
}
