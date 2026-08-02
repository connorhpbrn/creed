import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { log } from "@/lib/observability";

export async function PATCH(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = body.name?.trim();

  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  // display_name is the key the app reads first (see lib/user-name.ts): OAuth
  // logins refresh name/full_name from the provider's identity, so a custom
  // name stored only there gets clobbered on the next Google sign-in. The
  // legacy keys are still written for anything external that reads them.
  const { data, error } = await auth.supabase.auth.updateUser({
    data: {
      display_name: name,
      name,
      full_name: name,
    },
  });

  if (error) {
    log.error("profile_update_failed", { userId: auth.user.id }, error);
    return NextResponse.json({ error: "Could not update your profile." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: data.user
      ? {
          name,
          email: data.user.email ?? "",
        }
      : null,
  });
}
