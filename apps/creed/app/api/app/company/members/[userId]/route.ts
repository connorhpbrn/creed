import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { setMemberRole, removeMember, transferOwnership } from "@/lib/company-admin";

type Ctx = { params: Promise<{ userId: string }> };

// POST /api/app/company/members/[userId] - change role, or transfer ownership.
//   { creedId, role: "admin" | "member" }  -> setMemberRole (owner-only)
//   { creedId, action: "transfer" }         -> transferOwnership (owner-only)
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = await ctx.params;
  const b = (await request.json().catch(() => ({}))) as {
    creedId?: unknown;
    role?: unknown;
    action?: unknown;
  };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }

  if (b.action === "transfer") {
    const result = await transferOwnership({ creedId: b.creedId, actor: auth.user, targetUserId: userId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  }

  if (b.role !== "admin" && b.role !== "member") {
    return NextResponse.json({ error: "creedId and role are required." }, { status: 400 });
  }
  const result = await setMemberRole({ creedId: b.creedId, actor: auth.user, targetUserId: userId, role: b.role });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

// DELETE /api/app/company/members/[userId] { creedId } - remove a member (owner/admin).
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = await ctx.params;
  const b = (await request.json().catch(() => ({}))) as { creedId?: unknown };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  const result = await removeMember({ creedId: b.creedId, actor: auth.user, targetUserId: userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
