// Content-Security-Policy, split by route.
//
// A nonce and 'unsafe-inline' cannot coexist: per CSP2+ a browser ignores
// 'unsafe-inline' whenever a nonce is present. Next's prerendered HTML always
// carries inline bootstrap scripts (`self.__next_f.push(...)`) with no nonce, so
// a nonce-based policy forces every route it covers to render per request. When
// that policy was applied at the root it made the whole site dynamic - marketing
// pages lost static generation, CDN caching, `<Link>` prefetch and ISR, and the
// unnonced `<script type="application/ld+json">` on every marketing page was
// blocked along with them.
//
// So the policy is scoped instead:
//   - Authenticated / credential routes render per request anyway. They keep the
//     strict nonce policy - this is the surface that renders user data and holds
//     the session.
//   - Everything else (marketing, docs, legal, the static company page) is
//     first-party constant markup with no user-controlled HTML. It takes
//     'unsafe-inline' and stays prerenderable.
//
// Every prefix below MUST be dynamically rendered; a prerendered route under a
// nonce policy ships HTML whose scripts the browser will refuse to run. The
// security-hardening test asserts each one declares `dynamic = "force-dynamic"`.

export const CSP_NONCE_ROUTE_PREFIXES = [
  // Signed-in app surface
  "/file",
  "/connections",
  "/settings",
  "/onboarding",
  "/invite",
  "/payment/success",
  "/dev",
  // Credential + OAuth consent surface
  "/login",
  "/signup",
  "/reset-password",
  "/authorize",
] as const;

export function requiresCspNonce(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // The root path is the signed-in router (it redirects on the session), so it
  // renders per request and belongs under the strict policy.
  if (pathname === "/") return true;
  return CSP_NONCE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function contentSecurityPolicy(nonce: string | null): string {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSources = [
    "'self'",
    nonce ? `'nonce-${nonce}'` : "'unsafe-inline'",
    isDev ? "'unsafe-eval'" : null,
    "https://js.stripe.com",
    "https://checkout.stripe.com",
  ].filter(Boolean);

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.openrouter.ai https://openrouter.ai https://api.github.com https://api.stripe.com https://checkout.stripe.com",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
