import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { createInvite } from "@creed/cloud/lib/creed-invites";
import { sendEmail } from "@creed/cloud/lib/email";
import { sharedInviteSubject, renderSharedInviteEmail } from "@creed/cloud/lib/email-templates/shared-invite";
import { getSiteUrl } from "@creed/persistence/supabase/env";
import { recordAuditEvent } from "@/lib/audit-log";
import { getDisplayName } from "@/lib/user-name";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/app/creeds/invites { creedId, email, role } - owner/admin.
// Creates a pending invite and emails the branded link. Email failure does not
// fail the request: the invite is created
// and can be resent.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const rateLimit = await checkRateLimit({ scope: "creed-invite", identifier: auth.user.id, limit: 10, windowMs: 60 * 60_000 });
  if (!rateLimit.ok) return NextResponse.json({ error: "Too many invite requests." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as { creedId?: unknown; email?: unknown; role?: unknown };
  const creedId = typeof b.creedId === "string" ? b.creedId : "";
  const email = typeof b.email === "string" ? b.email : "";
  const role = b.role === "admin" ? "admin" : "member";
  if (!creedId || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const result = await createInvite({ creedId, actorUserId: auth.user.id, email, role });
  if (!result.ok) {
    const status = result.code === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  // Compose + send the invite email (best-effort).
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data: creed } = (await admin
    .from("creeds")
    .select("name")
    .eq("id", creedId)
    .maybeSingle()) as { data: { name: string } | null };
  const inviterName = getDisplayName(auth.user, "A teammate");
  const siteUrl = getSiteUrl();
  const sharedName = creed?.name ?? "the shared";
  const sent = await sendEmail({
    to: email.trim(),
    subject: sharedInviteSubject(sharedName),
    html: renderSharedInviteEmail({
      sharedName,
      inviterName,
      acceptUrl: `${siteUrl}/invite/${result.token}`,
      siteUrl,
    }),
  });

  await recordAuditEvent({
    userId: auth.user.id,
    action: "shared.invite_created",
    metadata: { creedId, email: email.trim().toLowerCase(), role, emailSent: sent.ok },
    request,
  });

  return NextResponse.json({ ok: true, inviteId: result.inviteId, emailSent: sent.ok });
}
