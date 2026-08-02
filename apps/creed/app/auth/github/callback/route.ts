import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiAuth } from "@/lib/api-auth";
import { getCreedRole } from "@/lib/creed-membership";
import {
  exchangeGitHubOAuthCode,
  getGitHubOAuthAppCredentials,
  getGitHubViewer,
  GITHUB_OAUTH_STATE_COOKIE,
} from "@/lib/github";
import { upsertGitHubIntegration } from "@/lib/creed-backend";
import { upsertCompanyGitHubIntegration } from "@/lib/company-github";
import { recordAuditEvent } from "@/lib/audit-log";

// Shared OAuth callback for the GitHub version-control integration (personal +
// team, one "Creed" app). We verify the anti-CSRF cookie, exchange the code, and
// store the encrypted token where the state says: personal -> creed_integrations
// (per user), company -> creed_company_github_integration (per creed, owner/admin
// only). Connecting is a config action, so it lands in the audit log only.
// Always redirects back to /settings with a status the settings screen toasts.

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
  const { origin, searchParams } = new URL(request.url);
  const cookieStore = await cookies();
  const rawState = cookieStore.get(GITHUB_OAUTH_STATE_COOKIE)?.value ?? null;
  // Single-use: drop the cookie regardless of outcome.
  cookieStore.delete(GITHUB_OAUTH_STATE_COOKIE);

  const code = searchParams.get("code")?.trim();
  const state = searchParams.get("state")?.trim();

  let mode: Mode = "personal";
  let creedId = "";
  let nonce = "";
  try {
    const parsed = rawState
      ? (JSON.parse(rawState) as { mode?: string; creedId?: string | null; nonce?: string })
      : null;
    mode = parsed?.mode === "company" ? "company" : "personal";
    creedId = parsed?.creedId?.trim() ?? "";
    nonce = parsed?.nonce?.trim() ?? "";
  } catch {
    // Fall through to the invalid-state branch below.
  }

  const param = mode === "company" ? "teamGithub" : "github";

  if (!code || !state || !nonce || state !== nonce) {
    return backToSettings(origin, param, "error");
  }

  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) {
    return NextResponse.redirect(new URL("/login?next=/settings", origin));
  }

  if (mode === "company") {
    if (!creedId) return backToSettings(origin, param, "error");
    const role = await getCreedRole(auth.supabase, auth.user.id, creedId);
    if (role !== "owner" && role !== "admin") {
      return backToSettings(origin, param, "forbidden");
    }
  }

  try {
    const token = await exchangeGitHubOAuthCode({
      credentials: getGitHubOAuthAppCredentials(),
      code,
      redirectUri: `${origin}/auth/github/callback`,
    });
    const viewer = await getGitHubViewer(token.accessToken);
    if (!viewer) return backToSettings(origin, param, "error");

    if (mode === "company") {
      await upsertCompanyGitHubIntegration({
        creedId,
        connectedBy: auth.user.id,
        providerAccountId: String(viewer.id),
        providerLogin: viewer.login,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: token.expiresAt,
      });
      void recordAuditEvent({
        userId: auth.user.id,
        action: "company.github_connected",
        request,
        metadata: { creedId, providerLogin: viewer.login },
      });
    } else {
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
    }

    return backToSettings(origin, param, "connected");
  } catch {
    return backToSettings(origin, param, "error");
  }
}
