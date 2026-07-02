import { NextResponse } from "next/server";
import {
  getOAuthClient,
  isAllowedRedirectUri,
  issueTokenPair,
  redeemAuthorizationCode,
  rotateRefreshToken,
  type IssuedTokens,
} from "@/lib/oauth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

// OAuth 2.1 token endpoint. Handles the authorization_code grant (PKCE-verified
// code exchange) and the refresh_token grant (rotating refresh). Public clients,
// so no client authentication; security rests on PKCE + single-use codes +
// exact redirect_uri match.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
} as const;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const BASE_HEADERS = { ...CORS_HEADERS, ...NO_STORE } as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function oauthError(error: string, status = 400, description?: string) {
  return NextResponse.json(
    description ? { error, error_description: description } : { error },
    { status, headers: BASE_HEADERS }
  );
}

function tokenResponse(tokens: IssuedTokens) {
  return NextResponse.json(
    {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.accessExpiresInSeconds,
      refresh_token: tokens.refreshToken,
      scope: tokens.scope,
    },
    { headers: BASE_HEADERS }
  );
}

// Accepts the standard form-encoded body and also tolerates JSON, since some
// MCP clients post JSON.
async function readParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === "string") {
        out[key] = value;
      }
    }
    return out;
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

// OAuth 2.1 lets a client send its credentials in an HTTP Basic header instead
// of the form body, and ChatGPT does exactly that on the token exchange. We're
// a public client (no secret), so only the client_id is read from it.
function parseBasicAuthClientId(authHeader: string | null): string {
  if (!authHeader || !authHeader.toLowerCase().startsWith("basic ")) {
    return "";
  }
  try {
    const decoded = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf8");
    const rawClientId = decoded.split(":")[0] ?? "";
    try {
      return decodeURIComponent(rawClientId);
    } catch {
      return rawClientId;
    }
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return oauthError("server_error", 503);
  }

  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch {
    return oauthError("invalid_request", 400, "Malformed token request body.");
  }

  const grantType = params.grant_type;
  // Prefer the form-body client_id; fall back to the Basic-auth header so
  // clients like ChatGPT that authenticate the token request that way work.
  const clientId = params.client_id || parseBasicAuthClientId(request.headers.get("authorization"));

  if (!clientId) {
    return oauthError("invalid_client", 400, "client_id is required.");
  }

  const verdict = checkRateLimit({
    scope: "oauth-token",
    identifier: clientId,
    limit: 60,
    windowMs: 60_000,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "too_many_requests" },
      {
        status: 429,
        headers: { ...BASE_HEADERS, "Retry-After": String(verdict.retryAfterSeconds) },
      }
    );
  }

  const client = await getOAuthClient(clientId);
  if (!client) {
    return oauthError("invalid_client", 400, "Unknown client_id.");
  }

  if (grantType === "authorization_code") {
    const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = params;
    if (!code || !redirectUri || !codeVerifier) {
      return oauthError(
        "invalid_request",
        400,
        "code, redirect_uri, and code_verifier are required."
      );
    }
    if (!isAllowedRedirectUri(redirectUri, client.redirectUris)) {
      return oauthError("invalid_grant", 400, "redirect_uri mismatch.");
    }

    const redeemed = await redeemAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier,
    });
    if ("error" in redeemed) {
      return oauthError(redeemed.error, redeemed.error === "server_error" ? 500 : 400);
    }

    const tokens = await issueTokenPair({
      clientId,
      userId: redeemed.userId,
      scope: redeemed.scope,
    });
    return tokenResponse(tokens);
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.refresh_token;
    if (!refreshToken) {
      return oauthError("invalid_request", 400, "refresh_token is required.");
    }
    const rotated = await rotateRefreshToken(refreshToken);
    if ("error" in rotated) {
      return oauthError(rotated.error, rotated.error === "server_error" ? 500 : 400);
    }
    return tokenResponse(rotated);
  }

  return oauthError("unsupported_grant_type", 400);
}
