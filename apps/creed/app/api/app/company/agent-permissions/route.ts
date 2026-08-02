import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getCreedRole } from "@/lib/creed-membership";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// A member's OWN per-section agent ceiling on a company Creed (the company twin
// of the personal creed_sections.agent_permission). Strictly self-serve: every
// member manages only their own rows, so there is no role gate beyond
// membership. 'hidden' takes effect immediately (the section is stripped from
// that member's MCP payload); the write levels become live ceilings when
// company MCP writes ship.

const LEVELS = new Set(["hidden", "read-only", "propose", "direct"]);

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

// POST { creedId, sectionId, permission } - set one section's level for the
// calling member. POST { creedId, permission, allSections: true } - set every
// visible section at once (the personal "All sections" control).
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as {
    creedId?: unknown;
    sectionId?: unknown;
    permission?: unknown;
    allSections?: unknown;
  };
  if (typeof b.creedId !== "string" || typeof b.permission !== "string" || !LEVELS.has(b.permission)) {
    return NextResponse.json({ error: "creedId and a valid permission are required." }, { status: 400 });
  }
  const allSections = b.allSections === true;
  if (!allSections && typeof b.sectionId !== "string") {
    return NextResponse.json({ error: "sectionId is required." }, { status: 400 });
  }

  const role = await getCreedRole(auth.supabase, auth.user.id, b.creedId);
  if (!role) {
    return NextResponse.json({ error: "You are not a member of this Creed." }, { status: 403 });
  }

  const db = admin();
  const now = new Date().toISOString();

  if (allSections) {
    const { data } = (await db
      .from("creed_sections")
      .select("section_id")
      .eq("creed_id", b.creedId)
      .is("deleted_at", null)) as { data: Array<{ section_id: string }> | null };
    const rows = (data ?? []).map((row) => ({
      creed_id: b.creedId,
      user_id: auth.user.id,
      section_id: row.section_id,
      permission: b.permission,
      updated_at: now,
    }));
    if (rows.length > 0) {
      const { error } = await db
        .from("creed_member_agent_permissions")
        .upsert(rows, { onConflict: "creed_id,user_id,section_id" });
      if (error) {
        return NextResponse.json({ error: "Could not update agent permissions." }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await db.from("creed_member_agent_permissions").upsert(
    {
      creed_id: b.creedId,
      user_id: auth.user.id,
      section_id: b.sectionId,
      permission: b.permission,
      updated_at: now,
    },
    { onConflict: "creed_id,user_id,section_id" }
  );
  if (error) {
    return NextResponse.json({ error: "Could not update the agent permission." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
