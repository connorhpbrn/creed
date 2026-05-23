import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Sign-out endpoint.
//
// Belt-and-braces cookie clearing for shared-browser safety. Calling
// `supabase.auth.signOut()` is necessary (it revokes the refresh token
// server-side) but not sufficient — on shared devices, or after a future
// cookie-domain change (e.g. moving to a custom Supabase auth domain),
// stale `sb-*` cookies can linger and bleed the previous user's session
// into the next sign-in. We explicitly expire every `sb-*` cookie we
// can see so the browser is left in a known-clean state.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const origin = new URL(request.url).origin;
  const response = NextResponse.json({ ok: true, redirectTo: `${origin}/` });

  // Force-expire every Supabase auth cookie. `supabase.auth.signOut()` already
  // clears the cookies it knows about via the SSR cookie adapter, but we also
  // sweep anything starting with `sb-` to cover legacy cookie names + any
  // cookie set by a previous deployment on a different cookie domain.
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set({
        name: cookie.name,
        value: "",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
    }
  }

  // Avoid any intermediary caching a "logged out" response and serving it
  // to a future request that still has a valid session.
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
