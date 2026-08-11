import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiAuth } from "@/lib/api-auth";
import {
  exchangeGitHubOAuthCode,
  getGitHubOAuthAppCredentials,
  getGitHubViewer,
  GITHUB_OAUTH_STATE_COOKIE,
} from "@creed/integrations/github";
import { upsertGitHubIntegration } from "@/lib/creed-backend";
import { recordAuditEvent } from "@/lib/audit-log";

// Complete Open's personal-only GitHub OAuth flow. A state cookie minted for
// any other edition or mode is rejected instead of silently broadening Open.

function backToSettings(origin: string, reason: string): NextResponse {
  const url = new URL("/settings", origin);
  url.searchParams.set("github", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const cookieStore = await cookies();
  const rawState = cookieStore.get(GITHUB_OAUTH_STATE_COOKIE)?.value ?? null;
  // Single-use: drop the cookie regardless of outcome.
  cookieStore.delete(GITHUB_OAUTH_STATE_COOKIE);

  const code = searchParams.get("code")?.trim();
  const state = searchParams.get("state")?.trim();

  let mode = "";
  let nonce = "";
  try {
    const parsed = rawState
      ? (JSON.parse(rawState) as { mode?: string; creedId?: string | null; nonce?: string })
      : null;
    mode = parsed?.mode ?? "";
    nonce = parsed?.nonce?.trim() ?? "";
  } catch {
    // Fall through to the invalid-state branch below.
  }

  if (mode !== "personal" || !code || !state || !nonce || state !== nonce) {
    return backToSettings(origin, "error");
  }

  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) {
    return NextResponse.redirect(
      new URL("/claim?next=/settings", origin),
    );
  }

  try {
    const token = await exchangeGitHubOAuthCode({
      credentials: getGitHubOAuthAppCredentials(),
      code,
      redirectUri: `${origin}/auth/github/callback`,
    });
    const viewer = await getGitHubViewer(token.accessToken);
    if (!viewer) return backToSettings(origin, "error");

    await upsertGitHubIntegration(auth.supabase, auth.user.id, {
      status: "connected",
      providerAccountId: String(viewer.id),
      providerLogin: viewer.login,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt: token.expiresAt,
    });
    void recordAuditEvent({
      userId: auth.user.id,
      action: "github.connected",
      request,
      metadata: { providerLogin: viewer.login },
    });

    return backToSettings(origin, "connected");
  } catch {
    return backToSettings(origin, "error");
  }
}
