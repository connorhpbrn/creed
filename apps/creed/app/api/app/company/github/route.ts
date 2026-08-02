import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getCreedRole } from "@/lib/creed-membership";
import { clearCompanyGitHubIntegration } from "@/lib/company-github";
import { recordAuditEvent } from "@/lib/audit-log";

// DELETE /api/app/company/github { creedId } - disconnect the team's GitHub
// (owner/admin). Clears the stored token; the configured repo/branch is kept
// for an easy reconnect. Audit-only, matching how BYOK changes are recorded.
export async function DELETE(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as { creedId?: unknown };
  if (typeof body.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }

  const role = await getCreedRole(auth.supabase, auth.user.id, body.creedId);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "Only an owner or admin can manage the team GitHub connection." },
      { status: 403 }
    );
  }

  await clearCompanyGitHubIntegration(body.creedId);
  void recordAuditEvent({
    userId: auth.user.id,
    action: "company.github_disconnected",
    request,
    metadata: { creedId: body.creedId },
  });

  return NextResponse.json({ ok: true });
}
