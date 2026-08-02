import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http-headers";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Lightweight "has this user started onboarding?" probe for marketing CTAs:
// true once a Creed exists server-side (seed claimed or agent-composed), so a
// button can offer "Resume" instead of "Get Started". Account-tied, so it's
// correct on any device. Mirrors /api/stripe/status: an unauthed caller gets
// { started: false } rather than a 401, since the chrome polls this on render.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ started: false }, { headers: NO_STORE_HEADERS });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ started: false }, { headers: NO_STORE_HEADERS });
  }

  try {
    const started = await hasPersistedCreed(supabase, user.id);
    return NextResponse.json({ started }, { headers: NO_STORE_HEADERS });
  } catch {
    // Missing tables (fresh DB) or any transient failure: treat as not started
    // so the CTA falls back to "Get Started" rather than erroring. This is just
    // a label hint, never a gate, so failing closed is harmless.
    return NextResponse.json({ started: false }, { headers: NO_STORE_HEADERS });
  }
}
