import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
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
    const userId = auth.user.id;

    // Audit BEFORE delete since the user row will be cascaded away.
    await recordAuditEvent({
      userId,
      action: "account.deleted",
      request,
      metadata: { email: auth.user.email },
    });

    // creed_credit_homes.creed_id is ON DELETE RESTRICT so Creed delete can
    // reassign the pot. That restrict also blocks auth.users → creeds cascade
    // when a home row still points at an owned Creed. Clear homes, then delete
    // owned Creeds explicitly, then remove the auth user. Do not rely on
    // cascade ordering alone.
    const { error: homeError } = await admin
      .from("creed_credit_homes")
      .delete()
      .eq("user_id", userId);
    if (homeError) {
      log.error("account_delete_credit_home_failed", { userId }, homeError);
      return NextResponse.json(
        { error: "Could not clear bonus credits before deleting the account." },
        { status: 500 },
      );
    }

    const { error: creedsError } = await admin
      .from("creeds")
      .delete()
      .eq("owner_user_id", userId);
    if (creedsError) {
      log.error("account_delete_creeds_failed", { userId }, creedsError);
      return NextResponse.json(
        { error: "Could not delete your Creeds before deleting the account." },
        { status: 500 },
      );
    }

    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) {
      log.error("account_delete_admin_failed", { userId }, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Best-effort: the auth user is already gone, so signOut can hang or
    // fail on a dead session. Never block the success response on it.
    try {
      await Promise.race([
        auth.supabase.auth.signOut(),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 1500);
        }),
      ]);
    } catch (signOutError) {
      log.warn(
        "account_delete_signout_failed",
        { userId },
        signOutError instanceof Error
          ? signOutError
          : new Error(String(signOutError)),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("account_delete_failed", { userId: auth.user.id }, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete account." },
      { status: 500 }
    );
  }
}
