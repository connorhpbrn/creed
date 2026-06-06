import { NextResponse } from "next/server";
import {
  DEFAULT_SCOPE,
  DIRECT_EDIT_SCOPE,
  getOAuthClient,
  isAllowedRedirectUri,
  issueAuthorizationCode,
} from "@/lib/oauth";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { hasPaidEntitlement } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Handles the Allow / Deny POST from the consent screen. The user is
// re-resolved from the session (never a form field) and the client + redirect
// are re-validated here before any code is issued.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return new NextResponse(message, { status: 400 });
}

function redirectWith(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  // 303 See Other, not the NextResponse.redirect default of 307. This handler
  // runs on the consent form POST, but the OAuth callback must be reached with
  // a GET (?code=...&state=...). 307 preserves the method, so browsers were
  // POSTing to the client's callback (claude.ai / chatgpt.com), which only
  // accept GET - they returned "Method Not Allowed" / bad request right after
  // the user clicked Allow.
  return NextResponse.redirect(url.toString(), 303);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const decision = String(form.get("decision") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const state = form.get("state");
  // Bound the reflected state defensively; legitimate CSRF state is short.
  const stateValue = typeof state === "string" && state.length <= 2048 ? state : "";

  if (!clientId || !redirectUri || !codeChallenge) {
    return badRequest("Missing required parameters.");
  }

  // Re-validate the client and redirect server-side. Hidden form fields are
  // attacker-controllable, so we never trust them without re-checking.
  const client = await getOAuthClient(clientId);
  if (!client || !isAllowedRedirectUri(redirectUri, client.redirectUris)) {
    return badRequest("Invalid client or redirect URI.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Session expired between render and submit. Send them home to sign in
    // again rather than leaking anything to the redirect URI. 303 so the POST
    // becomes a GET.
    return NextResponse.redirect(new URL("/", request.url).toString(), 303);
  }

  if (decision !== "allow") {
    return redirectWith(redirectUri, {
      error: "access_denied",
      ...(stateValue ? { state: stateValue } : {}),
    });
  }

  // Eligibility is re-checked at grant time: MCP is a paid feature and needs a
  // real Creed to read.
  const paid = await hasPaidEntitlement(supabase, user.id);
  const hasCreed = paid && (await hasPersistedCreed(supabase, user.id));
  if (!paid || !hasCreed) {
    return badRequest("This account is not set up to connect agents yet.");
  }

  // OAuth scope is a coarse hint; real edit rights are enforced per-section on
  // the write / proposal routes, so the token scope gates nothing on its own.
  // Grant exactly the scopes the client asked for (bounded by what we support),
  // and return them verbatim from /token, so strict clients like ChatGPT - which
  // request all of scopes_supported and reject any mismatch (OAUTH_SCOPES_MISMATCH)
  // - get back exactly what they asked for. Default to the full set when the
  // client requests none.
  const allowedScopes = [...DEFAULT_SCOPE.split(" "), DIRECT_EDIT_SCOPE];
  const requestedScope = String(form.get("scope") ?? "").trim();
  const grantedScopes = requestedScope
    ? requestedScope.split(/\s+/).filter((value) => allowedScopes.includes(value))
    : allowedScopes;
  const scope = (grantedScopes.length ? grantedScopes : allowedScopes).join(" ");

  const code = await issueAuthorizationCode({
    clientId,
    userId: user.id,
    redirectUri,
    codeChallenge,
    scope,
  });

  return redirectWith(redirectUri, {
    code,
    ...(stateValue ? { state: stateValue } : {}),
  });
}
