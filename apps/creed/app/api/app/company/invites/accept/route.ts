import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { acceptInvite } from "@/lib/company-invites";
import { setActiveCreed } from "@/lib/creed-context";
import { recordAuditEvent } from "@/lib/audit-log";

// POST /api/app/company/invites/accept { token } - the signed-in user accepts
// an invite. Validates expiry, seat capacity, and email match in the lib, then
// creates membership and switches the active Creed to the company.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = body && typeof body === "object" && "token" in body ? (body as { token: unknown }).token : null;
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  const result = await acceptInvite(token, auth.user);
  if (!result.ok) {
    const status = result.code === "no_seats" ? 409 : result.code === "email_mismatch" ? 403 : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  await setActiveCreed(auth.supabase, auth.user, result.creedId);
  await recordAuditEvent({
    userId: auth.user.id,
    action: "company.invite_accepted",
    metadata: { creedId: result.creedId },
    request,
  });

  return NextResponse.json({ ok: true, creedId: result.creedId });
}
