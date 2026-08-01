import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, requiresCspNonce } from "@/lib/csp-policy";
import { isMarketingPath } from "@/lib/marketing-routes";
import { getSupabasePublishableKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env";

export const config = {
  // Run on every route except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets|api/(?:status|version|health|github/stars|roadmap)(?:/|$)|.*\\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico|woff2?|ttf|otf|mp4)$).*)"],
};

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some(
    ({ name }) => name.startsWith("sb-") && name.includes("auth-token"),
  );
}

function generateRequestId() {
  // Crypto.randomUUID is available in the Edge runtime.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasAuthCookie = hasSupabaseAuthCookie(request);
  if (pathname === "/" && !hasAuthCookie) {
    return NextResponse.redirect(new URL("/home", request.url), 307);
  }
  const incomingId = request.headers.get("x-request-id");
  const requestId = incomingId && incomingId.length <= 80 ? incomingId : generateRequestId();
  // Only the dynamically rendered app/credential routes get the nonce policy;
  // prerendered public pages take the inline-permitting one. See lib/csp-policy
  // for why the two cannot be combined.
  const nonce = requiresCspNonce(pathname)
    ? Buffer.from(crypto.randomUUID()).toString("base64")
    : null;
  const csp = contentSecurityPolicy(nonce);
  const cspHeaderName =
    process.env.NODE_ENV === "production" && process.env.CREED_CSP_ENFORCE !== "0"
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  // Next reads these off the request to stamp the nonce onto its own scripts.
  // Forwarding them on a nonce-free route would be meaningless, so we don't.
  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
  }
  // Server Components can't read the request URL directly. Forwarding the
  // pathname here lets the root layout skip expensive Supabase fan-out for
  // marketing routes that never read user state.
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Refresh the Supabase session on app routes. @supabase/ssr requires this in
  // middleware: Server Components can read cookies but can't reliably write
  // them, so this is the only place an expired access token gets refreshed and
  // the new cookie written back. Without it, server renders intermittently see
  // a stale/expired session - login loops, the /pricing bounce, and the
  // seed/empty state that only resolves on a manual refresh. Marketing routes
  // are skipped to keep them fast; they don't gate on the session server-side.
  if (
    isSupabaseConfigured() &&
    hasAuthCookie &&
    !pathname.startsWith("/api/") &&
    !isMarketingPath(pathname)
  ) {
    const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update the request cookies so this same request's server render
          // (the root layout's loadCreedState) sees the refreshed token, then
          // rebuild the response from the updated request and re-apply our
          // forwarded headers + the Set-Cookie for the browser.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          const refreshedHeaders = new Headers(request.headers);
          refreshedHeaders.set("x-request-id", requestId);
          if (nonce) {
            refreshedHeaders.set("x-nonce", nonce);
            refreshedHeaders.set("Content-Security-Policy", csp);
          }
          refreshedHeaders.set("x-pathname", request.nextUrl.pathname);
          response = NextResponse.next({ request: { headers: refreshedHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    // getUser() is what triggers the token refresh + the setAll cookie write.
    await supabase.auth.getUser();
  }

  response.headers.set("x-request-id", requestId);
  response.headers.set(cspHeaderName, csp);
  return response;
}
