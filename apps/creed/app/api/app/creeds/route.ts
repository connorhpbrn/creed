import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listUserCreeds } from "@/lib/creed-membership";

// GET /api/app/creeds - the Creed switcher list for the signed-in user.
// Personal first, then company Creeds. Reads membership under RLS via the
// user's session client.
export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const creeds = await listUserCreeds(auth.supabase, auth.user.id);
  return NextResponse.json({ creeds });
}
