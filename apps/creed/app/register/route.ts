import { NextResponse } from "next/server";
import { registerOAuthClient } from "@/lib/oauth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

// RFC 7591 Dynamic Client Registration. MCP clients self-register here with no
// pre-shared id, which is what makes "paste the URL" connect work for any
// client. Public clients only (no secret issued).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const MAX_REDIRECT_URIS = 10;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Block schemes that could execute or smuggle content if a redirect target is
// ever mishandled. Everything else is allowed.
const BLOCKED_REDIRECT_SCHEMES = new Set(["javascript", "data", "vbscript", "file"]);

function isValidRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return false;
  }
  try {
    const url = new URL(value);
    // Accept http/https (web + loopback) and custom app schemes. Native MCP
    // clients like Cursor register a custom-scheme redirect (e.g. cursor://),
    // which is valid per RFC 8252, so we can't restrict to http/https.
    const scheme = url.protocol.replace(/:$/, "").toLowerCase();
    return scheme.length > 0 && !BLOCKED_REDIRECT_SCHEMES.has(scheme);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "server_error" },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const verdict = await checkRateLimit({
    scope: "oauth-register",
    identifier: ip,
    limit: 20,
    windowMs: 60_000,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "too_many_requests" },
      {
        status: 429,
        headers: { ...CORS_HEADERS, "Retry-After": String(verdict.retryAfterSeconds) },
      }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > MAX_REDIRECT_URIS ||
    !redirectUris.every(isValidRedirectUri)
  ) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be a non-empty array of valid URLs.",
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const clientName =
    typeof body.client_name === "string" ? body.client_name : undefined;

  const client = await registerOAuthClient({
    clientName,
    redirectUris: redirectUris as string[],
  });

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: CORS_HEADERS }
  );
}
