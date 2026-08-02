import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireApiAuth } from "@/lib/api-auth";
import { getCreedRole } from "@/lib/creed-membership";
import {
  buildGitHubAuthorizeUrl,
  getGitHubOAuthAppCredentials,
  isGitHubOAuthAppConfigured,
  GITHUB_OAUTH_STATE_COOKIE,
} from "@/lib/github";

// Start a GitHub connection for the version-control integration. Shared by the
// personal ("mode=personal") and team ("mode=company&creedId=") flows on the
// single "Creed" OAuth App: mint an anti-CSRF state, stash it (with mode +
// creedId) in a short-lived httpOnly cookie, and redirect to GitHub. The
// callback re-checks the cookie (and, for company, the caller's role) before
// storing any token. This is a top-level navigation, so failures redirect back
// to /settings with a reason rather than returning JSON.

type Mode = "personal" | "company";

function backToSettings(
  origin: string,
  param: "github" | "teamGithub",
  reason: string
): NextResponse {
  const url = new URL("/settings", origin);
  url.searchParams.set(param, reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const mode: Mode = url.searchParams.get("mode") === "company" ? "company" : "personal";
  const param = mode === "company" ? "teamGithub" : "github";

  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) {
    return NextResponse.redirect(new URL("/login?next=/settings", origin));
  }

  if (!isGitHubOAuthAppConfigured()) {
    return backToSettings(origin, param, "notconfigured");
  }

  let creedId: string | undefined;
  if (mode === "company") {
    creedId = url.searchParams.get("creedId")?.trim() || undefined;
    if (!creedId) return backToSettings(origin, param, "invalid");
    const role = await getCreedRole(auth.supabase, auth.user.id, creedId);
    if (role !== "owner" && role !== "admin") {
      return backToSettings(origin, param, "forbidden");
    }
  }

  const nonce = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(
    GITHUB_OAUTH_STATE_COOKIE,
    JSON.stringify({ mode, creedId: creedId ?? null, nonce }),
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
