import { NextResponse } from "next/server";
import { upsertGitHubIntegration } from "@/lib/creed-backend";
import { createSupabaseServerClient } from "@creed/persistence/supabase/server";
import { sanitizeNextPath } from "@/lib/safe-next";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";
  const integration = searchParams.get("integration");

  // Identity-link flows (reconnect GitHub, connect Google/X in Settings) come
  // back through here with the user already signed in. We must not treat them
  // like a fresh login or bounce them to /login on any hiccup.
  const isLinkFlow = integration !== null || next.startsWith("/settings");

  let exchangeFailed = false;
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const session = data.session;
    const user = data.user ?? session?.user;

    // Only a real error means the link was invalid / expired (or opened in a
    // browser that never held the PKCE verifier). A merely-absent session is
    // normal for identity linking, so don't treat that as a failure.
    if (error) {
      exchangeFailed = true;
    }

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
  const safeNext = sanitizeNextPath(next);

  // Only a genuinely failed sign-in/confirmation goes to /login; link flows
  // always return to where they came from (the user is still signed in).
  const target = code && exchangeFailed && !isLinkFlow ? "/login" : safeNext;
  return NextResponse.redirect(`${origin}${target}`);
}
