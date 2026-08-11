# Security policy

## Reporting a vulnerability

If you believe you've found a security issue in Creed, please report it
privately. **Do not open a public GitHub issue** for vulnerabilities.

Email the contact address listed in `NEXT_PUBLIC_CONTACT_EMAIL` (the same
address shown in the footer of the live app and on the Privacy page) with:

- a description of the issue
- the smallest reproduction that demonstrates it
- the impact you believe it has
- whether you intend to publish it eventually

You'll get an acknowledgement within a few days. We'll work with you on a
fix and on a sensible disclosure timeline.

## Scope

Creed is a small, open-source codebase. Shared application source lives in
`packages/creed-app/`, Open-only source in `packages/creed-open/`, and the
thin self-hosted composition in `apps/open/`. The pieces most worth scrutinising:

- **`/api/creed/*` and `/mcp` routes**: these are the agent-facing
  endpoints. They authenticate by bearer token (read / proposal /
  direct-edit), enforce rate limits, and write through Supabase RLS. Any
  way to read or write another user's data without their token would be
  critical.
- **`/api/app/*` routes**: these authenticate via Supabase session.
  Anything that bypasses `requireApiAuth` is in scope.
- **Token storage**: read / proposal / direct-edit tokens are hashed
  before being stored (`packages/integrations/secret-crypto.ts`). The raw tokens are
  AES-256-GCM-encrypted with `CREED_ENCRYPTION_SECRET` so they can
  be recovered for the owner. Anything that exposes the plaintext token
  to another user, or weakens the hash compare, is in scope.
- **Prompt injection through agent-supplied text**: the AI synthesizer
  and quality analyzer accept user-controlled input. Prompt injection
  that exfiltrates other users' data is in scope; injection that simply
  produces silly output is not.
- **CSP and headers**: `packages/creed-app/lib/csp-policy.ts`, each app's
  `proxy.ts`, and `next.config.ts` define the policy; gaps are in scope.
- **Supabase RLS policies**: `packages/persistence/supabase/migrations/*.sql`. Any policy
  that lets one signed-in user read or write another user's rows is in
  scope.

Out of scope: third-party services Creed integrates with (Supabase,
OpenRouter, GitHub OAuth); report those upstream. Issues that require
the user to install a malicious browser extension or hand over their
API keys are also out of scope.

## Hardening notes for self-hosters

If you fork Creed and run your own instance, please:

1. Generate a fresh `CREED_ENCRYPTION_SECRET` (32 random bytes,
   base64-encoded). Do not reuse the upstream value.
   To rotate it without invalidating stored provider tokens, move the current
   value to `CREED_ENCRYPTION_SECRET_PREVIOUS`, install the new value as
   `CREED_ENCRYPTION_SECRET`, deploy, then remove the previous value after all
   stored credentials have been refreshed. Versioned ciphertext is written
   with the current key while legacy ciphertext remains readable during the
   transition.
2. Use distinct Supabase service-role keys per environment and never
   commit them.
3. Leave `CREED_CSP_ENFORCE` unset (or `1`) in production so CSP is
   enforced. Set `CREED_CSP_ENFORCE=0` only for an emergency Report-Only
   rollback.
4. Apply every migration from `apps/open/supabase/migrations/` before opening
   the app to real users. RLS policies live there and the app trusts them.
5. Run behind HTTPS. Several cookies are issued with `SameSite=Lax` and
   the auth flow assumes a TLS origin.
