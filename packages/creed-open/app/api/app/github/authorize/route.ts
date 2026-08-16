import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireApiAuth } from "@/lib/api-auth";
import {
  buildGitHubAuthorizeUrl,
  getGitHubOAuthAppCredentials,
  isGitHubOAuthAppConfigured,
  GITHUB_OAUTH_STATE_COOKIE,
} from "@creed/integrations/github";

// Start Open's personal GitHub connection. Shared mode is intentionally absent
// from this edition, including at the route boundary.

function backToSettings(origin: string, reason: string): NextResponse {
  const url = new URL("/settings", origin);
  url.searchParams.set("github", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) {
    return NextResponse.redirect(
      new URL("/claim?next=/settings", origin),
    );
  }

  if (!isGitHubOAuthAppConfigured()) {
    return backToSettings(origin, "notconfigured");
  }

  const nonce = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(
    GITHUB_OAUTH_STATE_COOKIE,
    JSON.stringify({ mode: "personal", creedId: null, nonce }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    }
  );

  const authorizeUrl = buildGitHubAuthorizeUrl({
    clientId: getGitHubOAuthAppCredentials().clientId,
    redirectUri: `${origin}/auth/github/callback`,
    state: nonce,
    prompt: "consent",
  });
  return NextResponse.redirect(authorizeUrl);
}
