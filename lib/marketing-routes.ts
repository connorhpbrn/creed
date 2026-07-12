// Shared list of marketing / public route prefixes - routes that never need
// the signed-in user's state on the server. Used in two places that must agree:
//   - the root layout, to skip the loadCreedState fan-out
//   - the proxy/middleware, to skip the Supabase session refresh
// Keeping the list here prevents the two from drifting apart.

export const MARKETING_PREFIXES = [
  "/home",
  "/docs",
  "/bench",
  "/examples",
  "/pricing",
  "/roadmap",
  "/privacy",
  "/terms",
  "/stack",
  "/login",
  "/signup",
  "/reset-password",
  "/mcp",
  // OAuth surface for MCP connect (route handlers that bypass the layout
  // anyway, listed for intent) plus discovery metadata.
  "/authorize",
  "/token",
  "/register",
  "/.well-known",
] as const;

export function isMarketingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return MARKETING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
