import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { setSectionPermission } from "@/lib/company-admin";
import { getCreedRole } from "@/lib/creed-membership";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";
import { normalizeAgentPermission } from "@/lib/creed-data";

// GET /api/app/company/permissions?creedId=&userId= - a member's per-section
// permission overrides (owner/admin only), for the Permissions editor.
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const creedId = url.searchParams.get("creedId");
  const userId = url.searchParams.get("userId");
  if (!creedId || !userId) {
    return NextResponse.json({ error: "creedId and userId are required." }, { status: 400 });
  }
  const role = await getCreedRole(auth.supabase, auth.user.id, creedId);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data } = (await admin
    .from("creed_member_section_permissions")
    .select("section_id, permission")
    .eq("creed_id", creedId)
    .eq("user_id", userId)) as { data: Array<{ section_id: string; permission: string }> | null };
  const overrides: Record<string, string> = {};
  for (const row of data ?? []) overrides[row.section_id] = row.permission;
  return NextResponse.json({ overrides });
}

// POST /api/app/company/permissions { creedId, userId, sectionId, permission }
// Owner/admin sets a member's per-section permission.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const b = (await request.json().catch(() => ({}))) as {
    creedId?: unknown;
    userId?: unknown;
    sectionId?: unknown;
    permission?: unknown;
  };
  if (
    typeof b.creedId !== "string" ||
    typeof b.userId !== "string" ||
    typeof b.sectionId !== "string" ||
    typeof b.permission !== "string"
  ) {
    return NextResponse.json({ error: "creedId, userId, sectionId, permission are required." }, { status: 400 });
  }
  const result = await setSectionPermission({
    creedId: b.creedId,
    actor: auth.user,
    targetUserId: b.userId,
    sectionId: b.sectionId,
    permission: normalizeAgentPermission(b.permission),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
