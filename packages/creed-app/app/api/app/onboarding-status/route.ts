import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http-headers";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { requireApiAuth } from "@/lib/api-auth";

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

  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const started = await hasPersistedCreed(auth.supabase, auth.user.id);
    return NextResponse.json({ started }, { headers: NO_STORE_HEADERS });
  } catch {
    // Missing tables (fresh DB) or any transient failure: treat as not started
    // so the CTA falls back to "Get Started" rather than erroring. This is just
    // a label hint, never a gate, so failing closed is harmless.
    return NextResponse.json({ started: false }, { headers: NO_STORE_HEADERS });
  }
}
