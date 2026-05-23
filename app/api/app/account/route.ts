import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";
import { log } from "@/lib/observability";

export async function DELETE(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  // Authenticated session is the gate. The UI already double-confirms via
  // the dialog (open + Confirm), and the user can only act on their own
  // record because `requireApiAuth` returns the signed-in user.
  try {
    const admin = getSupabaseAdminClient();

    // Audit BEFORE delete since the user row will be cascaded away.
    await recordAuditEvent({
      userId: auth.user.id,
      action: "account.deleted",
      request,
      metadata: { email: auth.user.email },
    });

    const { error } = await admin.auth.admin.deleteUser(auth.user.id);

    if (error) {
      log.error("account_delete_admin_failed", { userId: auth.user.id }, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await auth.supabase.auth.signOut();

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("account_delete_failed", { userId: auth.user.id }, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete account." },
      { status: 500 }
    );
  }
}
