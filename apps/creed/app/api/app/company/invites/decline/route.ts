import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { declineInvite } from "@/lib/company-invites";
import { recordAuditEvent } from "@/lib/audit-log";

// POST /api/app/company/invites/decline { token } - the signed-in user declines
// an invite addressed to their email. Marks it revoked (freeing the seat) after
// an email-match check in the lib.
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

  const result = await declineInvite(token, auth.user);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await recordAuditEvent({
    userId: auth.user.id,
    action: "company.invite_declined",
    metadata: {},
    request,
  });

  return NextResponse.json({ ok: true });
}
