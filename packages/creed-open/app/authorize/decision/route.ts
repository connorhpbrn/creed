import { NextResponse } from "next/server";
import {
  DEFAULT_SCOPE,
  DIRECT_EDIT_SCOPE,
  getOAuthClient,
  isAllowedRedirectUri,
  issueAuthorizationCode,
  oauthResource,
  type CreedGrant,
} from "@/lib/oauth";
import { listUserCreeds } from "@/lib/creed-membership";
import { getRequestAuth } from "@/lib/request-auth";
import { verifyOAuthCsrfToken } from "@creed/integrations/oauth-csrf";

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
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");
  // Prefer Origin; some browsers omit it on same-site navigational POSTs.
  // Sec-Fetch-Site: same-origin still proves the consent form was first-party.
  const sameOrigin =
    origin === expectedOrigin ||
    (!origin && secFetchSite === "same-origin");
  if (!sameOrigin) {
    return badRequest("Invalid request origin.");
  }
  const form = await request.formData();
  const decision = String(form.get("decision") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const resource = String(form.get("resource") ?? "");
  const state = form.get("state");
  // Bound the reflected state defensively; legitimate CSRF state is short.
  const stateValue = typeof state === "string" && state.length <= 2048 ? state : "";
  const csrfToken = String(form.get("csrf_token") ?? "");

  if (!clientId || !redirectUri || !codeChallenge || resource !== oauthResource()) {
    return badRequest("Missing required parameters.");
  }

  // Re-validate the client and redirect server-side. Hidden form fields are
  // attacker-controllable, so we never trust them without re-checking.
  const client = await getOAuthClient(clientId);
  if (!client || !isAllowedRedirectUri(redirectUri, client.redirectUris)) {
    return badRequest("Invalid client or redirect URI.");
  }

  const { supabase, user } = await getRequestAuth();
  if (!user) {
    // Session expired between render and submit. Send them home to sign in
    // again rather than leaking anything to the redirect URI. 303 so the POST
    // becomes a GET.
    return NextResponse.redirect(new URL("/", request.url).toString(), 303);
  }

  // The consent token is signed for the user who loaded the screen, so it can
  // only be checked once the session is resolved. Nothing above this point has
  // any side effect, and no code is issued below it without a valid token.
  if (!verifyOAuthCsrfToken(csrfToken, user.id)) {
    // Overwhelmingly this is someone who left the consent tab open past the
    // token's ten minutes, and a 400 leaves them stranded mid-connect with no
    // way back. Send them through the consent screen once more for a fresh
    // token; `retry` makes that a single bounce rather than a loop if the
    // token is failing for any other reason.
    if (new URL(request.url).searchParams.get("retry") === "1") {
      return badRequest("Invalid or expired consent request.");
    }

    const retry = new URL("/authorize", request.url);
    // The consent page reads this back and posts to `?retry=1`, so a second
    // failure lands on the 400 above instead of bouncing again.
    retry.searchParams.set("retry", "1");
    retry.searchParams.set("client_id", clientId);
    retry.searchParams.set("redirect_uri", redirectUri);
    retry.searchParams.set("code_challenge", codeChallenge);
    retry.searchParams.set("code_challenge_method", "S256");
    retry.searchParams.set("response_type", "code");
    retry.searchParams.set("resource", resource);
    if (stateValue) retry.searchParams.set("state", stateValue);
    const requestedScopeParam = String(form.get("scope") ?? "").trim();
    if (requestedScopeParam) retry.searchParams.set("scope", requestedScopeParam);
    return NextResponse.redirect(retry.toString(), 303);
  }

  if (decision !== "allow") {
    return redirectWith(redirectUri, {
      error: "access_denied",
      ...(stateValue ? { state: stateValue } : {}),
    });
  }

  // OAuth scope is a coarse hint; real edit rights are enforced per-section on
  // the write / proposal routes, so the token scope gates nothing on its own.
  // Grant exactly the scopes the client asked for (bounded by what we support),
  // and return them verbatim from /token, so strict clients like ChatGPT - which
  // request all of scopes_supported and reject any mismatch (OAUTH_SCOPES_MISMATCH)
  // - get back exactly what they asked for. When the client omits scope, grant
  // the full supported set. When it sends only unknown scopes, deny.
  const allowedScopes = [...DEFAULT_SCOPE.split(" "), DIRECT_EDIT_SCOPE];
  const requestedScope = String(form.get("scope") ?? "").trim();
  const grantedScopes = requestedScope
    ? requestedScope.split(/\s+/).filter((value) => allowedScopes.includes(value))
    : allowedScopes;
  if (requestedScope && grantedScopes.length === 0) {
    return redirectWith(redirectUri, {
      error: "invalid_scope",
      ...(stateValue ? { state: stateValue } : {}),
    });
  }
  const scope = grantedScopes.join(" ");

  // Which Creed this agent may reach. One connection reaches exactly one Creed
  // (single-select, like scoping a Supabase token to one project). The consent
  // form posts the chosen id, but hidden fields are attacker-controllable, so we
  // re-derive the user's real Creeds and keep the chosen one only if they belong
  // to it. Fall back to the personal Creed, then the first Creed, so an entitled
  // user (solo, with no picker) always gets a grant for a space they belong to.
  // The coarse per-connection mode is not enforced - edit rights are decided per
  // section at write time - so grant "direct" and let the section rules govern.
  const requestedCreedId = String(form.get("creed_grant") ?? "").trim();
  const allCreeds = await listUserCreeds(supabase, user.id);
  const creeds = allCreeds.filter((creed) => creed.type === "personal");
  const target =
    creeds.find((c) => c.id === requestedCreedId) ??
    creeds.find((c) => c.type === "personal") ??
    creeds[0];
  const creedGrants: CreedGrant[] = target ? [{ creedId: target.id, mode: "direct" }] : [];

  const code = await issueAuthorizationCode({
    clientId,
    userId: user.id,
    redirectUri,
    codeChallenge,
    scope,
    creedGrants,
    resource,
  });

  return redirectWith(redirectUri, {
    code,
    ...(stateValue ? { state: stateValue } : {}),
  });
}
