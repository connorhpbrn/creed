import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";
import { revokeInvite, rotateInviteToken } from "@/lib/company-invites";
import { sendEmail } from "@/lib/email";
import { companyInviteSubject, renderCompanyInviteEmail } from "@/lib/email-templates/company-invite";
import { getSiteUrl } from "@/lib/supabase/env";
import { recordAuditEvent } from "@/lib/audit-log";
import { getDisplayName } from "@/lib/user-name";
import { checkRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

async function resolveCreedId(inviteId: string): Promise<string | null> {
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data } = (await admin
    .from("creed_invites")
    .select("creed_id")
    .eq("id", inviteId)
    .maybeSingle()) as { data: { creed_id: string } | null };
  return data?.creed_id ?? null;
}

// DELETE /api/app/company/invites/[id] - revoke a pending invite (owner/admin).
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const creedId = await resolveCreedId(id);
  if (!creedId) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  const result = await revokeInvite({ creedId, actorUserId: auth.user.id, inviteId: id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });

  await recordAuditEvent({
    userId: auth.user.id,
    action: "company.invite_revoked",
    metadata: { creedId, inviteId: id },
  });
  return NextResponse.json({ ok: true });
}

// POST /api/app/company/invites/[id] { action: "resend" } - rotate token + email.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const rateLimit = await checkRateLimit({ scope: "company-invite-resend", identifier: auth.user.id, limit: 10, windowMs: 60 * 60_000 });
  if (!rateLimit.ok) return NextResponse.json({ error: "Too many invite requests." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  const { id } = await ctx.params;

  const creedId = await resolveCreedId(id);
  if (!creedId) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  const rotated = await rotateInviteToken({ creedId, actorUserId: auth.user.id, inviteId: id });
  if (!rotated.ok) return NextResponse.json({ error: rotated.error }, { status: 403 });

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data: creed } = (await admin
    .from("creeds")
    .select("name")
    .eq("id", creedId)
    .maybeSingle()) as { data: { name: string } | null };
  const inviterName = getDisplayName(auth.user, "A teammate");
  const siteUrl = getSiteUrl();
  const companyName = creed?.name ?? "the company";
  const sent = await sendEmail({
    to: rotated.email,
    subject: companyInviteSubject(companyName),
    html: renderCompanyInviteEmail({
      companyName,
      inviterName,
      acceptUrl: `${siteUrl}/invite/${rotated.token}`,
      siteUrl,
    }),
  });

  await recordAuditEvent({
    userId: auth.user.id,
    action: "company.invite_resent",
    metadata: { creedId, inviteId: id, emailSent: sent.ok },
    request,
  });
  return NextResponse.json({ ok: true, emailSent: sent.ok });
}
