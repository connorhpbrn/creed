import { NextResponse } from "next/server";
import { registerOAuthClient } from "@/lib/oauth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSupabaseAdminConfigured } from "@creed/persistence/supabase/env";
import { isValidOAuthRedirectUri } from "@creed/integrations/oauth-redirect";

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
    !redirectUris.every(isValidOAuthRedirectUri)
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

  let client;
  try {
    client = await registerOAuthClient({
      clientName,
      redirectUris: redirectUris as string[],
    });
  } catch {
    return NextResponse.json(
      { error: "server_error", error_description: "Could not register OAuth client." },
      { status: 503, headers: CORS_HEADERS },
    );
  }

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
