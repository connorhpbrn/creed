import Link from "next/link";
import { cookies } from "next/headers";
import { CreedWordmark, IntegrationGlyph } from "@/components/creed/brand";
import { AuthorizeSpacePicker, type SpaceOption } from "@/components/creed/authorize-space-picker";
import { Button } from "@/components/ui/button";
import { getAgentIconKind } from "@/lib/agent-icon";
import { getOAuthClient, isAllowedRedirectUri, oauthResource } from "@/lib/oauth";
import {
  getAvatarInitials,
  getAvatarUrl,
  getUserName,
} from "@/lib/creed-backend";
import { listUserCreeds } from "@/lib/creed-membership";
import { hasActiveEntitlement } from "@/lib/stripe";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { issueOAuthCsrfToken, oauthCsrfCookieName, OAUTH_CSRF_MAX_AGE } from "@/lib/oauth-csrf";

// Creed-branded OAuth consent screen. A signed-in, set-up user sees a single
// Allow / Deny choice with the connecting client's icon. The page renders only;
// the Allow / Deny POST is handled by ./decision/route.ts, which re-resolves the
// user from the session and re-validates the client before issuing a code.
export const dynamic = "force-dynamic";

type SearchParams = {
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  response_type?: string;
  state?: string;
  scope?: string;
  resource?: string;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16">
        <CreedWordmark className="mb-10 h-[20px]" />
        <div className="w-full rounded-[var(--radius-xl)] bg-[var(--creed-surface)] p-7 text-center">
          {children}
        </div>
      </div>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="text-[18px] font-medium text-[var(--creed-text-primary)]">{title}</h1>
      <p className="mt-3 text-[14px] leading-7 text-[var(--creed-text-secondary)]">{body}</p>
    </>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <Message
          title="Connection unavailable"
          body="Creed is not fully configured on this deployment. Try again later."
        />
      </Shell>
    );
  }

  const clientId = params.client_id ?? "";
  const redirectUri = params.redirect_uri ?? "";
  const codeChallenge = params.code_challenge ?? "";
  const resource = params.resource ?? "";

  // Validate the request before showing anything. On a bad client or
  // redirect_uri we render an error and never redirect, so we can't be used as
  // an open redirector.
  if (
    !clientId ||
    !redirectUri ||
    !codeChallenge ||
    resource !== oauthResource() ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) ||
    params.response_type !== "code" ||
    params.code_challenge_method !== "S256"
  ) {
    return (
      <Shell>
        <Message
          title="Invalid connection request"
          body="This connection link is missing required parameters or uses an unsupported method. Start the connection again from your agent."
        />
      </Shell>
    );
  }

  const client = await getOAuthClient(clientId);
  if (!client || !isAllowedRedirectUri(redirectUri, client.redirectUris)) {
    return (
      <Shell>
        <Message
          title="Invalid connection request"
          body="We couldn't verify the app requesting access. Start the connection again from your agent."
        />
      </Shell>
    );
  }

  // Reconstruct this page's own URL so a signed-out user returns here after
  // Google sign-in.
  const returnParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      returnParams.set(key, value);
    }
  }
  const returnTo = `/authorize?${returnParams.toString()}`;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <Message
          title="Sign in to connect"
          body={`Sign in to your Creed account to let ${client.clientName} read and update your Creed.`}
        />
        <div className="mt-6 flex justify-center">
          <Link
            href={`/login?next=${encodeURIComponent(returnTo)}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--creed-text-primary)] px-5 text-[14px] font-medium text-[var(--creed-button-primary-fg)] transition-colors hover:bg-[var(--creed-button-primary-hover)]"
          >
            Log in
          </Link>
        </div>
      </Shell>
    );
  }

  const iconKind = getAgentIconKind(client.clientName);

  // No Creed gate here on purpose: a paid user may connect before any Creed
  // content exists (the agent reads an empty/seed Creed fine). Signed-in + paid
  // is the bar; onboarding composes via copy-paste, not over MCP. Unpaid users
  // get the same agent-specific consent layout, just with a single "Go to
  // Creed" CTA instead of Allow / Deny.
  const paid = await hasActiveEntitlement(supabase, user.id);
  if (!paid) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-4">
          <IntegrationGlyph kind="mcp" framed={false} className="h-14 w-14" />
          <span className="text-[18px] text-[var(--creed-text-tertiary)]">+</span>
          <IntegrationGlyph kind={iconKind} framed={false} className="h-14 w-14" />
        </div>

        <h1 className="mt-6 text-[18px] font-medium text-[var(--creed-text-primary)]">
          Set up Creed to connect {client.clientName}
        </h1>
        <p className="mt-3 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
          Connecting an agent is part of Creed. Finish setting up your Creed, then
          start the connection from {client.clientName} again.
        </p>
        <p className="mt-2 text-[13px] text-[var(--creed-text-tertiary)]">
          Signed in as {user.email}
        </p>

        <div className="mt-7 flex justify-center">
          <Link href="/">
            <Button className="h-9 rounded-md bg-[var(--creed-accent)] px-6 text-white hover:bg-[var(--creed-accent-hover)]">
              Go to Creed
            </Button>
          </Link>
        </div>
      </Shell>
    );
  }

  // The spaces the user can grant this agent. A solo user (personal Creed only)
  // sees no picker - the decision route grants their one space by default, which
  // keeps the connect flow a single click. A user in one or more company Creeds
  // gets the picker so they can scope the agent to personal or one company (a
  // connection reaches exactly one Creed).
  const creeds = await listUserCreeds(supabase, user.id);
  // Show each space by its real name - the person's name for their personal
  // Creed (mirroring the app switcher), the company name for a company Creed -
  // never a generic "Personal"/"Company" label, since the owner knows which is
  // which.
  const spaces: SpaceOption[] = creeds.map((creed) => ({
    id: creed.id,
    label: creed.type === "personal" ? getUserName(user) : creed.name,
    type: creed.type,
    avatarInitials: getAvatarInitials(
      creed.type === "personal" ? getUserName(user) : creed.name,
    ),
    avatarUrl: creed.type === "personal" ? getAvatarUrl(user) : creed.avatarUrl,
  }));
  const showPicker = spaces.length > 1;
  const csrfToken = issueOAuthCsrfToken();
  (await cookies()).set(oauthCsrfCookieName(csrfToken), csrfToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/authorize",
    maxAge: OAUTH_CSRF_MAX_AGE,
  });

  return (
    <Shell>
      <div className="flex items-center justify-center gap-4">
        <IntegrationGlyph kind="mcp" framed={false} className="h-14 w-14" />
        <span className="text-[18px] text-[var(--creed-text-tertiary)]">+</span>
        <IntegrationGlyph kind={iconKind} framed={false} className="h-14 w-14" />
      </div>

      <h1 className="mt-6 text-[18px] font-medium text-[var(--creed-text-primary)]">
        Connect {client.clientName} to your Creed
      </h1>
      <p className="mt-3 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
        {client.clientName} can read your Creed and propose updates, and edits a
        section directly only where you allow direct edits.
      </p>
      <p className="mt-2 text-[13px] text-[var(--creed-text-tertiary)]">
        Signed in as {user.email}
      </p>

      <form method="post" action="/authorize/decision" className="mt-5">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="resource" value={resource} />
        <input type="hidden" name="csrf_token" value={csrfToken} />
        {params.state ? <input type="hidden" name="state" value={params.state} /> : null}
        {params.scope ? <input type="hidden" name="scope" value={params.scope} /> : null}
        {showPicker ? <AuthorizeSpacePicker spaces={spaces} /> : null}
        <div className="mt-6 flex items-center gap-3">
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="secondary"
            className="h-9 flex-1 rounded-md"
          >
            Deny
          </Button>
          <Button
            type="submit"
            name="decision"
            value="allow"
            className="h-9 flex-1 rounded-md bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)]"
          >
            Allow
          </Button>
        </div>
      </form>
    </Shell>
  );
}
