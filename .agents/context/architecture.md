# Creed Architecture

Current implementation truth. Code is canonical if this file drifts.

## Repository boundary

Creed is one npm workspace monorepo with one root lockfile and four independent Next.js applications:

- `apps/open/` composes the self-hosted product.
- `apps/cloud/` composes the managed development product.
- `apps/docs/` owns `docs.creed.md`.
- `apps/status/` owns `status.creed.md`.

The application code is split by responsibility:

- `packages/creed-app/` contains behavior used by both editions: the editor, Personal onboarding, marketing, MCP and HTTP APIs, common routes, AI tooling, and shared application infrastructure.
- `packages/creed-open/` contains the private installation claim, owner-session auth, Open route compositions, and Open adapters.
- `packages/creed-cloud/` contains hosted accounts, Stripe, managed credits, Shared UI and routes, feedback, and Cloud adapters.
- `packages/creed-core/` contains types and pure domain logic.
- `packages/creed-ui/` contains reusable interface primitives.
- `packages/persistence/` contains shared Supabase clients.
- `packages/integrations/` contains protocol and third-party integration helpers.

Open and Cloud are compile-time compositions. There is no runtime deployment flag. `apps/open/edition/*` and `apps/cloud/edition/*` satisfy the same typed adapter boundary with different implementations. Shared packages must never import `@creed/cloud`.

Tailwind uses `source(none)` in `packages/creed-app/app/globals.css`. Every UI-bearing app and package must remain in its explicit `@source` list so Open-only, Cloud-only, and shared primitive utilities are emitted in both builds. Each source is restricted to authored module extensions because scanning binary app assets can generate corrupt arbitrary utilities. The architecture test fails if a required source glob is removed.

## Dependency direction

```text
apps/open  -> @creed/open  -> shared packages
apps/cloud -> @creed/cloud -> shared packages
apps/docs                  -> @creed/app interface primitives

shared packages -X-> @creed/open or @creed/cloud
@creed/open       -X-> @creed/cloud
```

Open must not contain Cloud routes or depend on Stripe. Architecture tests in `packages/creed-app/tests/open-cloud-deployment.test.ts` enforce those boundaries.

## Routing

Each app owns a thin `app/` tree. Route wrappers export implementations from the package that owns the behavior:

- common routes export from `@creed/app/app/*`;
- Open-only routes export from `@creed/open/app/*`;
- Cloud-only routes export from `@creed/cloud/app/*`.

Cloud-only surfaces include login, signup, password reset, billing, Stripe, feedback, invitations, members, Shared onboarding, managed credits, and account deletion. None may exist in the Open route manifest.

Cloud's temporary private-development boundary lives in `packages/creed-cloud/lib/cloud-access.ts` and the Cloud edition auth adapter. `CREED_CLOUD_ACCESS=private` restricts authenticated page, app API, HTTP-token, and MCP access to the server-only comma-separated `CREED_CLOUD_TESTER_EMAILS` allowlist. It also disables managed billing and changes signed-out acquisition actions to `View roadmap`. The mode defaults to `public`, so removing the module wiring and the two variables restores the launch behavior without a data migration.

The shared proxy implementation is `packages/creed-app/proxy.ts`. Each app supplies a compile-time policy. Open requires the owner cookie and redirects an unclaimed root request to `/claim`. Cloud retains hosted account behavior and managed-payment CSP origins.

## Open owner model

Creed Open is a single-owner application with no public login or signup screen.

- The installer provides `CREED_OWNER_SECRET`, at least 32 characters, as a server-only environment value.
- The first browser enters it at `/claim`.
- Constant-time verification derives a hidden Supabase Auth owner and issues a signed, HTTP-only, `SameSite=Strict` owner cookie.
- `public.creed_installation` records the one owner deterministically. Owner discovery never scans Auth users.
- Rotating `CREED_OWNER_SECRET` invalidates existing owner cookies.
- Another device can be authorised by entering the current secret.
- API and MCP access continue through their own scoped credentials.

Open fails closed when configuration or migrations are incomplete. `public.creed_schema_version()` gives the service role one bounded readiness check. A valid owner cookie does not skip that check: the app and onboarding layouts send the owner back to `/claim` until the schema meets `REQUIRED_OPEN_SCHEMA_VERSION`.

## Authentication boundaries

- Every `/api/app/*` route calls `requireApiAuth()` unless the route is the explicitly unauthenticated Open claim endpoint.
- Open `requireApiAuth()` requires both the hidden Supabase session and the valid installation-owner cookie.
- Cloud `requireApiAuth()` uses its hosted Supabase session.
- `/api/creed/*` verifies hashed scoped bearer tokens.
- `/mcp` uses OAuth access tokens, discovery metadata, PKCE, and browser consent. Authorization-code exchange and refresh rotation are idempotent for bounded retries, and token rows become usable only after their Creed grants are persisted.
- Open and Cloud re-export one shared, stateless MCP `2026-07-28` endpoint from `packages/creed-app/app/mcp/route.ts`. It uses the official TypeScript v2 server, starts with `server/discover`, and requires the per-request metadata envelope. The same factory also serves `2025-11-25` `initialize` traffic in stateless mode so current clients can connect. `GET /mcp` opens a live SSE stream with no Creed data and no session so SSE clients can connect. JSON-RPC and OAuth stay on `POST`: unauthenticated POST returns 401 with `WWW-Authenticate`.
- Raw connection tokens are encrypted with `CREED_ENCRYPTION_SECRET`; hashes are used for lookup.

## Product state and persistence

`CreedState` lives in `packages/creed-core/creed-data.ts`. `CreedProvider` in `packages/creed-app/components/creed/creed-provider.tsx` owns client state and sync. Personal onboarding persists the seed with `POST /api/app/claim` from `packages/creed-app`; Open and Cloud re-export that route. The handler calls `apply_creed_onboarding_action` with `replace-placeholder`. Open installation-owner claim remains `POST /api/open/claim` and is a different step.

Supabase is required for Open and Cloud. Each edition owns an independent forward-only migration history under `apps/<edition>/supabase/migrations/`. Cloud deploys its verified history through the Supabase GitHub integration. Open's installer previews and applies the Open-only history to each self-hosted project. RLS remains the data boundary even though Open currently has one owner.

Quality analysis is a durable server-owned lifecycle. `/api/app/ai/quality` creates a private `creed_quality_runs` row, deduplicated by Creed and request fingerprint, and schedules execution with Next.js `after()` inside the route's five-minute duration. Runs for one Creed execute in creation order so an older snapshot cannot overwrite a newer report. Clients poll the authenticated status endpoint, reload only the committed `creed_quality_reports` baseline after completion, announce runs across tabs with `BroadcastChannel`, and retain focus, visibility, and bounded interval revalidation as recovery paths. Queued work resumes on observation, stale running work is requeued, failed report persistence fails the run, and terminal runs erase their stored section snapshot.

Open supports Personal Creeds only. Cloud retains Personal and Shared Creeds while it is developed privately.
Cloud Shared onboarding remains client-side until the owner finishes or skips. It creates, seeds, and completes the Shared Creed immediately before paid entry or checkout, so abandoning the questionnaire does not leave an active placeholder Creed. Bonus-credit UI follows the owner's real subscription allowance and stays hidden for private-development access without an entitlement.

## Edition-specific interface

Shared UI reads semantic capabilities from `EditionConfig`, never an edition name:

- `hostedAccounts`
- `managedCredits`
- `managedBilling`
- `sharedCreeds`
- `cli`
- `feedback`

Open uses a sidebar theme button where Cloud uses the account menu. New Creed keeps its dialog and lets the owner choose a name and picture, but Open does not show a Personal/Shared selector. Open save status uses the shared save-state logic with `Saved to database` in the connection green; transient local drafts still say `Saved locally`. Cloud says `Synced to cloud`.

The CLI card remains visible but disabled in both editions. Its action is `View roadmap`. The reusable agent-card attribution and status UI remains in the shared application for the future CLI rebuild.

## Public surface

The public marketing site is shared, but calls to action resolve through the edition adapter. Open uses `View on GitHub` and never exposes signup. Cloud can retain hosted account flows in development. Documentation is an independent static application at `docs.creed.md`; Open and Cloud link to it and do not own a `/docs` route.

## Open installation

Open installation tooling belongs to `packages/creed-open/scripts/`, not the shared application package. The repository pins the Supabase CLI used by the installer.

- `npm run setup` owns interactive environment collection, secret generation, Supabase linking, migration preview and confirmation, and final verification.
- `npm run doctor` is non-mutating and checks prerequisites, configuration, Supabase connectivity, and the required schema version.
- The installer preserves unrelated environment lines and never prints generated owner or encryption secrets. Key collection uses ordinary terminal prompts so paste works. Git is not a setup prerequisite.
- The browser claim screen groups readiness into Environment, Database, and Owner access. Raw environment names remain available only as technical details.
- Setup remains hosting-platform neutral. Vercel and future Railway or Docker presets must configure the same Open application rather than fork it.
- Supabase remains the sole v1 persistence implementation. Hosting portability does not imply database portability.

## Verification

Before release, run from the repository root:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

When Cloud migrations change, run `npm run db:reset --workspace creed-cloud` against local Supabase and confirm `npm run db:migrations --workspace creed-cloud` matches production before merging. When Open migrations change, run `supabase db reset` from `apps/open/`. Verify both route manifests and confirm the Open server trace contains no `@creed/cloud` or Stripe modules.
