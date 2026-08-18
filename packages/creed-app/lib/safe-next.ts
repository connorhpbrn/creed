// Sanitize a `next` redirect target from a query param. Only same-origin
// relative paths are allowed - rejects absolute URLs and protocol-relative /
// backslash tricks (`//evil.com`, `/\evil.com`) that could redirect off-site.
export function sanitizeNextPath(next: string | string[] | undefined | null): string {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  try {
    const base = new URL("https://creed.invalid");
    const resolved = new URL(value, base);
    return resolved.origin === base.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : "/";
  } catch {
    return "/";
  }
}
