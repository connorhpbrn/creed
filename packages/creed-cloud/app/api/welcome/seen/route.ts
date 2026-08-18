import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http-headers";
import {
  markEntitlementWelcomed,
  type WelcomeVariant,
} from "@creed/cloud/lib/stripe";
import { createSupabaseServerClient } from "@creed/persistence/supabase/server";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";

// Marks one Creed-type welcome tour as seen. Body: { variant: "personal" | "shared" }.
// Defaults to personal when omitted (legacy clients). Idempotent. Auth-gated.
//
// Fails soft: a write error still returns 204 because the client mirrors
// dismissal to localStorage per variant.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseVariant(value: unknown): WelcomeVariant {
  return value === "shared" ? "shared" : "personal";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not signed in" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    variant?: unknown;
  };
  const variant = parseVariant(body.variant);

  try {
    await markEntitlementWelcomed(user.id, variant);
  } catch {
    // Swallow: localStorage covers this device; next dismiss retries.
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}
