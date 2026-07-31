# Creed Production Audit

Date: 2026-07-31. Scope: all first-party code (`app/`, `components/`, `lib/`, `supabase/`, `proxy.ts`, configs), plus live Supabase advisor data. Every finding below was verified against the actual code at the cited file and line. Line numbers reflect the working tree on this date and may drift as files change; the symbol names cited will not.

**How to use this document.** Each finding is self-contained: an ID, a severity, the problem with file:line evidence, why it matters, and the exact fix. Any model or engineer can pick a finding and implement it without reading the rest. Findings are grouped by domain; the execution order at the end sequences them by leverage. Severity scale: **Critical** (money or data loss possible today), **High** (major cost, lag, or risk), **Medium** (real but bounded), **Low** (hygiene).

**What is already good** (do not "fix" these): auth on all 71 API routes with no IDOR found; RLS on all 34 tables; correct Stripe signature verification and idempotent credit grants; PKCE with single-use codes and rotating refresh tokens; AES-256-GCM with fresh IVs; zero committed secrets; clean `NEXT_PUBLIC_` usage; visibility-gated polling; static marketing pages; module-scope Stripe/Supabase client caches; strict TypeScript with zero `@ts-ignore`; clean tree-shaken lucide imports; `server-only` guards on most secret-touching libs; deliberate, commented empty catches.

---

## 1. Money: unbounded spend and billing integrity

### COST-1 (Critical) AI endpoints have no rate limit and a non-atomic credit gate
**Problem:** `app/api/app/ai/agent/route.ts` (`maxDuration = 300`, `maxTokens: 16000`), `app/api/app/ai/panel/route.ts`, and `app/api/app/ai/quality/route.ts` spend real OpenRouter money per call with no rate limiting. The balance gate reads the balance and only rejects at `totalMicro <= 0` (`lib/ai/credits.ts:373-377`); the debit happens after the model call returns (`ai/agent/route.ts:208-222`). The migration comment (`supabase/migrations/20260608120000_add_creed_credits.sql:114-117`) admits the gate assumes serial usage.
**Failure scenario:** a user with 1 micro-USD fires 500 concurrent agent requests. All 500 pass the positive-balance check, all 500 run 16k-token model calls at your expense, the balance ends arbitrarily negative (`debit_credits` has no floor), and you also pay 500 x up-to-300s of Vercel compute. On a company creed any single member can drain the pooled allowance the same way.
**Fix:** (1) Rate limit all three routes per `auth.user.id` with the shared limiter from COST-2 (suggested: 10/min agent and panel, 3/min quality). (2) Replace check-then-spend with reserve-then-settle: debit a conservative maximum before the model call, reject if the RPC returns a negative post-debit balance (refunding the reservation), then credit back `reserved - actual` after the call completes.

### COST-2 (High) In-memory rate limiter is a no-op on serverless
**Problem:** `lib/rate-limit.ts:10` stores buckets in a module-level `Map`. On Vercel each concurrent invocation can be a fresh isolate, so N parallel requests land on up to N empty buckets: every limit multiplies by instance count and resets on each cold start or deploy. Only 8 of 71 routes use it at all (`/register`, `/token`, `/revoke`, `/mcp`, `api/creed`, `api/creed/write`, `api/creed/proposals`, `ai/tab`, `onboarding/compose`).
**Fix:** back the limiter with a shared store. Lowest friction given existing deps: a Postgres `SECURITY DEFINER` RPC (`check_rate_limit(p_key, p_limit, p_window_seconds)` over a `rate_limit_hits` table with periodic cleanup), or Upstash Redis via `@upstash/ratelimit` (sliding window, keyed by token hash or user id). Keep the in-memory limiter as a cheap first pass. Then extend coverage to the routes in COST-3.

### COST-3 (Medium) Cost-bearing authenticated endpoints have no limiter at all
**Problem:** no rate limit on `api/feedback` (third-party API proxy), `api/app/profile/avatar` (3MB upload per call, `upsert: false` so every call creates a new storage object that is never deleted), `api/app/state` PUT, `api/app/github/push` and `pull/apply` (GitHub quota), `api/app/company/invites` POST (sends Resend email).
**Fix:** apply the shared limiter per user id; for avatars, delete the previous object on upload and add a per-user quota.

### COST-4 (Medium) Missing Stripe webhook secret silently acknowledges and permanently drops events
**Problem:** `app/api/stripe/webhook/route.ts:44-56` returns `200 {applied:false}` when `STRIPE_WEBHOOK_SECRET` is unset, so Stripe marks events delivered and never retries. Entitlements self-heal via the success page, but `charge.refunded` and `customer.subscription.updated/deleted` have no second path: a misconfigured deploy silently loses every refund revocation and cancellation.
**Fix:** return 503 when the secret is missing so Stripe retries, and alert on the `stripe_webhook_secret_missing` log line.

### COST-5 (Medium) Company initial credit grant failure is swallowed
**Problem:** `lib/company-billing.ts:229-239` logs a warning and continues when the $50/$200 initial grant fails; the webhook still returns 200, so there is no retry and no reconciliation path. A paying company can permanently miss its credits.
**Fix:** throw so Stripe retries (provisioning is already idempotent via unique `stripe_session_id`), or add a reconciliation job keyed on the warning log.

### COST-6 (Low) Billing races and gaps, all bounded
- Seat-capacity TOCTOU on invite accept: `lib/company-invites.ts:320-326` checks `available <= 0` then inserts; two concurrent accepts of the last seat both pass. Fix: enforce capacity inside a `SECURITY DEFINER` RPC that row-locks the billing row.
- Concurrent company provisioning can orphan a `creeds` row (`lib/company-billing.ts:117-179`). Fix: `create unique index on creeds(owner_user_id) where type = 'company'`.
- Seat purchase does a Stripe-side read-modify-write (`lib/company-billing.ts:407-418`); lost update under concurrency, reconciled later. Acceptable; document it.
- Refunded credit top-ups are never clawed back (`lib/stripe.ts:705-798` touches entitlements but not balances). Decide policy and implement in the `charge.refunded` handler.
- No Stripe client timeout: `lib/stripe.ts:42`. Fix: `new Stripe(key, { timeout: 15000, maxNetworkRetries: 2 })`.

---

## 2. Vercel and Supabase cost: invocations, duration, egress

### VC-1 (High) The `/api/app/state` sync poll is the single largest cost line item
**Problem:** the client polls `/api/app/state` every 5s on an actively edited company tab, 30s idle or personal (`components/creed/creed-provider.tsx:117-131, 1479-1559`). Each poll: 1 edge middleware invocation including a Supabase `getUser()` network refresh (`proxy.ts:63`), 1 Node function invocation doing a second `getUser()` (`lib/api-auth.ts:10-21`), then `resolveActiveCreed` plus the full state load. The company loader (`lib/creed-backend.ts:1477-1884`) runs ~15 queries per tick: a 12-way `Promise.all` including 500 proposals and 500 activity rows fetched with `select("*")` (activity rows carry full before/after HTML diffs), plus one `auth.admin.getUserById` HTTP call per member (see VC-2). The response re-ships a multi-hundred-KB JSON every 5 seconds even when nothing changed. One always-open tab is ~2,880 invocations/day; an active company tab is 720/hour.
**Fix (layered):**
1. Add a delta probe: `GET /api/app/state?since=<tick>` answered by a single indexed `max(updated_at)` query across the creed's rows, returning `{changed:false}` before any fan-out. This kills ~90% of poll cost.
2. Cap polled payloads (`proposalLimit`/`activityLimit` ~50) and exclude `before_text`/`after_text` from the poll path; serve full diffs from a detail endpoint when the activity drawer opens.
3. Raise `EXTERNAL_SYNC_INTERVAL_MS` 30s -> 120s (personal creeds already have realtime and focus refetch) and `COMPANY_IDLE_SYNC_INTERVAL_MS` 30s -> 60-120s.
4. Long term: publish MCP-write notifications on the existing Supabase realtime channel (`creed-provider.tsx:120, 619, 714-725`) and drop the fast poll entirely.

### VC-2 (High) N+1 Auth Admin `getUserById` per member on every company state load
**Problem:** `lib/creed-backend.ts:1655-1671` makes one HTTPS call to the Supabase Auth Admin API per member on every company state load, i.e. every 5s poll per viewer. Same pattern in `lib/company-invites.ts:74-76, 246`. A 10-member team with 3 active viewers is ~360 Auth API calls/minute for avatars that almost never change.
**Fix:** one `SECURITY DEFINER` RPC joining `creed_members` to `auth.users` (`get_member_profiles(p_creed_id uuid)` returning `user_id, email, raw_user_meta_data`). For `emailBelongsToMember`, a single `select 1 from auth.users u join creed_members m ... where lower(u.email) = lower($2)`.

### VC-3 (High) MCP writes make an HTTP call back into the same app
**Problem:** `app/mcp/route.ts:682-705` (`callInternalCreedRoute`) does `fetch(getSiteUrl() + "/api/creed/write" | "/api/creed/proposals")` at 11 call sites, so every personal agent write bills two serverless invocations, re-verifies the token, re-fetches the user via Auth Admin, and re-runs the full state load the MCP request already performed. It also has no timeout, and on a Vercel preview deployment with prod `NEXT_PUBLIC_SITE_URL` the write would silently go to production.
**Fix:** extract the handler bodies of `app/api/creed/write/route.ts` and `app/api/creed/proposals/route.ts` into `lib/personal-writes.ts` (`applyDirectWrite(userId, body)`, `fileProposal(userId, body)`), call them in-process from the MCP handlers passing the already-loaded state, keep the HTTP routes as thin wrappers, delete `callInternalCreedRoute`.

### VC-4 (High) `/api/app/ai/tab` runs the full state fan-out per keystroke completion
**Problem:** `app/api/app/ai/tab/route.ts:99` calls `loadActiveCreedState` and then uses only section id/name/content (lines 100-115). That is ~12 DB roundtrips plus an Auth Admin call, including 500 proposals and 500 activity rows, all discarded, added to the latency of the most frequently hit AI endpoint before the LLM call even starts.
**Fix:** query sections directly (`select('section_id, name, payload, archived_at').eq('creed_id', ...).is('deleted_at', null)`) or add a `loadSectionsOnly` helper. Check `ai/panel/route.ts:74` and `ai/agent/route.ts:77` and apply the same where only sections are needed; at minimum pass `{proposalLimit: 1, activityLimit: 1}` as `/api/creed/write` does.

### VC-5 (High) MCP handshake pays the full state load; telemetry blocks every response
**Problem:** `app/mcp/route.ts:2203-2241` runs `resolveMcpState` (full personal or company state load) and `recordMcpClientUsage` unconditionally, but `initialize`, `notifications/initialized`, `prompts/*`, and `resources/list` need no state, and `tools/list` needs only permissions. A typical client handshake is 2-3 requests, so 2-3 wasted full fan-outs per connection. `recordMcpClientUsage` (`lib/creed-backend.ts:2251-2318`) then runs 3 sequential bookkeeping writes (client upsert, read-count RPC, connection upsert) that block the response, plus a 4th (`recordCliAgentUsage`) when the CLI header is present. There are zero `waitUntil` usages in the repo.
**Fix:** inspect the request batch first and only call `resolveMcpState` for `tools/call`, `tools/list`, `resources/read` (slim permissions query for `tools/list`). Run the telemetry writes with `Promise.all` inside `waitUntil(...)` from `@vercel/functions` so they never block the response.

### VC-6 (Medium-High) Anonymous status polling on every marketing page
**Problem:** the footer status dot polls `/api/status` every 60s for every visitor including anonymous (`components/marketing/system-status.tsx:29, 154`, mounted via `site-chrome.tsx:785`). This violates the standing no-anonymous-polling rule. The response is CDN-cached (`s-maxage=60`) so origin functions amortize, but Vercel runs middleware before the cache and the proxy matcher does not exclude `/api/status`, so each poll per tab still bills an edge invocation. The interval also keeps firing while hidden (it just no-ops the fetch).
**Fix:** drop the interval; fetch once on mount plus on `visibilitychange` -> visible/focus (the focus refetch already exists at `:148-156`). Also exclude the public cached GETs from the proxy matcher (VC-8).

### VC-7 (Medium) `/api/health` performs privileged work for anonymous callers
**Problem:** `app/api/health/route.ts` is public, CORS `*`, `force-dynamic`, unlimited, and every GET and HEAD (`:50-59`) runs `admin.auth.admin.listUsers()` (`:170`) plus an exact-count query (`:131`) with the service-role key. Anyone can loop it to burn Auth API quota, DB load, and invocations for free.
**Fix:** cache the probe result in module scope for 10-15s, rate limit per IP, make HEAD return the cached verdict, and consider gating the detailed component payload behind a shared-secret header, leaving only a bare 200/503 public.

### VC-8 (Medium) `proxy.ts` runs a Supabase session refresh on every `/api/*` request
**Problem:** `isMarketingPath` does not cover `/api`, so every API call (including every poll above) constructs a Supabase server client and awaits `getUser()` (`proxy.ts:63`), a network call to Supabase Auth, and then the route handler repeats `getUser()` via `requireApiAuth`. Doubled auth traffic and added edge duration on the hottest path.
**Fix:** (1) skip the refresh when no `sb-*-auth-token` cookie exists (cheap precheck, same pattern as `app/page.tsx:33-39`); (2) extend the matcher exclusion (`proxy.ts:8`) with `api/status|api/version|api/health|api/github/stars|api/roadmap` so anonymous cacheable GETs never invoke middleware.

### VC-9 (Medium) `force-dynamic` root `/` redirect
**Problem:** `app/page.tsx:13` makes every hit on `/`, including every crawler, a Node function invocation just to `redirect("/home")` after a cookie check.
**Fix:** in `proxy.ts`, when `pathname === "/"` and no `sb-*-auth-token` cookie, return `NextResponse.redirect(new URL("/home", request.url), 307)`. The function then runs only for cookie-holders.

### VC-10 (Medium) Static asset weight: 42MB in `public/`, 7.9MB byte-identical duplicates
**Problem:** (1) All 12 files in `public/assets/popups/personal/` are byte-identical (md5-verified) to `public/assets/popups/company/`; only `company/members.*` is unique. Both copies upload per deploy and both download per user who sees both tours. (2) ~21MB of welcome-tour video is served from Vercel bandwidth, violating the house rule that video lives on an external CDN at 720p30. (3) `public/assets/eggs/marc.png` is 3.5MB and `elon.png` 1.3MB, rendered in a 24px avatar in the landing demo (`components/marketing/creed-app-demo.tsx:217-224`). (4) The 1.6-2.0MB scenery PNG masters are only the `<picture>` fallback (AVIF variants exist at 44-152KB), acceptable but worth a smaller fallback.
**Fix:** dedupe popups into `public/assets/popups/shared/` and update `welcome-dialog.tsx:381` and `welcome-video-preloader.tsx:27`; move all popup video to the external CDN with absolute URLs; re-export the five egg avatars at <=128px webp (<30KB each); optionally downscale PNG fallbacks to ~200KB.

### VC-11 (Medium) Per-screen polls hotter than they need to be
- Quality report poll: POST `/api/app/ai/quality` every 60s carrying the full sections payload (`components/creed/file-screen.tsx:1527-1564`). Fix: 180-300s cadence (the code comment says it is not latency-sensitive) and send section fingerprints instead of bodies for the `readOnly` baseline read.
- Company settings roster poll: full `refreshState()` every 15s while mounted (`components/creed/company-settings.tsx:438-452`), stacked on the provider's own 5s/30s poll. Fix: remove the interval and stamp the provider's `syncActivityRef` (or only poll while pending invites exist).

### VC-12 (Low) Small invocation leaks
- `components/marketing/use-onboarding-resume.ts:36` hits `/api/app/onboarding-status` on every marketing page mount for signed-in users with no sessionStorage cache. Fix: copy the cache pattern from `use-paid-status.ts:23-43`.
- `components/creed/connections-screen.tsx:152-160`: focus + visibilitychange both fire on tab switch with no burst dedupe, causing double invocations. Fix: add the 2s `lastCheckAt` gate used in `file-screen.tsx:1417-1423`.
- `app/api/app/billing/plans/route.ts:88-96`: sequential `getCompanyBilling` + `getCompanyCreditsState` per owned company in a for-loop. Fix: `Promise.all` over companies and over the pair.
- `app/api/github/stars/route.ts`: relies on segment `revalidate` only. Fix: add explicit `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` and avoid caching error responses at full TTL.
- `.well-known/oauth-*` discovery documents are identical for everyone. Fix: add `s-maxage`.

---

## 3. Lag: client-side performance

### PERF-1 (High) Per-keystroke network storm from the shell preload effect
**Problem:** the effect at `components/creed/shell.tsx:313-344` depends on `state.sections` (identity changes every keystroke via `creed-provider.tsx:1694-1703`). For a GitHub-connected creed each keystroke rebuilds the full markdown (`exportMarkdown()`), SHA-256 hashes it (`settings-preload.ts:299-304`), and calls `loadSettingsVersionStatus(localHash)` whose cache is keyed by the hash (`settings-preload.ts:277-297`), so every keystroke is a cache miss firing a real `GET /api/app/github/status`. It also calls `preloadMcpHealth` each time (PERF-2).
**Fix:** depend on `state.creedId`, creed type, GitHub integration status, repo identity, and a `sections.length > 0` boolean; read sections via a ref. If live warming is wanted, add a 1.5-2s trailing debounce identical to `file-screen.tsx:1365`.

### PERF-2 (High) `loadMcpHealth` never returns its cached value
**Problem:** `components/creed/mcp-health-preload.ts:88-106` dedupes only in-flight requests; once resolved, the next call always refetches (`fetch("/api/app/mcp/health")`). Siblings like `loadSettingsRepos` (`settings-preload.ts:135-137`) early-return the cached value. Combined with PERF-1, sustained typing produces a continuous stream of health requests.
**Fix:** add `if (entry.value) return Promise.resolve(entry.value);` before the promise check, and give the dashboard an explicit `force` flag to revalidate on mount.

### PERF-3 (High) Monolithic context: every keystroke re-renders all 12 `useCreed` consumers
**Problem:** the context value at `creed-provider.tsx:2827-2840` is `{ state, sectionPresence, ...stableActions }`. Actions are identity-stable (good), but `state` is one object holding sections, proposals, activity, settings, user, company, and MCP fields, so every keystroke re-renders every consumer: `FileScreen` (2,300-line render body including the per-section prop loop at `file-screen.tsx:2802-2897`), `CreedShell`, `CreedPanel` (rebuilds its `commands`/`groups`/`flatResults` memos at `panel.tsx:498-696` even while closed), `CreedFindReplace`, `GettingStartedCard`, `CreedSwitcher`, `AppShellLayout`. The `startTransition` wrapper (`rich-text-editor.tsx:1079-1084`) makes it interruptible but not cheaper.
**Fix:** split the context into a stable `CreedActionsContext` plus hot/cold value contexts (`sections`/`sectionRevisions` hot; `proposals`, `activity`, `user/settings/company/mcp` cold), or adopt a selector store via `useSyncExternalStore` over the existing `latestStateRef` so components subscribe to slices.

### PERF-4 (High) Every section mounts a live ProseMirror editor, even collapsed
**Problem:** `file-screen.tsx:3932` keeps `RichTextEditor` mounted for collapsed sections behind `className="hidden"`; each instance is a full ProseMirror `EditorView` plus 8 extensions (`rich-text-editor.tsx:928-1089`). A 25-section file constructs 25 editors on load, the dominant initial render cost of `/file`.
**Fix:** render collapsed sections as a static preview (`dangerouslySetInnerHTML` of `section.content` with prose styles; the content is canonical HTML) and mount the editor only when expanded (guard the propose-mode local draft case). For very long files, defer editor mount until the card nears the viewport via IntersectionObserver.

### PERF-5 (Medium) Redundant per-keystroke recomputation in FileScreen
- `file-screen.tsx:1098`: `localMarkdown = useMemo(() => exportMarkdown(), [state.sections])` serializes every section per keystroke; the fetch it feeds is debounced but the export is not. Fix: compute the markdown inside the debounced callback and the push/pull handlers instead.
- `file-screen.tsx:1119-1122`: the full-file quality fingerprint does a fresh `JSON.stringify` of the whole sections array per commit despite per-section WeakMap caching at `:174-182`. Fix: `state.sections.map(cachedSectionFingerprint).join("|")`.

### PERF-6 (Medium) ActivityRail renders 50 rows and computes 50 word-diffs while closed
**Problem:** `file-screen.tsx:3061-3068` always renders the rail; `FileActivityRailFrame` hides it with `width: 0` but children stay mounted (`file-presentation.tsx:275-297`). Each `ActivityRow` runs `diffWords` over section-sized strings on mount (`file-screen.tsx:4459-4463`, `inline-proposal-diff.tsx:136-140`), rows are not memoized, and the parent map (`file-screen.tsx:4366-4396`) runs `proposals.find` + `sections.find` per entry per render.
**Fix:** render `{activityOpen ? <ActivityRail/> : null}`, wrap `ActivityRow` in `memo`, compute diffs only when a row expands, and cache diff parts in a module `Map` keyed by `entry.id` (entry text is immutable).

### PERF-7 (Medium) ReviewPill re-diffs every pending proposal on every keystroke
**Problem:** `review-pill.tsx:100-119` memoizes on `[proposals]`, but the parent builds `proposals={normalizedPendingProposals.map(...)}` inline (`file-screen.tsx:2716-2730`), a new array each render, so typing next to a pending card re-runs `diffWords` for all pending proposals per keystroke.
**Fix:** hoist the mapped array into a `useMemo` keyed on stable proposal identity plus affected section contents (the `useJsonStable` pattern at `:918` exists for this), or cache diff parts by `proposal.id + existingContent`.

### PERF-8 (Medium) NexusView calls `getComputedStyle` per node per animation frame
**Problem:** `nexus-view.tsx:159-206` resolves CSS variables via `window.getComputedStyle(document.documentElement)` plus regex parsing inside `draw()` (called at `:1009-1050` for every node/edge), which runs every simulation, pan, zoom, and drag frame.
**Fix:** resolve colors once per draw-effect run into a `Map<string, string>` (they depend only on node accents and theme); invalidate on theme change.

### PERF-9 (Medium) `resolveActiveCreed` and auth run twice per app-shell request
**Problem:** `app/(creed-app)/layout.tsx` resolves the active creed for the auth gate, then `components/creed/authed-providers.tsx:28` resolves it again before loading state: duplicated Supabase roundtrips serialized before first byte. Note: React `cache()` does not dedupe across route-handler calls (the code's own comment in `lib/request-auth.ts` says so), only within one render pass.
**Fix:** resolve once in the layout and pass the result into `AuthedProviders` as a prop; inside API routes, thread the resolved `active` object into `loadCreedState`/`persistCreedState` instead of re-deriving `getPersonalCreedId` (`lib/creed-context.ts:45`, `lib/creed-membership.ts`).

### PERF-10 (Low) Smaller client costs
- Scroll tracker reads one `getBoundingClientRect` per section per rAF frame (`file-screen.tsx:2159-2208`). Fix: a single IntersectionObserver with a `rootMargin` band.
- Company sync merge stringifies sections/proposals/activity twice per 5s poll even when unchanged (`creed-provider.tsx:305-383`). Fixed for free by the VC-1 delta probe.
- `useJsonStable` stringifies tag targets and proposals per render (`file-screen.tsx:187-196`). Acceptable; revisit if proposals grow.

---

## 4. Bundle and first load

### BUNDLE-1 (High) The public landing page ships the full tiptap editor and 37 syntax grammars
**Problem:** verified static import chain with zero `next/dynamic` anywhere in the repo: `/home` -> `landing-hero-entry.tsx` -> `landing-hero.tsx:6` -> `creed-app-demo.tsx:44` -> `rich-text-editor.tsx` -> tiptap + starter-kit + 8 extensions + `createLowlight(common)` (line 76), which registers ~37 highlight.js grammars (302KB of module source; ~90-120KB gz for tiptap/ProseMirror alone). The chain also drags `diff` and app-only UI (`inline-proposal-diff`, `review-pill`, `file-quality-ui`) into the marketing chunk via `creed-app-demo.tsx:45`, `governed-demos.tsx:17`, `how-creed-works-demos.tsx:32`.
**Fix:** (1) `const CreedAppDemo = dynamic(() => import("@/components/marketing/creed-app-demo").then(m => m.CreedAppDemo), { ssr: false, loading: () => <DemoSkeleton/> })` in `landing-hero.tsx`, ideally gated on IntersectionObserver; the demo is client-only mock state so `ssr: false` costs nothing for SEO. (2) Estimated win: 150-200KB gz off `/home` first load.

### BUNDLE-2 (High) Register only the grammars the product needs
**Problem:** `rich-text-editor.tsx:18,76` imports `common` (37 grammars); `highlightAuto` at `:963` then auto-detects across all 37 per unlabeled code block (CPU cost too). A 6-language subset measures 56KB vs 302KB of grammar source.
**Fix:** `createLowlight({ javascript, typescript, bash, json, yaml, markdown })` with per-language imports from `highlight.js/lib/languages/*`; lazy-register extras on first encounter if needed. This also benefits every editor route, not just marketing.

### BUNDLE-3 (Medium) recharts statically loaded on the public `/bench` page
**Problem:** `components/marketing/creed-bench-chart.tsx:10` -> `app/bench/page.tsx:6` carries ~90-100KB gz of recharts on a public page, likely below the fold. App usages (`settings-screen.tsx:11`, `mcp-health-dashboard.tsx:18`) are route-scoped and fine. The namespace import in `components/ui/chart.tsx:7` defeats barrel optimization but still tree-shakes.
**Fix:** `next/dynamic` the `CreedBenchChart` (and optionally the settings usage chart).

### BUNDLE-4 (Medium) Both `framer-motion` and `motion` in dependencies
**Problem:** 24 files import `"framer-motion"`, 63 import `"motion/react"`. `motion` is a 74-byte re-export of framer-motion, and npm currently dedupes to one physical copy, so today's cost is ~zero. The risk is silent version drift: if the two semver ranges stop intersecting, the bundle gains a second full copy (~40-50KB gz) with no code change.
**Fix:** codemod the 24 `framer-motion` imports to `motion/react` (API-identical), remove `framer-motion` from `package.json`. Optional later win: `LazyMotion` + `m` with `domAnimation` cuts ~15-20KB gz from every marketing page.

### BUNDLE-5 (Low) Small config and dependency items
- Add `experimental: { optimizePackageImports: ["radix-ui"] }` to `next.config.ts` (the monolith is correct and tree-shakes, but is not in Next's default optimize list; this speeds dev/build).
- `npm update lucide-react` (1.7.0 -> 1.28.x, same major; imports are already clean named imports).
- Bundle analyzer is already wired (`ANALYZE=true npm run build`); run it after BUNDLE-1/2 to confirm the landing chunk drop.
- Fonts are correct (next/font, latin subset, self-hosted). Stripe server/client boundary is correct (`server-only` guards, lazy `loadStripe`).

---

## 5. Security

### SEC-1 (High) OAuth scopes are granted, displayed, and never enforced
**Problem:** `/authorize/decision:93-98` grants requested scopes, `/token` returns them, `.well-known/oauth-authorization-server:33` advertises `["read","propose","direct_edit"]`, but `resolved.scope` is never read in `app/mcp/route.ts` (verified: the only `scope` occurrences are the `WWW-Authenticate` string at `:2136` and the rate-limit bucket at `:2173`). A client that requested and displayed `scope=read` gets a token that can call `direct_edit_creed` and `delete_section`. On personal creeds every section defaults to `direct` permission (`lib/creed-permissions.ts:66`), so a nominally read-only token has full write over the user's profile. `tools/list` is also unfiltered.
**Fix:** thread `resolved.scope` into `handleRpcRequest` and `listToolsFor`; reject write tools without `propose`/`direct_edit`, reject direct-edit tools without `direct_edit`, and filter the advertised tool list by the same set.

### SEC-2 (Medium) Entitlement checked at grant time only; tokens outlive cancellation forever
**Problem:** `hasActiveEntitlement` runs once at `/authorize/decision:81`. Refresh tokens live 30 days and rotate indefinitely (`lib/oauth.ts:317-359`), and the MCP POST handler never re-checks entitlement, so a refunded or cancelled user keeps full MCP access as long as their client refreshes monthly. Company `frozen` is enforced on company writes (`company-sections.ts:1362`) but not on personal paths.
**Fix:** call `hasActiveEntitlement` in the MCP POST after token resolution (cache ~60s per user), and revoke tokens in the `charge.refunded`/`subscription.deleted` webhook handlers.

### SEC-3 (Medium) Unbounded JSON-RPC batch bypasses the rate limit
**Problem:** `app/mcp/route.ts:2199-2238` accepts an array of any length and `Promise.all`s it; the limiter charges one token per HTTP request (`:2172`). One request with 10,000 `tools/call` entries executes 10,000 handlers.
**Fix:** cap the batch (`if (requests.length > 20) return 400`) and charge the limiter `requests.length` tokens. Also wrap the `request.json()` at `:2199` in try/catch returning JSON-RPC `-32700` instead of a bare 500.

### SEC-4 (Medium) Stored HTML is never sanitized
**Problem:** `lib/rich-text.ts:353-356` stores `contentHtml` verbatim from bearer-token direct edits, MCP writes, and company section writers. An agent or leaked token can persist `<script>`, `<img onerror=...>`, or `javascript:` links. Impact is limited today because rendering goes through ProseMirror's schema (which drops unknown nodes) and the only `dangerouslySetInnerHTML` sinks are first-party constants, but on company creeds this is a stored cross-tenant payload waiting for any future raw render, HTML export, or email template. Note the markdown path is already safe (escapes first, restricts link schemes).
**Fix:** sanitize on write in `normalizeRichTextInput` with `isomorphic-dompurify`: allow-list tags (`p strong em u s mark code pre blockquote ul ol li a h2 h3 h4 br span`), attrs (`href class data-tag`), and URI regexp `/^(?:https?:|mailto:|#|\/)/i`. Apply the same in `lib/company-sections.ts`. Important if PERF-4's static preview (`dangerouslySetInnerHTML`) is implemented: do SEC-4 first.

### SEC-5 (Medium) CSP is Report-Only with no report endpoint, and `unsafe-inline` when enforced
**Problem:** `next.config.ts:42-44` ships `Content-Security-Policy-Report-Only` unless `CREED_CSP_ENFORCE=1`, with no `report-to`, so reports go nowhere. Even enforced, `script-src` includes `'unsafe-inline'` (`:14`), defeating the primary XSS protection.
**Fix:** set `CREED_CSP_ENFORCE=1` in production now, then move the theme boot script (`app/layout.tsx:82`) to a nonce injected via `proxy.ts` and switch to `'nonce-...' 'strict-dynamic'`.

### SEC-6 (Medium) No CSRF defense on the OAuth consent POST
**Problem:** `app/authorize/decision/route.ts:38` is a cookie-authenticated POST with no CSRF token or Origin check. Only the browser-default `SameSite=Lax` on Supabase cookies blocks a cross-site auto-submitting form minting an authorization code for an attacker-registered client.
**Fix:** reject when the `Origin` header is present and differs from the request origin; better, embed a signed one-time CSRF token in the consent form.

### SEC-7 (Medium) Supabase advisor findings (live data, 2026-07-31)
- Three `SECURITY DEFINER` functions are executable by any signed-in user via PostgREST RPC: `creed_role(uuid)`, `creed_section_permission(uuid, text)`, `creed_type(uuid)`. Fix: `revoke execute ... from authenticated` if they are only used inside policies, or confirm the exposure is intended.
- Public bucket `creed-avatars` has a broad SELECT policy allowing clients to list all files. Fix: drop the listing policy; public object-URL access does not need it.
- Leaked-password protection (HaveIBeenPwned check) is disabled in Auth settings. Fix: enable it in the dashboard.
- Auth server pinned to 10 absolute DB connections; switch to percentage-based allocation so instance upgrades help.

### SEC-8 (Medium) `validateCreedState` validates array shape but not elements
**Problem:** `lib/validation/creed-state.ts:101-119` checks arrays exist and are <=5,000 entries, then casts `input as unknown as CreedState`. No per-section length cap, no `accent`/`agentPermission` whitelist. A `PUT /api/app/state` can persist ~4.5MB of junk per request (Vercel body cap is the only bound), bloating every subsequent state load. `app/api/app/claim/route.ts:38-53` already does this correctly.
**Fix:** per-element validation modeled on the claim route: cap sections at 200, bodies at ~100k chars, whitelist `accent` against `ACCENT_KEYS` and `agentPermission` against the lattice. Also add name/content caps to `app/api/creed/write/route.ts` (currently none, `:355-359`).

### SEC-9 (Medium) Outbound fetches without timeouts; raw errors returned to clients
**Problem:** only `lib/ai/openrouter.ts` and `app/api/status/route.ts:18` set deadlines. Missing in `lib/github.ts:134,175,351`, `lib/email.ts:29`, `lib/ai/model-catalog.ts:414`, `lib/ai/persistence.ts:184`, `lib/marketing/fetch-roadmap.ts:25`, `app/api/feedback/route.ts:50`, and the MCP self-fetch. A hung upstream pins a serverless invocation for full billed duration. Separately, ~10 routes return raw upstream/DB error text verbatim (all 7 `app/api/app/github/*` routes, `ai/agent/route.ts:116,294-298`, `credits/intent:52`, `credits/confirm:47`).
**Fix:** `signal: AbortSignal.timeout(10_000)` on each fetch, map `AbortError` to 504. Return generic messages plus `requestId`; keep intentional user-facing messages by tagging them with a typed error class (see MAINT-6).

### SEC-10 (Low) Crypto hygiene (algorithm itself is sound)
- KDF is a bare SHA-256 of `CREED_ENCRYPTION_SECRET` (`lib/secret-crypto.ts:14`); safe only for full-entropy secrets. Fix: validate the secret is 32 bytes of base64 at load, or use `hkdfSync`.
- No key version in ciphertext, so rotation breaks every stored BYOK/GitHub/OAuth secret. Fix: `v1.iv.tag.ct` format plus `CREED_ENCRYPTION_SECRET_PREVIOUS` dual-read.
- Add `import "server-only"` to `lib/supabase/admin.ts` and `lib/supabase/env.ts`.

### SEC-11 (Low) OAuth periphery
- Unauthenticated dynamic client registration is correct per RFC 7591, but `oauth_clients` rows are never garbage-collected and the 20/min IP limit is ineffective until COST-2. Fix: `last_used_at` column, periodic pruning of token-less clients older than 7 days, global registration ceiling.
- No RFC 8707 resource-indicator validation (`lib/oauth.ts:362`); the advertised MCP spec 2025-06-18 requires it. Fix: persist `resource` on codes/tokens and verify it equals `${site}/mcp`.
- `oauth_token_creeds.mode` is hardcoded to `"direct"` at grant (`authorize/decision:114`) and documented as not consulted (`mcp/route.ts:732`): a dead control the next engineer may trust. Fix: enforce it as a permission clamp or drop the column.
- Duplicate redirect sanitizers: `app/auth/callback/route.ts:62-72` reimplements a stronger `sanitizeNextPath`. Fix: move the stronger version into `lib/safe-next.ts` and use it everywhere.
- `rmdir app/api/app/debug-credits` (empty local-only directory; a stray file dropped there later becomes a live route).

---

## 6. Database efficiency

### DB-1 (High) `persistCreedState` rewrites the entire file on any change
**Problem:** `lib/creed-backend.ts:1884-2155` upserts every section row (full payload JSON even for unchanged sections), every non-stale proposal, and every activity row (up to 500, with diff text, re-upserted on conflict), plus an unconditional `ensureTokenRow` read and token update, on every autosave tick and every single-section `/api/creed/write`. Massive write amplification and table bloat on `creed_activity`.
**Fix:** (1) skip section upserts where the already-computed `changed` flag (`:1959-1963`) is false, using a slim position-only update for reorders; (2) only insert activity rows whose ids are not already present; (3) run the token update only when `requireApproval` actually changed; (4) route `/api/creed/write` through a targeted section upsert plus one activity insert (the company path's `applyDraft` already works this way; VC-3's extraction is the natural place).

### DB-2 (Medium) `select("*")` on wide history tables
**Problem:** `creed_proposals` and `creed_activity` are fetched with `select("*")` limit 500 (`creed-backend.ts:1311-1333, 1530-1547`); `before_text`/`after_text` hold full section HTML. Megabytes of egress per load on older accounts. Also `buildAgentPayloadForToken` (`:2343-2383`) loads all 1,000 rows without limits and discards them (the MCP route already passes `{proposalLimit:100, activityLimit:100}`; the agent-read path passes nothing).
**Fix:** explicit column lists everywhere; exclude diff text from poll/load paths (detail endpoint on drawer open); pass small limits at `:2365`.

### DB-3 (Medium) Sequential roundtrips that should be parallel or batched
- `loadCreedStateImpl` runs 3 waves where 2 suffice: `readMcpClientRows` sits alone between two `Promise.all`s (`creed-backend.ts:1281-1305`). Move it into wave 2.
- `loadCompanyCreedState` awaits `enrichUserForState` and the creed-row read before its 12-way `Promise.all` (`:1491-1516`). Fold both in; delete the `avatar_url` fallback re-query (`:1505-1514`) and the same fallback in `lib/creed-membership.ts:69-85` once the migration is confirmed applied.
- Company write preambles run role, billing, section, and permission reads serially (`lib/company-sections.ts:1058-1136`, `lib/company-admin.ts:78-99`). `Promise.all` the independent reads; also parallelize the two override queries inside `effectivePermission` (`:146-177`).
- `renumberSections`/`reorderCompanySections` issue one UPDATE per section (`company-sections.ts:330-343, 1905-1918`). Replace with one RPC: `update ... from unnest($ids) with ordinality`.
- `deleteSectionRows` awaits four cleanups serially and runs the version-prune per referencing section (`:364-433`). `Promise.all` the deletes; batch the scrub.
- `requireAuthenticatedGitHubAccess` awaits three independent reads serially (`lib/github-version-control.ts:119-138`), and `/api/app/github/status` duplicates the entire auth+config fan-out (route pre-reads at `route.ts:70-84`, then the helper repeats them, ~5 duplicated roundtrips including 2 Auth Admin calls). Add a context-accepting variant; drop `enrichAuthenticatedUser`'s per-route `getUserById` (`:39-51`), the session user already carries `identities`.

### DB-4 (Medium) Per-write bookkeeping overhead
- `writeVersion` prunes with a 201-row select plus conditional delete on every save (`company-sections.ts:207-227`). Prune probabilistically (5%) or via `waitUntil`.
- MCP token verification does 2 lookups plus an Auth Admin call per request, uncached (`mcp/route.ts:2188-2201`, `lib/oauth.ts:362-396`). Add a module-scope LRU keyed by token hash, TTL 30-60s (expiry is checked from the cached row; <=60s revocation latency is acceptable).
- `getCompanyBilling` is re-read by `companyAccess`, `frozenResult`, `loadCompanyCreedState`, and `getSeatUsage` within overlapping paths. A 5-10s module TTL cache keyed by `creedId` collapses most freeze-gate reads.
- `buildConnectionDefinitions()` rebuilds a constant 17-entry array per state load (`creed-backend.ts:727-869`). Hoist to a module constant.
- `lib/company-admin.ts:52` dynamic-imports `node:crypto` per call. Hoist.
- The MCP company path re-queries member overrides that `loadCompanyCreedState` just fetched (`mcp/route.ts:795-805` vs `creed-backend.ts:1550-1553`); return them from the loader. Also use `target.role` instead of re-calling `getCreedRole` (`:781`).

### DB-5 (Low) Index hygiene (live advisor data)
- Add a covering index for `creed_proposals.user_id` (unindexed FK, advisor-flagged).
- Seven advisor-flagged never-used indexes are candidates for removal after checking they are not for rare paths: `creed_quality_reports_creed_hash_idx`, `creed_credits_user_id_idx`, `creed_member_agent_permissions_user_id_idx`, `creed_entitlements_customer_id_idx`, `creed_audit_log_action_created_at_idx`, `creed_company_billing_payment_intent_idx`.

### DB-6 (Low) GitHub API usage
`getGitHubFileSnapshot` makes 2 sequential GitHub calls with `cache: "no-store"` and no conditional requests (`lib/github.ts:235-287`). Fix: `Promise.all` the pair; compare the persisted `last_remote_sha` via the cheap commits query first and only fetch contents on change (304s are free against the 5,000/hr quota).

---

## 7. Maintainability and correctness at scale

### MAINT-1 (High) No CI whatsoever
**Problem:** no `.github/` directory, no workflow, no `typecheck` script. 23 test files with 139 cases run only by hand (`tests/editing-system.test.ts:2` says so). Lint and `tsc` are unenforced; nothing stops a regression.
**Fix:** one workflow on PR + main: `npm ci && npx tsc --noEmit && npm run lint && npm test`. Requires MAINT-8's `next-env.d.ts` fix first so `tsc` passes clean. Add `"typecheck": "tsc --noEmit"` to package.json.

### MAINT-2 (High) Generated Supabase types are missing; the hand-rolled shim forces 31 unsafe casts
**Problem:** `lib/supabase/types.ts` hand-maintains a structural `SupabaseLikeClient`; `getSupabaseAdminClient()` returns an untyped client, so consumers cast `as unknown as` 31 times (hotspots: `lib/company-billing.ts` x10, `app/api/app/company/*` x7, `app/mcp/route.ts:2209`), and a private `admin()` helper is copy-pasted in 8+ files. Every query's `data` is re-asserted per call site; a renamed column is invisible to `tsc`.
**Fix:** generate DB types (`supabase gen types typescript` or the MCP `generate_typescript_types` tool), type the admin client as `SupabaseClient<Database>`, delete `SupabaseLikeClient` and all casts. Interim: export one `getAdminDb()` from `lib/supabase/admin.ts` and delete the 8 local copies.

### MAINT-3 (High) Migration drift risk
**Problem:** migrations are checked in and well-ordered (55 files, verified), but there is no `supabase/config.toml` (repo not linked), and the house workflow applies DDL via the Management API, which does not record rows in `supabase_migrations.schema_migrations`. `db push`/`db diff` therefore cannot tell what is applied; a new environment cannot be reproduced confidently.
**Fix:** `supabase init` + `supabase link`, commit `config.toml`; when applying via the Management API also insert the version row into `schema_migrations`; once CI exists, add a `supabase db diff --linked` drift gate.

### MAINT-4 (High) Monolith files, with concrete split plans
Each split keeps the original path as a re-export barrel so import sites do not churn in one commit.
- `components/creed/file-screen.tsx` (4,602 lines; single component from 768-3384; 131 hooks; needs an `exhaustive-deps` disable at `:1097` and an `as unknown as SectionCardHandlers` cast at `:1266`). Split into `file-screen/format.ts` (fingerprints, relative time, accents, lines 165-296), `scroll.ts` (296-358), `section-changes.tsx` (358-768), `section-card.tsx` (`SectionCardBound` + `SectionCard`, 3384-4025, replacing the proxy cast with a typed handler factory), `lock-buttons.tsx` (4025-4186), `activity-rail.tsx` (4186-4602), plus extracted hooks `useFindReplace`, `useSectionDragOrder`, `useQualityToasts`.
- `components/creed/creed-provider.tsx` (2,851 lines; **file-wide `eslint-disable react-hooks/exhaustive-deps` at line 13**, in the most stale-closure-sensitive file in the app). Split into `provider/merge.ts` (the pure merge/stabilize/clone helpers, lines 136-536, which become unit-testable), `use-presence.ts`, `use-company-save.ts`, `use-sync.ts`, and `actions/*.ts` grouped by the existing context type. Then delete the file-wide disable and fix violations hook by hook.
- `lib/creed-data.ts` (2,588 lines, majority static prose shipped toward the client). Split into `creed-domain.ts` (types/constants), `creed-legacy.ts` (normalizers), `creed-serialize.ts` (markdown), `agent-contract.ts` with `import "server-only"` (collaboration rules + hidden agent guidance, lines 951-1205 and 1376-1932, keeping prompt copy out of the browser bundle), `section-suggestions.ts`, `creed-initial-state.ts`. Delete its private `escapeHtml`/`tagSlug` (`:523-537`) in favor of `lib/rich-text.ts:2`.
- `lib/creed-backend.ts` (2,383 lines). Split into `backend/rows.ts`, `tokens.ts`, `integrations.ts`, `load-state.ts`, `load-company-state.ts`, `persist.ts`, `usage.ts`.
- `app/mcp/route.ts` (2,254 lines). Split into `lib/mcp/tools.ts`, `jsonrpc.ts`, `agent-name.ts`, `state.ts`, `handlers/{read,write,company}.ts`, `search.ts`; do VC-3 (kill the self-fetch) in the same pass.
- `components/creed/company-settings.tsx` (2,207 lines, 47 hooks) and `settings-screen.tsx` (1,890): one file per `<Section>`, shared `settings-ui.tsx` for `Section`/`RolePill`/`MemberAvatar`/`CreditTile`/button styles.
- `lib/company-sections.ts` (1,920): `permissions.ts`, `journal.ts`, `drafts.ts`, `proposals.ts`, `versions.ts`, `crud.ts`; move `reviewPersonalProposal` (`:1571`) out of the company module.

### MAINT-5 (High) Duplication that must be bug-fixed twice today
- Personal vs company write stacks duplicate leaf logic: `escapeHtml` defined 4x (`lib/rich-text.ts:2`, `lib/creed-data.ts:523`, `app/api/creed/write/route.ts:145`, `lib/onboarding/compile-company.ts:5`); activity-row construction in 3 shapes (`proposals/route.ts:381`, `lib/panel/agent-execute.ts:122`, `company-sections.ts:230`); draft-to-content application in 3 places (`write/route.ts:158-219`, `company-sections.ts:462-663`, `mcp/route.ts:1412,1517`). Fix: extract `lib/sections/draft-apply.ts` and `lib/sections/journal.ts`; unify leaf helpers first, do not merge the two persistence models in one step.
- GitHub token refresh machinery is copy-pasted between `lib/github-version-control.ts:59-176` and `lib/company-github.ts:140-228` (verbatim `isRefreshableGitHubError`, same early-refresh predicate, same retry-once wrapper; ~110 parallel lines). Fix: `lib/github-token.ts` with a generic `withRefreshingToken(store, op)`; both become thin `TokenStore` adapters.
- 58 animated icon files share an identical ~60-line boilerplate template (6,489 lines total, ~3,500 pure boilerplate; compare `components/ui/archive.tsx:32-50` with `clock.tsx:43-50`). Fix: `components/ui/animated-icon.tsx` exporting `createAnimatedIcon({variants, render})` plus a shared handle type; each icon shrinks to ~30 lines. Delete the 9 dead icon files first: `align-left.tsx`, `check.tsx`, `file-stack.tsx`, `git-compare-arrows.tsx`, `log-out.tsx`, `refresh-cw.tsx`, `rotate-ccw.tsx`, `sheet.tsx`, `switch.tsx` (zero importers, verified).
- Settings screens duplicate `looksLikeApiKey` (`company-settings.tsx:142`, `settings-screen.tsx:102`) and define `GitHubMark` 3x. `formatRelativeTime` exists twice (`file-screen.tsx:200`, `creed-backend.ts:233`). Consolidate.

### MAINT-6 (Medium) Error handling: the standard wrapper exists with zero adopters
**Problem:** `lib/observability.ts:69-110` implements `withErrorLogging` (uniform `{error, requestId}` 500, structured log, duration); no route uses it. Status-code mapping is ad hoc (`statusFor` duplicated in `app/api/app/sections/route.ts:9` and `sections/[sectionId]/route.ts:12`); `lib/creed-backend-errors.ts` string-sniffs Supabase messages (`message.includes("schema cache")`), fragile against upstream changes; ~10 routes leak raw error text (SEC-9).
**Fix:** wrap all 72 routes in `withErrorLogging` (mechanical); move `statusFor` next to `SectionWriteResult`; grow `creed-backend-errors.ts` into a typed error-code module (`{code: "not_found" | "forbidden" | ...}`); introduce a `UserFacingError` class so only tagged messages reach clients. Also: `app/api/app/ai/agent/route.ts:243` silently swallows `recordAiUsage` failures, but usage telemetry is the reconciliation record for `credit_debit_failed_after_spend`; log a warning there.

### MAINT-7 (Medium) Env validation is lazy; failures surface mid-request
**Problem:** every env getter is lazy, so a deploy missing `CREED_ENCRYPTION_SECRET` (`lib/secret-crypto.ts:8-10`) or `STRIPE_WEBHOOK_SECRET` boots healthy and fails at first use (for the webhook secret, silently, see COST-4).
**Fix:** `lib/env-check.ts` exporting `assertServerEnv()` validating the ~12 required server vars by reusing the existing getters, called once from `instrumentation.ts`. Move `MEDIAN_API_KEY` (`app/api/feedback/route.ts`) behind a getter for consistency.

### MAINT-8 (Medium) Config drift generators
- `next-env.d.ts:3` is committed pinning `./.next-runtime.nosync/dev/types/routes.d.ts`, a machine-local gitignored dev path; any environment that has not run dev with that distDir fails typechecking, and the file churns per `CREED_DIST_DIR`. Fix: gitignore `next-env.d.ts` (Next regenerates it).
- `tsconfig.json:36-58` accumulates ten `.next-preview-*` include entries. Replace with single patterns (`.next-preview*/types/**/*.ts`, `.next-preview*/dev/types/**/*.ts`). These two items are why git status shows both files perpetually modified.
- `target: "ES2017"` is needlessly old; bump to `ES2022`. Consider `noUncheckedIndexedAccess` (the codebase indexes into record maps constantly).
- The file-wide lint disable in `creed-provider.tsx:13` is covered by MAINT-4; the two globally disabled experimental hooks rules in `eslint.config.mjs:58-59` are acceptable and well-argued.

### MAINT-9 (Medium) Test coverage is pure-function-only
**Problem:** every existing test imports pure modules. Untested critical surfaces: `lib/stripe.ts` webhook event dispatch and entitlement grants; `lib/company-billing.ts` seat purchases and credit RPC wiring; `lib/oauth.ts` (an entire OAuth server: code grants, token issuance, rotation); `lib/secret-crypto.ts`; MCP end-to-end (JSON-RPC envelope, bearer auth, `resolveMcpState` scoping, the 400+ lines of legacy-arg normalizers); `effectivePermission` + `companyMcpWrite` (the code that actually blocks a member write); the provider's `mergeExternalState`/`stabilizeMergedState` (pure but trapped in the component until MAINT-4).
**Fix priority:** extract-and-test `resolveMcpState` + legacy normalizers, `effectivePermission`/`applyDraft`, and Stripe webhook dispatch with fake event objects. The migration regex tests (`tests/company-p0-migrations.test.ts`) stay but get superseded by the MAINT-3 drift gate.

---

## 8. Execution order

Phased by leverage; within a phase, items are independent and parallelizable.

**Phase 0, stop the bleeding (hours):**
COST-1 (AI rate limits + reserve-then-settle), COST-2 (shared limiter), SEC-3 (batch cap), VC-7 (health endpoint), COST-4 (webhook 503), SEC-5 (flip `CREED_CSP_ENFORCE=1`), SEC-7 (advisor items: revoke RPC execute, bucket listing policy, leaked-password toggle), VC-6 (anonymous status poll), DB-5 (FK index).

**Phase 1, biggest cost and lag wins (days):**
VC-1 (state-poll delta probe + payload caps), VC-2 (member-profile RPC), VC-3/MAINT-4-mcp (extract personal writes, kill self-fetch, split the MCP route), VC-4 (sections-only tab endpoint), VC-5 (skip state on handshake, `waitUntil` telemetry), PERF-1/PERF-2 (keystroke network storm), BUNDLE-1/BUNDLE-2 (landing dynamic import + grammar subset), VC-8/VC-9 (proxy matcher + root redirect), DB-1 (changed-rows-only persist).

**Phase 2, correctness and safety net (days):**
MAINT-1 (CI), MAINT-2 (generated DB types), MAINT-3 (migration linkage), SEC-1 (scope enforcement), SEC-2 (entitlement recheck + revoke on refund), SEC-4 (sanitize on write), SEC-8 (element validation), SEC-9 (timeouts + error hygiene via MAINT-6), MAINT-7 (boot env check), COST-5/COST-6 (billing gaps).

**Phase 3, structure and speed (ongoing, one module per PR):**
MAINT-4 splits (provider first, its `merge.ts` unlocks MAINT-9 tests), PERF-3 (context split), PERF-4 (lazy editors, after SEC-4), PERF-5 through PERF-9, MAINT-5 (dedupe write stacks, GitHub token core, icon factory after deleting dead icons), DB-2/DB-3/DB-4 (query hygiene), BUNDLE-3/BUNDLE-4/BUNDLE-5, VC-10 (assets to CDN), VC-11/VC-12, MAINT-8, SEC-10/SEC-11, DB-6, MAINT-9.

---

## 9. Maintenance playbook: keeping it this way

**Gates (enforced by CI, non-negotiable):** typecheck, lint, tests on every PR; `supabase db diff --linked` drift check; a bundle-size budget for the `/home` and `/file` first-load chunks (run `ANALYZE=true npm run build`, record the post-Phase-1 numbers as the budget, fail on +10%).

**Conventions (enforced by review):**
- No new route without `withErrorLogging`, an auth mechanism from the existing set, input caps on every string field, and a rate-limit decision (limited, or a comment saying why not).
- No outbound `fetch` without `AbortSignal.timeout`.
- No client polling without: visibility gating, a burst-dedupe gate, a cadence justification, and never for anonymous users. Prefer the realtime channel or a delta probe.
- No `select("*")` on `creed_proposals`, `creed_activity`, or any table with text blobs.
- Response-blocking writes that are pure bookkeeping go through `waitUntil`.
- Any new secret env var: add to `assertServerEnv()`, never `NEXT_PUBLIC_`.
- Component files cap at ~800 lines and lib files at ~1,000; hitting the cap means split, not scroll.
- All Supabase access through the typed client; `as unknown as` on query results is a review blocker.
- DDL changes: migration file first, applied in a way that records `schema_migrations`, then `get_advisors` (security + performance) after every DDL change.
- HTML entering storage goes through the sanitizer; new render sinks (`dangerouslySetInnerHTML`) require a note pointing at the sanitizer guarantee.

**Cadence (monthly):** run Supabase advisors and prune never-used indexes; `npm outdated` and update within-major deps (watch the `motion`/`framer-motion` consolidation); check Vercel top routes by invocations and duration against expectations (the state poll and MCP should trend down after Phase 1); review the CSP report console before tightening further.

**Definition of done for this audit:** every High and above finding closed or explicitly waived with a dated note in this file; the playbook gates live in CI; the budget numbers recorded.
