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
import { buildOAuthRedirectUri } from "@creed/integrations/oauth-redirect";
import { log } from "@/lib/observability";

// Handles the Allow / Deny POST from the consent screen. The user is
// re-resolved from the session (never a form field) and the client + redirect
// are re-validated here before any code is issued.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return new NextResponse(message, { status: 400 });
}

function redirectWith(redirectUri: string, params: Record<string, string>) {
  // 303 See Other, not the NextResponse.redirect default of 307. This handler
  // runs on the consent form POST, but the OAuth callback must be reached with
  // a GET (?code=...&state=...). 307 preserves the method, so browsers were
  // POSTing to the client's callback (claude.ai / chatgpt.com), which only
  // accept GET - they returned "Method Not Allowed" / bad request right after
  // the user clicked Allow.
  return NextResponse.redirect(buildOAuthRedirectUri(redirectUri, params), 303);
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
  let client;
  try {
    client = await getOAuthClient(clientId);
  } catch (error) {
    log.error("OAuth consent client lookup failed", { clientId }, error);
    return new NextResponse("Connection temporarily unavailable.", { status: 503 });
  }
  if (!client || !isAllowedRedirectUri(redirectUri, client.redirectUris)) {
    return badRequest("Invalid client or redirect URI.");
  }

  let requestAuth: Awaited<ReturnType<typeof getRequestAuth>>;
  try {
    requestAuth = await getRequestAuth();
  } catch (error) {
    log.error("OAuth consent session lookup failed", { clientId }, error);
    return redirectWith(redirectUri, {
      error: "server_error",
      ...(stateValue ? { state: stateValue } : {}),
    });
  }
  const { supabase, user } = requestAuth;
  if (!user) {
    return redirectWith(redirectUri, {
      error: "login_required",
      ...(stateValue ? { state: stateValue } : {}),
    });
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

  // Strict clients compare the returned scopes with their request, so reject
  // the whole request rather than silently removing an unsupported scope.
  const allowedScopes = [...DEFAULT_SCOPE.split(" "), DIRECT_EDIT_SCOPE];
  const requestedScope = String(form.get("scope") ?? "").trim();
  const requestedScopes = requestedScope ? requestedScope.split(/\s+/) : allowedScopes;
  if (requestedScopes.some((value) => !allowedScopes.includes(value))) {
    return redirectWith(redirectUri, {
      error: "invalid_scope",
      ...(stateValue ? { state: stateValue } : {}),
    });
  }
  const scope = requestedScopes.join(" ");

  // Which Creed this agent may reach. One connection reaches exactly one Creed
  // (single-select, like scoping a Supabase token to one project). The consent
  // form posts the chosen id, but hidden fields are attacker-controllable, so we
  // re-derive the user's real Creeds and keep the chosen one only if they belong
  // to it. Fall back to the personal Creed, then the first Creed, so an entitled
  // user (solo, with no picker) always gets a grant for a space they belong to.
  // The coarse per-connection mode is not enforced - edit rights are decided per
  // section at write time - so grant "direct" and let the section rules govern.
  const requestedCreedId = String(form.get("creed_grant") ?? "").trim();
  try {
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
  } catch (error) {
    log.error("OAuth consent decision failed", { clientId }, error);
    return redirectWith(redirectUri, {
      error: "server_error",
      ...(stateValue ? { state: stateValue } : {}),
    });
  }
}
