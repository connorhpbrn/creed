import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getCreedRole } from "@/lib/creed-membership";
import { recordAuditEvent } from "@/lib/audit-log";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// The company Creed's GitHub sync target (repo/branch). Owner/admin only.
// Pushes run on the team's GitHub connection via /api/app/github/push; this
// route only persists where the company file syncs to. Changing the repo or
// branch resets the sync bookkeeping so status is re-derived against the new
// target.

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

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
    repoOwner?: unknown;
    repoName?: unknown;
    branch?: unknown;
  };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  for (const key of ["repoOwner", "repoName", "branch"] as const) {
    const value = b[key];
    if (value !== undefined && (typeof value !== "string" || value.length > 300)) {
      return NextResponse.json({ error: `Invalid ${key}.` }, { status: 400 });
    }
  }

  const role = await getCreedRole(auth.supabase, auth.user.id, b.creedId);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Only the owner or an admin can configure version control." }, { status: 403 });
  }

  const db = admin();
  const now = new Date().toISOString();
  const targetChanged = b.repoOwner !== undefined || b.repoName !== undefined || b.branch !== undefined;
  const row: Record<string, unknown> = {
    creed_id: b.creedId,
    provider: "github",
    configured_by: auth.user.id,
    updated_at: now,
  };
  if (b.repoOwner !== undefined) row.repo_owner = b.repoOwner || null;
  if (b.repoName !== undefined) row.repo_name = b.repoName || null;
  if (b.branch !== undefined) row.branch = b.branch || null;
  if (targetChanged) {
    row.last_remote_sha = null;
    row.last_remote_message = null;
    row.last_remote_committed_at = null;
    row.last_synced_content_hash = null;
    row.sync_status = "unknown";
  }

  const { error } = await db
    .from("creed_company_version_control")
    .upsert(row, { onConflict: "creed_id" });
  if (error) {
    return NextResponse.json({ error: "Could not save version control settings." }, { status: 500 });
  }

  void recordAuditEvent({
    userId: auth.user.id,
    action: "company.version_control_updated",
    request,
    metadata: { creedId: b.creedId, repoOwner: b.repoOwner, repoName: b.repoName, branch: b.branch },
  });

  return NextResponse.json({ ok: true });
}
