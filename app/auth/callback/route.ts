import { NextResponse } from "next/server";
import { upsertGitHubIntegration } from "@/lib/creed-backend";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";
  const integration = searchParams.get("integration");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    const session = data.session;
    const user = data.user ?? session?.user;

    if (integration === "github" && session?.provider_token && user) {
      const githubIdentity = (
        (user.identities as
          | Array<{
              provider?: string;
              id?: string;
              identity_data?: Record<string, unknown> | null;
            }>
          | undefined) ?? []
      ).find((identity) => identity.provider === "github");

      await upsertGitHubIntegration(supabase, user.id, {
        status: "connected",
        providerAccountId: githubIdentity?.id ?? null,
        providerLogin:
          (typeof githubIdentity?.identity_data?.user_name === "string"
            ? githubIdentity.identity_data.user_name
            : null) ??
          (typeof githubIdentity?.identity_data?.preferred_username === "string"
            ? githubIdentity.identity_data.preferred_username
            : null),
        accessToken: session.provider_token,
        refreshToken: session.provider_refresh_token ?? null,
        tokenExpiresAt: null,
      });
    }
  }

  // Resolve `next` strictly against our origin and reject anything that
  // could resolve to a different host. This blocks open-redirect tricks
  // like `next=//evil.com` or `next=/\evil.com` (which `startsWith("/")`
  // alone would have accepted).
  const safeNext = (() => {
    if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
      return "/";
    }
    try {
      const resolved = new URL(next, origin);
      return resolved.origin === origin ? `${resolved.pathname}${resolved.search}${resolved.hash}` : "/";
    } catch {
      return "/";
    }
  })();

  return NextResponse.redirect(`${origin}${safeNext}`);
}
