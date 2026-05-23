import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";

export async function PATCH(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();

  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Invalid display name" }, { status: 400 });
  }

  const { data, error } = await auth.supabase.auth.updateUser({
    data: {
      name,
      full_name: name,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
