import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Lightweight "is the current user paid?" check.
//
// Reads via the user's session client + the "Read own entitlement" RLS
// policy, so this stays cheap (no admin client, no token decrypts) and
// safe (a user can only see their own row). Unauthed callers get
// `{ paid: false }` without a 401 — the marketing chrome polls this on
// every signed-in render and we don't want the network panel to fill up
// with red rows when someone signs out.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `Cache-Control: private, no-store` because the payload differs per user
// and the wrong value (e.g. an unpaid user seeing a previous paid user's
// `true`) would unlock the app for someone who hasn't bought it. Set on
// every response below.
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ paid: false }, { headers: NO_STORE_HEADERS });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ paid: false }, { headers: NO_STORE_HEADERS });
  }

  const { data, error } = await supabase
    .from("creed_entitlements")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    // Don't leak the DB error to the client; treat as unpaid so the UI
    // doesn't accidentally show "Owned" on a transient failure.
    return NextResponse.json({ paid: false }, { headers: NO_STORE_HEADERS });
  }

  const paid = (data as { status?: string } | null)?.status === "paid";
  return NextResponse.json({ paid }, { headers: NO_STORE_HEADERS });
}
