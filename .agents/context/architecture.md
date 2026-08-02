# Creed Architecture

This file is about current implementation truth, not aspiration.

## Repository layout

The repository is an npm workspace monorepo with one root lockfile:

- `apps/creed/` owns the main product, marketing site, API, MCP server, and
  Supabase migrations deployed to `creed.md`.
- `apps/status/` owns the independent status application deployed to
  `status.creed.md`.
- `packages/creed-cli/` owns the published terminal client.

Unless stated otherwise, main application paths in this file are relative to
`apps/creed/`. Root commands run checks across every workspace.

## Stack

- **Next.js 16** (App Router, Turbopack dev)
- **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4** + shadcn/ui
- **Tiptap** for rich-text editing (lowlight for code highlight)
- **Recharts** (+ a shadcn `components/ui/chart.tsx` wrapper) for the MCP
  health dashboard on `/connections`
- **Framer Motion** (also imported as `motion/react` - both packages
  are present, convention is unstable across the codebase)
- **Sonner** for toast notifications (themed via `components/ui/toaster.tsx`)
- **Supabase** for auth, Postgres, RLS, audit logs
- **Stripe** for subscription + lifetime billing (Personal / Company tiers; see `product.md` Pricing)
- **OpenRouter** for BYOK AI (quality analysis + model catalog)
- **GitHub OAuth** for the manual version-control layer

## Routes

```
apps/creed/app/
├── layout.tsx              # root layout, static (holds no user state)
├── page.tsx                # `/` - auth + redirect to /file or /onboarding
├── (creed-app)/            # signed-in product shell
│   ├── layout.tsx          # AppShellLayout wrapper
│   ├── file/page.tsx       # /file - the editor
│   ├── connections/page.tsx
│   └── settings/page.tsx
├── home/page.tsx           # /home - public landing
├── onboarding/page.tsx     # 9-step onboarding (gated: signed-in + paid)
├── docs/page.tsx           # /docs
├── pricing/page.tsx
├── privacy/page.tsx
├── terms/page.tsx
├── stack/page.tsx
├── payment/
│   ├── success/page.tsx    # Stripe redirect target
│   └── cancelled/page.tsx
├── auth/callback/route.ts  # OAuth (Google sign-in) callback
├── mcp/route.ts            # MCP protocol endpoint (OAuth-only)
├── .well-known/            # oauth-protected-resource + oauth-authorization-server
├── authorize/             # consent page (page.tsx) + decision/route.ts
├── register/route.ts       # OAuth Dynamic Client Registration
├── token/route.ts          # OAuth token + refresh endpoint
└── api/
    ├── app/                # session-authed user APIs
    │   ├── account/        # delete account
    │   ├── ai/             # quality, settings, usage, panel, agent, tab
    │   ├── claim/          # finalise onboarding
    │   ├── github/         # repo, branches, push, pull, status
    │   ├── mcp/health/     # GET - aggregated MCP health for the dashboard
    │   ├── onboarding/compose/  # POST - parse the assistant-composed markdown onto the seed
    │   ├── profile/
    │   └── state/          # full state read for client polling
    ├── auth/signout/
    ├── creed/              # token-authed agent APIs
    │   ├── route.ts        # GET - agent read payload (Bearer only)
    │   ├── proposals/      # POST - agent proposes
    │   └── write/          # POST - direct-edit (when allowed)
    ├── stripe/             # checkout, status, webhook
    ├── feedback/           # forwards to median.sh
    ├── github/stars/       # GET - cached public GitHub star count (navbar)
    └── health/             # /api/health (edge runtime)
```

The proxy at the main app root (`apps/creed/proxy.ts`, the new Next 16 name for
middleware) sets two request headers:
- `x-request-id` - for log correlation
- `x-pathname` - so server components can branch on route

It also **refreshes the Supabase session** on non-marketing routes
(`createServerClient` + `getUser()`, the required `@supabase/ssr` middleware
pattern): Server Components can read cookies but can't reliably write them, so
this is the only place an expired access token gets refreshed and the new
cookie written back. Without it, server renders intermittently see a stale
session (login loops, the `/pricing` bounce, seed/empty state until a manual
refresh). It writes the refreshed cookie to both the request (so this same
render sees it) and the response (so the browser does). Marketing routes are
skipped via the shared `lib/marketing-routes.ts` list to keep them fast. (The
root layout no longer reads `x-pathname` - it does no user-state fan-out at
all now; see State model.)

## Auth pages (`/login`, `/signup`)

User-facing sign-in / create-account, distinct from the OAuth plumbing in
`/auth/callback` and `/authorize`. Both routes render one shared
`components/auth/auth-screen.tsx` (`<AuthScreen mode="login" | "signup">`):
a split screen with the branded form column (Google + X providers,
email/password, remember-me / forgot on login, a required terms checkbox on
signup) and a full-bleed scenery image panel on the right (theme-paired
`light-auth` / `dark-auth`, faded into the form column's edge like the hero).
Google + X go through Supabase
OAuth via `components/auth/use-oauth-sign-in.ts` (`useOAuthSignIn`, provider
`google | x` - `x` is Supabase's X / Twitter OAuth 2.0 provider, not the legacy
`twitter`; a linked identity may still report `twitter`, so settings matches
both - also used by `GoogleSignInButton`); email/password uses
`signInWithPassword` / `signUp` directly. Signup handles both project configs:
a session means confirmation is off (lands in the app), otherwise it shows a
"check your inbox" state (`emailRedirectTo` -> `/auth/callback`). Errors are
mapped to one clean sentence; an already-registered email is detected via the
empty-`identities` anti-enumeration response. Forgot-password is wired: "Forgot password?" calls
`resetPasswordForEmail` (redirect -> `/auth/callback?next=/reset-password`) and
shows the same inbox-confirmation panel; the **`/reset-password`** route
(`reset-password-screen.tsx`) confirms a recovery session exists then calls
`updateUser({ password })`. The three auth screens share `auth-shell.tsx` (the
split-screen chrome + full-bleed scenery panel) and `auth-fields.tsx`
(`AuthField` / `PasswordField` with the animated eye toggle / `AuthCheckbox` /
`AuthSubmitButton` with the animated arrow). Branded HTML for the confirm-signup
and reset-password emails lives in `supabase/email-templates/` (paste into the
Supabase dashboard; keep `{{ .ConfirmationURL }}` so the PKCE code still routes
through `/auth/callback`). The "Remember me" checkbox is currently cosmetic -
an earlier functional version used a custom `@supabase/ssr` cookie adapter +
`tokens-only` encoding that broke the PKCE/session cookie round-trip (the
callback's code exchange failed and bounced users to `/login`), so the cookie
layer was reverted to the standard `@supabase/ssr` setup (`lib/supabase/
browser.ts` + `server.ts`, default cookie handling). Don't reintroduce a custom
cookie adapter or `tokens-only` without thorough cross-browser OAuth testing.
The marketing chrome's signed-out CTAs link here (Login -> `/login`, Get
Started -> `/signup`). Both routes are in the layout's `MARKETING_PREFIXES`
skip list.

Settings -> Integrations shows **Google + X** as login identities, driven live
by `supabase.auth.getUserIdentities()` (not the seeded `integrations` map):
Connect via `linkIdentity`, Disconnect via `unlinkIdentity`, with a guard that
blocks unlinking the last sign-in method (`google | twitter | email`). A user
can link both. GitHub stays a separate `creed_integrations`-backed row. The
connect / disconnect buttons are shared (`ConnectButton` / `DisconnectButton`
in `settings-screen.tsx`).

## Main app files

```
app/                       Routes
components/
├── creed/                 product UI (editor, sidebars, settings, dialogs)
├── marketing/             public site UI
├── auth/                  sign-in / landing-hero
└── ui/                    shadcn primitives + animated icons
├── creed/                 product UI; includes mcp-health-dashboard.tsx
│                          (the /connections dashboard) and rounded-bar.tsx
│                          (shared recharts bar shape)
├── ui/                    shadcn primitives + animated icons + chart.tsx
│                          (shadcn recharts wrapper)
lib/
├── creed-data.ts          types, section IDs, accent maps, agent-contract prose, seed
├── creed-backend.ts       Supabase reads / writes (state, tokens, MCP, GitHub, version control)
├── creed-backend-errors.ts
├── creed-markdown.ts      markdown ↔ section parser
├── rich-text.ts           Tiptap content normalization
├── mcp-health.ts          MCP health dashboard aggregation (loadMcpHealth)
├── ai/                    OpenRouter, model catalog, quality, runner, persistence
├── onboarding/            compile.ts - deterministic onboarding draft (no AI)
├── supabase/              browser + server clients, env helpers
├── secret-crypto.ts       AES-256-GCM for token storage
├── audit-log.ts           creed_audit_events writer
├── rate-limit.ts          local fast-path + shared Postgres rate limits
├── observability.ts       structured log helpers
├── api-auth.ts            requireApiAuth helper
├── branding.ts            env-driven contact / social URLs
└── ...
supabase/migrations/       SQL migrations (canonical)
../../.agents/context/     versioned durable agent context at repository root
public/                    static assets (landing + agent icons)
```

## Creed Bench

`/bench` is the public Creed tool-use benchmark. Its implementation lives under
`apps/creed/bench/` and is deliberately separate from user state:

- `tool-contract.ts` mirrors the production MCP tool names and schemas; a test
  fails if the production route adds or removes a tool without benchmark
  coverage.
- `tasks.ts` defines 24 versioned, synthetic episodes covering single-tool,
  multi-tool, policy, restraint, maintenance, and recovery behavior.
- `simulator.ts` resets an in-memory Creed before every trial and implements
  direct, proposal-only, hidden, and read-only behavior without touching
  Supabase or real user profiles.
- `runner.ts` performs a real OpenRouter tool-call loop. `grader.ts` verifies
  outcomes and only requires a specific call path where the product contract
  makes that path meaningful.
- `artifacts.ts` retains full traces, state, costs, verifier output, model route,
  benchmark version, and runner SHA. Development runs go to gitignored
  `bench/runs/`; only complete official runs can enter `bench/results/` and
  `bench/generated/chart-data.json`. The public chart is scoped to the active
  `BENCHMARK_VERSION`. Official runs require a clean worktree, checkpoint after
  each trial, and resume with `--resume`. Provider 429/5xx responses retry with
  backoff. `bench:regrade` rewrites retained traces through the current grader.

The headline public metric is pass@1. Pass^3 measures three-run consistency,
and the graph uses average cost per task attempt. Diagnostic dimensions explain
failure modes but do not replace the binary task outcome.

## State model

There is one client-side state shape - `CreedState` in `lib/creed-data.ts`.
`<CreedProvider>` (in `components/creed/creed-provider.tsx`) wraps the
signed-in app, exposes ~30 methods, and persists via `/api/app/state`.

**The root layout is static.** `app/layout.tsx` holds no user state, reads no
cookies/headers, renders no provider, and is NOT `force-dynamic`. That is
deliberate: it lets the marketing pages prerender as a static shell (build
output shows them as `○`), so `<Link>` fully prefetches them and navigation is
instant with no server round-trip or blank flash. **Don't move the user-state
load or `CreedProvider` back into the root layout** - that re-forces every page
dynamic and reintroduces the marketing-nav flash.

The dynamic, user-specific boundary lives in
`components/creed/authed-providers.tsx` (`<AuthedProviders>`), a server
component that runs `loadCreedState(supabase, user)` - a fan-out of parallel
Supabase queries (sections, proposals, activity, connections, MCP clients,
GitHub integration, version control, token row), deduped per request via
React's `cache()` - and wraps its children in `<CreedProvider>`. It is pulled
in only by the two layouts that render user data: `(creed-app)/layout.tsx`
(the app shell, behind the entitlement gate) and `app/onboarding/layout.tsx`.
Both carry `export const dynamic = "force-dynamic"`. So the fan-out cost is
paid only on routes that show user state, and everything else (marketing,
auth, the `/` redirect) stays static or cheaply dynamic on its own terms.

The save indicator is derived state on `CreedState`: `lastSavedAt`
(epoch ms, seeded on load from the most recent section edit) plus a `saving`
flag (replacing the old `syncLabel` string). The header shows a relative
"Saved Xm ago" that ages, and "Saving…" only while a write is actually in
flight; a failed save surfaces a sonner toast.

The provider polls `/api/app/state` every 30 s for external sync (e.g.
agent-driven proposals arriving). It also flushes pending state on
visibility change + beforeunload. This poll is the main Vercel-cost lever at
scale; Realtime would replace it.

The persistent shell explicitly uses `<Link prefetch={true}>` for `/file`,
`/connections`, and `/settings`. These routes are dynamic, so the default
prefetch mode only warms their `loading.tsx` boundary; full prefetch keeps the
page payloads in Next's client router cache and prevents repeated skeletons
during normal in-app navigation. Keep the authenticated response headers
`private, no-store`: the router cache is private browser memory and is separate
from shared HTTP or CDN caching.

## Persistence model

Sections persist via `lib/creed-backend.ts:persistCreedState`. Each
section has a `revision` column intended for optimistic concurrency,
but the section upsert currently doesn't enforce `baseRevision`. Proposals do carry
`baseRevision` for diff-against-section-at-time-of-proposal logic.

Token secrets (`creed_tokens`, `creed_integrations`, and the OAuth
`oauth_tokens` / `oauth_authorization_codes`) are stored
AES-256-GCM-encrypted with `CREED_ENCRYPTION_SECRET`, with a SHA-256
hash column for lookup. On `creed_tokens`/`creed_integrations` the legacy
plaintext columns hold ciphertext, never cleartext. `resolveSecret`
reads only `encrypted_*` and self-heals on decrypt failure (treats it as
"needs regeneration", upgrade-on-read path generates fresh tokens).
OAuth tokens are opaque and resolved by hash (`lib/oauth.ts`).

Proposals are stored in `creed_proposals`. Activity is stored in
`creed_activity`. Both are keyed by `creed_id`; personal proposal writers
must resolve the user's personal Creed and stamp `creed_id` on proposals
and paired activity rows before insert/upsert. Both are loaded with the
user's full state on every authed page render.

For pending activity rows, `before_text` is snapshotted at proposal-
creation time. If a row is missing it (legacy data), the loader
backfills from the section's current content - see
`hydrateActivityEntries` in `lib/creed-backend.ts`.

## Section model

Every section is `kind: "rich-text"` under the unified model. There is
legacy compat code for chips / rules / decisions / focus payloads
(used by older imports and the markdown parser); see
`legacyPayloadToRichTextContent` in `creed-data.ts`.

The 10 canonical section IDs (`*_SECTION_ID` constants in
`creed-data.ts`):

```
identity, beliefs, goals, work, preferences,
constraints, people, health, routines, context
```

Plus two legacy IDs that may persist in older user data:
`operating-principles`, `current-focus` (mapped via
`normalizeLegacySectionId`). All are agent-writable.

## Agent connection contract

When an agent reads `/api/creed` (with `Authorization: Bearer <read>`
header - query-string token was removed for log-leak reasons):

1. Token is verified by hash (`lib/secret-crypto.ts`).
2. Server returns:
   - the visible Markdown payload
   - the user's section list
   - the agent contract (proposal target sections, judgment rules,
     proposal endpoint URL + JSON shape)
   - the direct-edit policy (proposals_only or direct_edit, depending
     on the user's `requireApproval` setting)

When an agent proposes (`POST /api/creed/proposals`):

1. Token verified by hash.
2. Body validated (Zod-like manual validation in the route).
3. Proposal row inserted with `status: "pending"`.
4. Activity row inserted with `before_text = section.content` snapshot.
5. Rate-limited via `creed_rate_limits`.

When an agent direct-edits (`POST /api/creed/write`):

1. Same flow but with the direct-edit token, requires
   `requireApproval: false`, applies the patch immediately, and creates
   an activity row with `actorType: "agent"`.

## MCP (OAuth 2.1)

`app/mcp/route.ts` implements the MCP protocol over streamable HTTP. It is
**OAuth-only** - there is no static bearer token. An unauthenticated `POST`
returns `401` with a `WWW-Authenticate: Bearer resource_metadata="..."` header
pointing at `/.well-known/oauth-protected-resource`, which triggers a
spec-compliant client's discovery + browser consent ("click Allow") flow.

Creed is its own minimal OAuth 2.1 authorization server (opaque tokens, hand
-rolled, no new deps; logic in `lib/oauth.ts`):
- `/.well-known/oauth-protected-resource` (RFC 9728) and
  `/.well-known/oauth-authorization-server` (RFC 8414) - discovery metadata.
- `/register` - Dynamic Client Registration (RFC 7591), public clients, no
  pre-shared id.
- `/authorize` - the Creed-branded consent page (server component reusing
  `CreedWordmark` / `IntegrationGlyph` + `getAgentIconKind` from
  `lib/agent-icon.ts`); `/authorize/decision` issues a PKCE-bound, single-use,
  60s auth code and redirects back. Requires a signed-in, paid user; it is not
  gated on an existing Creed, so an agent can connect mid-onboarding.
- `/token` - `authorization_code` + `refresh_token` grants (PKCE S256
  required, refresh rotation). Access 1h, refresh 30d.

Tokens are stored in `oauth_tokens` (hash + ciphertext, `revoked_at`), resolved
to a user by `findOAuthAccessToken`. The grant is single ("Allow"); scope is
`read propose`, plus `direct_edit` only when the user's `requireApproval` is
off at grant time (and direct edits are re-checked live per call).

Tools: `read_creed`, `list_sections`, `get_write_policy`,
`propose_creed_update`, `direct_edit_creed` (hidden from `tools/list` when
approval is on), and the flat `creed_*` mutation + read tools, plus a
`creed://profile` resource and `introduce-me` / `tighten-my-creed` prompts.
The flat `creed_*` tools are the canonical agent surface. The legacy
`propose_creed_update` / `direct_edit_creed` tools should behave as forgiving
adapters: resolve section names to ids, infer missing section names, recover
top-level rich-text content, and safely file proposals when a direct-edit call
targets a propose-only section.
`initialize` returns
an `instructions` field carrying the read-before-work / propose-narrowly
contract so connected agents behave correctly without a pasted prompt. The
`/api/creed/*` HTTP API (hashed read/proposal/direct-edit tokens) remains as the
documented non-MCP fallback and is what MCP writes proxy through internally.
Connecting an agent is a paid feature: the consent page (`/authorize`) and the
grant route both require a paid entitlement. Onboarding does not use MCP - the
initial Creed is composed by copy-paste (see `/api/app/onboarding/compose`).

### Creed CLI

`packages/creed-cli/` is the independently publishable `creed-cli` npm package.
It is an MCP client rather than another API implementation: the interactive
terminal and scriptable commands both derive tools, resources, prompts,
descriptions, and input schemas from the live MCP server. Do not add a copied
tool registry to the CLI. OAuth uses the same DCR + PKCE browser consent flow,
with an ephemeral loopback callback. `/revoke` implements token-specific RFC
7009 revocation and is advertised in authorization-server metadata. The client
name `Creed CLI` resolves to the existing `cli` agent identity rather than the
broad Codex alias.

The connections UI verifies global and per-agent CLI state through
`/api/app/mcp/cli-status`, scoped by the active `creedId`. A connection
requires an unrevoked OAuth token whose
refresh lifetime is still valid and an `oauth_token_creeds` grant for that
Creed. The historical `creed_mcp_clients` roster is consulted only for an
active OAuth registration literally named `MCP Client`, where JSON-RPC
`clientInfo` is the only available brand identity. CLI RFC 7009 revocation also
removes the canonical `cli` roster row.

Per-agent CLI attribution is explicit and token-bound. Commands copied from an
agent card include `--agent <id>`, and the CLI sends `X-Creed-CLI-Agent` on each
MCP request. `/mcp` accepts only exact supported IDs and records roster ids as
`cli-<oauth-token-id>-<agent-id>`. `/api/app/mcp/cli-status` intersects those
rows with unrevoked, unexpired tokens granted to the active Creed, so one CLI
login never marks every agent connected and stale rows cannot revive after a
token expires or is revoked.

## MCP health dashboard

`/connections` renders an `<McpHealthDashboard>` under the Creed MCP
card. It excludes the first-party CLI identity and CLI activity, which belong
to the separate CLI setup mode. It does **not** ride the `loadCreedState` fan-out - it fetches
`/api/app/mcp/health?range=7d|30d|90d` client-side (same pattern as the
AI usage card), so the per-page hot path stays lean. Aggregation lives
in `lib/mcp-health.ts:loadMcpHealth`, which folds three sources into one
`McpHealthSummary`: the daily read rollup (`creed_mcp_read_events`), the
agent roster (`creed_mcp_clients`), and agent-authored `creed_activity`.
Activity rows are matched back to an agent by display name (they store a
name, not a client id). Charts use the recharts + `components/ui/chart.tsx`
wrapper; section coverage is colored by the canonical section accents.

## GitHub version control

Manual push / pull only - never autosync. The user picks a repo +
branch in `/settings`, then can push their `creed.md` to that repo
or pull updates from it.

Implementation across:
- `app/api/app/github/*` routes
- `lib/creed-backend.ts` GitHub integration helpers
- `components/creed/file-screen.tsx` Push / Pull dialogs

GitHub OAuth flow uses Supabase identity-link (not a separate auth
session). The token is stored encrypted on `creed_integrations`.
Disconnecting keeps the row (status flips to `"disconnected"`) and
preserves the `creed_version_control` row so the saved repo/branch
auto-selects on reconnect.

There are three integration states: `"connected"`, `"disconnected"`
(was connected, user unlinked), and `"not-connected"` (never linked).
The settings UI renders distinct red / grey pills for the latter two.

## Auth session cookies

Both Supabase clients (`lib/supabase/browser.ts`, `lib/supabase/server.ts`)
use the **standard** `@supabase/ssr` cookie handling (browser: default
`createBrowserClient`; server: Next `cookies()` get/set). This is deliberate:
an earlier attempt at a custom cookie adapter + `cookies.encode: "tokens-only"`
broke the PKCE code-verifier / session cookie round-trip, so OAuth and email
sign-in failed in the callback and bounced users to `/login`. Keep it standard.
The only cookie-size pressure (HTTP 431 when many identities are linked) showed
up in **dev** against Node's 16KB header limit, which the dev/start scripts'
`--max-http-header-size=65536` already covers; production header limits are
higher, so `tokens-only` is not needed.

## OpenRouter and AI credits

User adds their OpenRouter key in `/settings`. We encrypt it with
`CREED_ENCRYPTION_SECRET` (AES-256-GCM, see
`lib/secret-crypto.ts`).

Platform-funded calls reserve a conservative maximum from the Creed-scoped
two-bucket wallet before contacting OpenRouter. The reservation RPC row-locks
the wallet, so concurrent calls cannot all pass one stale balance check. A
successful call settles to its actual marked-up cost and refunds the unused
reservation; failed streaming calls cancel it, with stale reservations reclaimed
after ten minutes as a final safety net. BYOK calls bypass the wallet entirely.

AI features (onboarding uses none of them - the initial Creed is composed by
the user's own assistant off a copy-paste prompt, then pasted back in):
1. **Quality analysis** - `lib/ai/quality.ts` scores the file on a
   strict rubric (`lib/ai/quality-rubric.ts` v5 - personal-profile).
2. **Tab autocomplete** - explicit-invoke ghost text in the section editor.
   `components/creed/extensions/tab-complete.ts` holds the ghost as plugin
   state + decorations (never document content); `app/api/app/ai/tab/route.ts`
   streams one small completion (text/plain) built by `lib/ai/tab.ts`, which
   sends the whole file as a stable prompt prefix (cache-friendly) and the
   caret split as the dynamic tail. Billed after the stream as feature "tab";
   one press = one metered generation, accept/dismiss are free.
3. **Model catalog** - `lib/ai/model-catalog.ts` pulls the live
   OpenRouter list and tier-scores it via regex + provider fallback so
   any new model gets a coloured dot automatically.

Quality analysis is built for cost + consistency:
- **One whole-file pass is the single source of truth.** Every analysis
  sends the full profile for context but only (re)scores the sections
  that drifted since the last run (or the explicit `targetSectionIds`);
  unchanged sections carry their prior score forward. A section refresh
  is just a whole-file pass with one target, so it never diverges from a
  full pass. There is no separate section-scope persist path.
- **Deterministic where it can be.** `temperature: 0` + a strict
  `response_format` json_schema (`buildQualityResponseFormat`) so the
  reply can't drop a section, truncate, or drift shape. The model picks a
  band then a number (band-then-number); the score is clamped into that
  band server-side.
- **The overall score is computed, not asked.** `computeOverallScore`
  weights the five core sections double, caps the overall at the weakest
  core +12, and at 74 when a core section is near-empty. The model only
  supplies the overall's qualitative prose. So the headline can never
  drift from its sections.
- A targets-empty pass (nothing drifted) recomputes the overall and
  returns without a model call or a charge.

Quality runs are deduplicated and survive navigation via
`lib/ai/quality-runner.ts` (module-level promise registry +
`useSyncExternalStore`).

Estimated AI spend renders in `/settings` as a recharts bar chart
(stacked by model quality) in `UsageCard`, not the old CSS bars.
`AiUsageRange` is `7d | 30d | 90d` (was `24h/7d/30d/1y`); the type lives
in both `lib/ai/persistence.ts` and `components/creed/settings-preload.ts`
and is read by `GET /api/app/ai/usage`. `getRangeStart` maps the range to
a UTC start date.

## Charts (recharts)

`recharts` is a dependency. `components/ui/chart.tsx` is the shadcn
wrapper (`ChartContainer` injects `--color-<key>` CSS vars from a
`ChartConfig`; `ChartTooltip` / `ChartTooltipContent` give the themed
tooltip). `components/creed/rounded-bar.tsx` exports `RoundedTopBar`, a
bar shape whose top radius scales with bar width (capped) so corners stay
consistent and never become a pill. Conventions used across the MCP
health dashboard and the AI-spend chart: bars (not areas) for bursty
per-day counts, skip days with no data, hidden axes with an explicit
y-domain headroom computed from the max stacked daily total, and a
`cache: "no-store"` client fetch off the `loadCreedState` hot path.

## Routing rules to remember

- `/` redirects to `/file` if the user has a persisted Creed, or
  `/onboarding` if they don't, or `/home` if they're signed out.
- `/home` is the public landing. Always reachable.
- The page-views (privacy, terms, pricing, stack, docs, examples, context) all share the
  same `MarketingHeader` + `MarketingFooter` chrome.
- App routes (`(creed-app)`) share `AppShellLayout` with the persistent
  left rail.

## SEO / AEO surface

- **Canonical landing is `/home`.** The root `/` only redirects (signed-out
  -> `/home`), so it is absent from the sitemap and carries no metadata.
  Every marketing page sets `alternates.canonical` to itself.
- **Title template.** Root metadata (`app/layout.tsx`) uses `title.default`
  (the brand title) + `title.template` (`%s | Creed`). Marketing pages set a
  bare `title` ("Pricing") and inherit the suffix; use `title: { absolute }`
  to opt out. `/home` has no title and inherits the strong default.
- **Structured data (JSON-LD)** builders live in `lib/seo/structured-data.ts`
  and render through `<JsonLd>` (`components/marketing/json-ld.tsx`, which
  escapes `<` so the script tag can't close early). `/home` ships an `@graph`
  of Organization + WebSite + SoftwareApplication + FAQPage; `/context`
  ships WebPage + BreadcrumbList + FAQPage. All data is first-party constants
  resolved against `getSiteUrl()`.
- **Shared FAQ source.** `lib/marketing/faq.ts` exports `homeFaqItems` and
  `contextFileFaqItems`, consumed by both the visible FAQ and the FAQPage
  schema so the two can't drift (the match search/answer engines check for).
- **`/context`** is the AEO explainer ("What is a personal context
  file?"): direct Q&A prose for answer-engine citation. It is a marketing
  route (listed in `MARKETING_PREFIXES`, the sitemap, and the footer
  Resources column) and reuses the stack-page chrome.
- **`app/llms.txt/route.ts`** serves a plain-text map of the most citable
  pages for AI crawlers (`force-static`, built from `getSiteUrl()`).
- **On-page depth.** `/context` is the crawlable, quotable definition page
  that answers "what is a personal context file" for search and AI engines;
  the footer Resources column links to it. (An earlier homepage definition
  block, `ContextDefinitionSection` in `below-hero-sections.tsx`, was removed;
  `/context` now owns that prose.)
- `robots.ts` / `sitemap.ts` keep their intent (index marketing only); the
  sitemap excludes redirecting and removed routes.
- **Sidebar accordion limit.** The `/docs` "On this page" sidebar opens one
  group at a time via `useOpenSections`
  (`components/marketing/use-open-sections.ts`, `maxOpen = 1`): opening another
  closes the one open before it, so the nav stays compact. The first group
  starts open.

## Database schema

Migrations are canonical (`supabase/migrations/`). Key tables:

- `creed_sections` - per-section payload, revision, position
- `creed_proposals` - pending agent proposals
- `creed_activity` - accepted / rejected / pending activity entries
- `creed_connections` - per-agent connection state
- `creed_tokens` - read / proposal / direct-edit tokens (hashed +
  encrypted)
- `oauth_clients` + `oauth_authorization_codes` + `oauth_tokens` - the MCP
  OAuth authorization server (DCR clients, PKCE codes, issued access/refresh
  tokens). `creed_mcp_credentials` (the old static MCP token) was dropped.
- `creed_mcp_clients` - per-agent MCP roster; the "connected via MCP" status and
  last-seen are now derived from it (no credential row)
- `creed_mcp_read_events` - per-agent daily read rollup `(user_id,
  client_id, day, read_count)`. Incremented by the
  `increment_mcp_read()` security-definer function, called from
  `recordMcpCredentialUsage` on each named-client MCP read. Powers the
  `/connections` MCP health dashboard. Bounded growth (agents × days),
  not one row per read. `increment_mcp_read` is `EXECUTE`-granted to
  `service_role` only (a later migration revokes the PUBLIC default) so
  it can't be called over PostgREST RPC to forge another user's counts.
  `recordMcpCredentialUsage` no longer writes `created_at` on the
  `creed_mcp_clients` upsert, so first-seen survives later reads.
- `creed_integrations` + `creed_version_control` - GitHub OAuth +
  repo selection
- `creed_ai_settings` + `creed_ai_usage` + `creed_quality_reports`
- `creed_audit_log` - structured audit log
- `creed_entitlements` - Stripe one-time payment entitlements

Profile avatars:
- Personal avatars live in `auth.users.raw_user_meta_data.avatar_url` so OAuth
  provider images and manual overrides share one field.
- Company avatars live in `creeds.avatar_url`.
- Uploaded images are stored in the public `creed-avatars` Supabase Storage
  bucket and surfaced through the active state / Creed switcher list.

All tables have RLS - the user can only read / write their own rows.
Service-role queries (token-authed agent APIs + the Stripe webhook)
bypass RLS via the admin client. Rate limiting is in-memory in
`lib/rate-limit.ts`, NOT a DB table. The table name was reserved but
the code never used it.

## Branding / env vars

Shipped in `lib/branding.ts` - all four have hardcoded fallbacks to the
maintainer's handles, so a fresh clone without env vars set still
renders sensible defaults. Forks override via env:
- `NEXT_PUBLIC_CONTACT_EMAIL` (footer + privacy + terms + feedback)
- `NEXT_PUBLIC_TWITTER_URL` (footer X icon)
- `NEXT_PUBLIC_INSTAGRAM_URL` (footer IG icon)
- `NEXT_PUBLIC_GITHUB_URL` (footer GitHub icon + pricing card)

Required server-only:
- `NEXT_PUBLIC_SITE_URL` - `getSiteUrl()` throws in production if unset.
  No hardcoded `creed.md` fallback in source; forks must set this.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` - `getSupabasePublishableKey` reads
  either)
- `SUPABASE_SECRET_KEY` (service role) - admin client throws without it
- `CREED_ENCRYPTION_SECRET` (32 bytes base64) - `loadCreedState` throws
  without it for any fresh sign-in
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` -
  required for the checkout flow; missing webhook secret silently
  no-ops the webhook (with a logged hint)

Optional:
- `CREED_CSP_ENFORCE=1` (flip to enforce CSP in production; ships in
  Report-Only by default)
- `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` - required
  only if you want GitHub token refresh
- `MEDIAN_API_KEY` - required only for the in-app feedback widget
- `NEXT_PUBLIC_RELEASE_SHA` - surfaced in the system-status pill

See `README.md` + `apps/creed/.env.example` for full setup.

## Company plan

The Company plan introduces a Creed/workspace entity between users and content.
Summary of current truth:

- A `creeds` table (`type` personal | company) with `creed_members` (owner /
  admin / member, one owner per Creed enforced by a partial unique index). Every
  existing user was backfilled a personal Creed. Core content is keyed by
  `(creed_id, section_id)` and `creed_id` is the canonical workspace identity;
  `user_id` remains actor or compatibility metadata where needed.
- Company-only tables: `creed_member_section_permissions` (per-member per-section
  override, reusing the `hidden | read-only | propose | direct` vocabulary),
  `creed_invites`, `creed_section_versions`, `creed_company_billing` (keyed by
  creed_id, separate from `creed_entitlements`), `creed_company_ai_settings`,
  `oauth_token_creeds` (per-Creed MCP grant mode), `creed_seat_purchases`
  (Stripe lifetime-seat idempotency), and company GitHub/version-control rows.
- SQL helpers `creed_role(creed_id)`, `creed_type(creed_id)`,
  `creed_section_permission(creed_id, section_id)` (SECURITY DEFINER, to power
  membership RLS without recursion). TypeScript twins in
  `lib/creed-permissions.ts`; attribution strings in `lib/creed-attribution.ts`.
- New backend: `lib/creed-membership.ts`, `lib/creed-context.ts` (active-Creed
  cookie), `lib/company-billing.ts`, `lib/company-invites.ts`, `lib/email.ts`
  (Resend), `lib/onboarding/compile-company.ts`. Routes under `/api/app/creeds`
  and `/api/app/company/invites`; the `/invite/[token]` accept page.
- Company section lifecycle intentionally mirrors Personal: archive is
  reversible, delete is permanent. There is no Company-only section history UI,
  restore endpoint, trash endpoint, or 30-day retention flow. Version rows remain
  internal write attribution, not a user-facing restore feature.
- Company RLS is live on core content, OAuth grant scope, credits, and service
  tables. Lifetime seat application and ownership transfer run through
  service-role Postgres RPCs so Stripe and ownership mutations are atomic.
- MCP usage rows and connection status are recorded by Creed scope, so Personal
  and Company connections no longer collide for the same user and client id.
