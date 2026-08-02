import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { setActiveCreed } from "@/lib/creed-context";

// POST /api/app/creeds/activate { creedId } - switch the active Creed.
// Validates membership before setting the cookie; a non-member gets 403 so a
// stale/forged id can never switch context into a Creed the user left.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const creedId =
    body && typeof body === "object" && "creedId" in body
      ? (body as { creedId: unknown }).creedId
      : null;
  if (typeof creedId !== "string" || creedId.length === 0) {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }

  const role = await setActiveCreed(auth.supabase, auth.user, creedId);
  if (!role) {
    return NextResponse.json({ error: "You are not a member of that Creed." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, creedId, role });
}
