import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { revokeInvite, rotateInviteToken } from "@creed/cloud/lib/creed-invites";
import { sendEmail } from "@creed/cloud/lib/email";
import { sharedInviteSubject, renderSharedInviteEmail } from "@creed/cloud/lib/email-templates/shared-invite";
import { getSiteUrl } from "@creed/persistence/supabase/env";
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

// DELETE /api/app/creeds/invites/[id] - revoke a pending invite (owner/admin).
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
    action: "shared.invite_revoked",
    metadata: { creedId, inviteId: id },
  });
  return NextResponse.json({ ok: true });
}

// POST /api/app/creeds/invites/[id] { action: "resend" } - rotate token + email.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const rateLimit = await checkRateLimit({ scope: "creed-invite-resend", identifier: auth.user.id, limit: 10, windowMs: 60 * 60_000 });
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
  const sharedName = creed?.name ?? "the shared";
  const sent = await sendEmail({
    to: rotated.email,
    subject: sharedInviteSubject(sharedName),
    html: renderSharedInviteEmail({
      sharedName,
      inviterName,
      acceptUrl: `${siteUrl}/invite/${rotated.token}`,
      siteUrl,
    }),
  });

  await recordAuditEvent({
    userId: auth.user.id,
    action: "shared.invite_resent",
    metadata: { creedId, inviteId: id, emailSent: sent.ok },
    request,
  });
  return NextResponse.json({ ok: true, emailSent: sent.ok });
}
