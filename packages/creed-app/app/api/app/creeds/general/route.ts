import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { updateCreedGeneral } from "@/lib/creed-admin";

// POST /api/app/creeds/general { creedId, name? } - update Creed identity
// fields the owner (or Shared admin) can edit. Saved immediately from settings.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const b = (await request.json().catch(() => ({}))) as {
    creedId?: unknown;
    name?: unknown;
  };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  if (b.name !== undefined && typeof b.name !== "string") {
    return NextResponse.json({ error: "Invalid name." }, { status: 400 });
  }
  const result = await updateCreedGeneral({
    creedId: b.creedId,
    actor: auth.user,
    name: typeof b.name === "string" ? b.name : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
