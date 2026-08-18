# Creed Roadmap

This file holds parked product bets: ideas that are endorsed but
deliberately not now. It is not a schedule, a commitment, or where active
work lives. Each entry states the idea, why it fits Creed, and the one
thing to protect so it stays cheap to build later.

## How to use this file

- Add an entry only when an idea is **worth keeping and clearly not now**.
  A vague maybe does not earn a slot.
- Keep every entry in the same field shape (see the one below). One sharp
  line per field beats a pile of loose notes.
- When an entry goes active, move its substance into `product.md` and
  delete it here. The roadmap should never duplicate live priorities.

What does not belong here:

- Active priorities go to `product.md` ("Priorities right now").
- Things we have decided never to build go to `product.md` ("What we are
  explicitly not building").
- Current bugs, security, and tech debt go to `current.md` only if they
  affect fresh-agent work. Otherwise put them in an issue, not project context.
- Unresolved strategic questions stay in the relevant roadmap entry until decided.

## Personal build key (`CREED_API_KEY`)

**Status:** Parked. Endorsed, not now.
**Added:** 2026-06-03.
**Revisit when:** builder demand is visibly pulling for it, and the
current priorities (landing, onboarding, connection ubiquity) are solid.

**One-line.** A personal API key that lets a user read, and optionally
propose to or edit, their own live Creed from code they build themselves.
The "Build" counterpart to MCP's "Connect."

**What it does.** One job: return the user's live Creed (rendered markdown
plus the structured section list) to their own code, authenticated by
their key. That unlocks a personal dashboard, a custom CLI or personal
agent, a writing tool that starts pre-aligned, or automations that already
know who the user is.

**Mental model.** Two front doors to one file, split by who the actor is.
MCP is delegated access for software the user does not control (Claude,
Cursor, ChatGPT), so it uses OAuth and a consent screen. The key is
first-party access for code the user writes and runs, so it is a
long-lived token they hold. Same split GitHub draws between OAuth apps and
personal access tokens. Surface it as two verbs: **Connect** (agents, on
`/connections`) and **Build** (your key, in `/settings`). Never blend them.

**Scope ladder.** Escalating, opt-in scopes that mirror the OAuth scopes
already in the system (`read propose`, plus `direct_edit` only when
approval is off):

- **Read** is the default and the core. Low blast radius (the user's own
  data).
- **Propose** is the right write verb. Proposals land in the `/file`
  review queue, the user approves, and the curation contract holds.
- **Direct edit** is the highest risk. Gated behind the same
  `requireApproval: false` trust toggle agents use, as a separate scope.
  Never the default.

**Why it is cheap.** It is a second issuance path, not a new system.
`/api/creed/*` already does read, propose, and write over a Bearer token;
those tokens already carry scopes and are hashed plus encrypted in
`creed_tokens`; and MCP already proxies its writes through `/api/creed/*`
internally. The key reuses all of it.

**Risk and design.** A user-facing key reintroduces a long-lived static
bearer, the exact leak surface removed when MCP moved to OAuth. So ship it
personal-access-token style: read-only by default, named, scoped,
revocable, with last-used tracking, shown once, hashed and encrypted at
rest, and never accepted in a query string. Read-only keeps the worst case
at "the user's own profile leaks," which is acceptable.

**Positioning.** Keep it off the MCP connect story. MCP stays the way to
connect agents on `/connections`. The key lives in `/settings` under
something like "Build on your Creed," framed for code the user writes.

**Growth read.** This grows depth, not width. It will not move signups;
there is no acquisition funnel here. It deepens reads-per-user and
retention among builders, who are the wedge and the loudest channel. Treat
it as a gift to power users, not a growth bet.

**Protect now.** The only way to make this expensive later is to delete
`/api/creed/*` or the `creed_tokens` scope infra in a future MCP-only
cleanup. Keep the substrate intact even while the token UI stays hidden.

**Explicitly not this.** Not a third-party platform. Other developers do
not build apps on other users' Creeds. This is single-user: the user's own
key, own file, own code. The platform version stays a no (see
`product.md`, "What we are explicitly not building").

## Notion sync

**Status:** Parked. Endorsed, not now. Below the personal build key
(bigger build, more risk).
**Added:** 2026-06-03.
**Revisit when:** Notion-native users ask for it, and the current
priorities (landing, onboarding, connection ubiquity) are solid.

**One-line.** A managed sync that mirrors `creed.md` to a page in the
user's Notion, for people who run Notion as their docs OS and do not want
a separate Creed tab.

**What it does.** Pushes the live file into a "Creed" page in their
workspace so they can see it inside their Notion ecosystem, and, later and
optionally, lets edits made in Notion flow back. The draw is presence in
a surface the user already lives in, not a new feature on top of the file.

**Mental model.** This is the third connection bucket, **Integrate**,
alongside GitHub and Google in `/settings`. Not Connect (that is agents
over MCP) and not Build (that is the user's own code against a key). It is
a managed sync Creed runs to an external docs provider, the exact shape of
the existing GitHub version control.

**How the connection works.** Notion OAuth, hand-rolled like the MCP OAuth
server (not Supabase identity-link, since Notion is not the login
provider). The user clicks Connect, Notion shows its own consent screen
with a page picker (access is page-scoped, so Creed only ever touches the
granted page, never the whole workspace), and the callback exchanges the
code for an access token stored encrypted on `creed_integrations`. The
granted page becomes the parent; a child "Creed" page id is saved in a
`creed_notion_sync` row, the analog of `creed_version_control`. Push
converts the 10 sections to Notion block objects (the block twin of
`sectionToMarkdown`) and rewrites the page's children; pull reads the
blocks back through the rich-text parser. Code mirrors GitHub almost
file-for-file (`app/api/app/notion/*`, `lib/notion.ts`,
`lib/notion-sync.ts`).

**Open question: live sync vs push/pull.** Unresolved, and the crux of the
feature.

- **Push/pull (manual).** Buttons in `/settings`, identical to GitHub.
  Consistent with the deliberate "we never autosync" stance stated across
  the docs. Safe, predictable, no conflict engine, no webhooks. The likely
  v1.
- **Live sync (automatic).** Push on save (debounced from
  `persistCreedState`) and pull on Notion webhooks
  (`page.content_updated`). Matches the "updates live" pitch, but it
  reopens the autosync decision closed for GitHub and forces a conflict
  model: user edits in Notion, user edits in Creed, and agent proposals can
  all race the same baseline, on top of the existing `persistCreedState`
  write race.
- **Leaning.** Start manual to stay consistent with GitHub. Treat live
  sync as a separate, deliberate decision to revisit autosync product-wide,
  not a side effect of shipping Notion. If live pull-back ever lands, route
  Notion changes through the review queue as proposals, never a silent
  overwrite.

**Why it is cheap.** Mostly the GitHub integration with the provider
swapped. The only genuinely new work is the block-to-section converter and
the Notion OAuth callback. Token storage, encryption, the
connected/disconnected/not-connected states, and the Push/Pull UI already
exist.

**Risk and design.** Two real risks. First, fidelity: `creed.md` is
structured rich-text (callouts, inline `#tags`, section accents, the
10-section spine) and Notion's block model will not round-trip cleanly, so
the converter is where the feature lives or dies. Second, sludge: if Notion
is an editable source, Notion AI can write to the sacred file with no
knowledge of the curation rules or the agent contract, the unbound-writer
problem the ideology warns against. v1 should be a one-way mirror (Creed to
Notion) to sidestep both.

**Positioning.** Lives in `/settings` Integrations next to GitHub, same
card and pills. Keep it off the `/connections` MCP story and separate from
the build key.

**Growth read.** Depth, not width. Presence and retention for the
Notion-native segment, not an acquisition funnel, and a bigger, riskier
build than the build key.

**Prototype first.** Validate the block-to-section converter on a real
multi-section Creed before committing. If the round-trip loses callouts,
tags, or structure, that decides whether pull-back is worth offering at
all.

**Explicitly not this.** Not full bidirectional autosync in v1, and never
an unsupervised Notion AI write path to the canonical file.

## Obsidian plugin

**Status:** Parked. Endorsed, not now. Depends on the personal build key
for auth, and sits above two cheaper Obsidian paths.
**Added:** 2026-06-03.
**Revisit when:** Obsidian-native users are asking, and the build key has
shipped (it supplies the auth).

**One-line.** A first-party Creed plugin in Obsidian's community registry
that syncs `creed.md` into the user's vault as a native Markdown file.

**What it does.** Authenticates with the user's Creed key, pulls the live
file into the vault as `creed.md` (a manual Sync button, plus optional
auto-pull on vault open), and later pushes vault edits back as proposals.
Because a vault is plain Markdown and Creed already emits Obsidian-flavored
Markdown (`==highlight==`, `>` callouts, inline `#tags`), it is the same
format end to end, with no conversion.

**Mental model.** Obsidian has no cloud API; a vault is a folder of `.md`
files on disk, and a hosted app cannot write there. The sync has to run on
the user's machine. The plugin is that local puller, reaching outward to
Creed with the build key. So it is conceptually a Build-bucket client (the
key lives on the user's machine), not an Integrate-bucket managed sync like
GitHub or Notion.

**How the connection works.** The plugin stores a read (or read plus
propose) `CREED_API_KEY` in its settings, calls `/api/creed` for the
rendered Markdown, and writes it to a configured path in the vault.
Auto-pull on a timer or on vault open. Push-back, if offered, sends changed
sections to `/api/creed/proposals` so they land in the `/file` review
queue, never a silent overwrite. No OAuth server, no block converter, no
webhooks.

**Sits above two cheaper paths.** Recorded so the plugin stays a deliberate
choice, not the only option:

- Tier 0, works today: point Creed's GitHub sync at a repo and use the
  Obsidian Git community plugin to pull it into the vault. Zero new code,
  just a docs page.
- Tier 1: a small pull script against the build key
  (`creed pull > vault/creed.md` on a cron or watcher). The plugin is the
  polished version of this.

**Open question: auth and cadence.** Two to settle when building. Auth: the
simple route is the personal key pasted into plugin settings; the nicer,
heavier route is an OAuth device flow so there is no key to paste. Cadence:
manual Sync only, vs auto-pull on an interval or on vault open. Lean
manual-plus-opt-in-auto, consistent with the GitHub stance.

**Risk and design.** Markdown-native, so the converter that makes Notion
risky is absent. The real cost is ongoing maintenance: a plugin in
Obsidian's ecosystem means their submission process and version upkeep
against API changes, which is the whole reason it is the top tier and gated
on real demand. Sludge risk is low (the default interaction is the user
hand-editing Markdown, and push-back routes through proposals). Keep v1
pull-only, add proposal push-back later, and the key it depends on should
be read-only by default.

**Positioning.** Distribution is the Obsidian community plugin registry,
configured inside Obsidian, not a card in `/settings`. Inside Creed it
appears only as a docs/how-to and as one of the things the build key
unlocks.

**Growth read.** Depth for the Obsidian-native segment, but it doubles as
quiet distribution: a listing in Obsidian's registry puts the Creed name in
front of a Markdown-loving, tool-curious audience close to the wedge. The
most outward-facing of the parked items, though still modest.

**Explicitly not this.** Not a sync running from Creed's servers (they
cannot reach local disk), and not unsupervised write-back to the canonical
file; vault edits return as proposals.

## Credit system

**Status:** Planned, near-term. Not started. Pairs with the pricing
decision (open-core, credits + BYOK); promote into `product.md` when work
begins. **Evolved 2026-07-01** - the product shape here is superseded by
"AI feature expansion" below (a usage allowance, no BYOK or model picker,
spend attributed per feature). The infra in this entry - the tables, the
Stripe Payment Element flow, the markup constant, the atomic deduct RPC -
still stands as the substrate the new model builds on.
**Added:** 2026-06-03.

**What it is.** Prepaid managed AI: the user buys credits from Creed, and
Creed runs the AI on its own key. The default in settings, because most
users will not set up BYOK. BYOK stays as the opt-in alternative for power
users who want their own key at no markup.

**What it funds.** Ongoing first-party AI only: quality analysis and future
add-ons. Not onboarding, which is agent-composed and key-free (shipped; see
the onboarding loop in `product.md`).

**Requires a platform OpenRouter key.** This is the legitimate home for the
platform key: it is the credit engine. Onboarding still never touches it,
so the two features stay consistent.

**Settings card.** One persisted mode (`ai_mode` on `creed_ai_settings`),
surfaced as a two-pill toggle at the top: `[ Credits ] [ BYOK ]`, Credits
active by default. The toggle is authoritative for every AI call, even when
the user has both a saved key and a balance. Below it, only the
mode-specific status line and primary button change:
- Credits: balance line, "Add credits" primary, "View history" secondary
  (the credit ledger).
- BYOK: key status line, "Save" primary, "Clear" secondary (today's UI).
The model dropdown is the only dropdown and stays in both modes. The mini
spend graph is unchanged.

**Add credits popup.** A clean in-app modal: current balance, preset chips
($5 / $10 / $25 / $50) plus a custom field, $5 minimum, one pay button.
Payment uses the Stripe Payment Element so the user never leaves the app.
Stripe Link appears automatically as one-tap pay for eligible users, and
saved payment methods make repeat top-ups one tap.

**Money in.** Pick amount -> server creates a PaymentIntent
(`metadata: {userId, type: credits}`) -> Payment Element collects payment in
the modal -> `payment_intent.succeeded` webhook credits the balance. The
webhook is the source of truth; the client only updates the UI
optimistically. Idempotent on the event / payment-intent id.

**Money out.** A credits-mode call checks the balance, runs on the platform
key, then deducts `realCost × markup` and writes a transaction. `realCost`
already exists via `estimateAiCostUsd`; base the markup on the truest cost
available so margin holds.

**Markup.** One tunable constant, start ~1.75-2x. Applied at deduction,
prospective only (balances are stored in dollars, so changing it never
re-prices existing credits).

**Storage.** `creed_credits` (balance as `NUMERIC(12,6)` USD or integer
micro-dollars, never float) plus `creed_credit_transactions` (append-only
ledger of top-ups and per-call deductions). Mutations via an atomic
Postgres RPC so concurrent calls cannot race the balance.

**Reused vs new.** Reused: Stripe (now via Payment Element), the webhook
pattern, `estimateAiCostUsd`, `recordAiUsage`, encrypted storage, the model
dropdown and spend graph. New: the platform key, the two tables, the
`ai_mode` toggle, the Add credits popup, and the balance-check-plus-deduct
resolver that replaces the BYOK-only `getUserOpenRouterCredential`.

**v2.** Auto-reload: save the card and charge off-session when the balance
drops below a threshold, for postpaid-like seamlessness without float risk.

**Honest note.** Creed's ongoing AI volume is low, so absolute profit is
modest. This exists to remove the key friction and avoid losing money on
managed AI, not as a revenue line.

**Explicitly not this.** Not postpaid metered billing (prepaid only, to
avoid float, fees on micro-charges, and surprise bills). Not Stripe's own
credit-balance system (the balance lives in Creed's DB). Not a replacement
for BYOK (both ship, the toggle picks).

## AI feature expansion: Smart CMD-K, Tab, and usage billing

**Status:** Largely shipped. The panel (CMD-K) and usage-allowance billing
are live, and **Tab autocomplete shipped 2026-07-12** (see
`current.md`; explicit-invoke ghost text, one metered generation per
press, pinned Tab model). This entry remains as the design record.
**Added:** 2026-07-01.

**One-line.** Two new AI surfaces - a smart command palette (CMD-K) and an
explicit Tab autocomplete - plus a shift from prepaid credits + BYOK to a
usage allowance billed per feature, with the model auto-picked per feature
and never shown to the user.

**The three AI features.** One model each, matched to the job shape:

- **Analysis** - quality scoring, now also absorbing synthesis and
  refinement (one model does all the "writing/grading" work).
- **Tab** - explicit-invoke autocomplete. Press Tab once -> one suggestion
  drawn from the section plus the whole Creed -> approve (Tab again), reject,
  or keep typing to dismiss. Not per-keystroke ghost text.
- **CMD-K** - Raycast-style palette. Local fuzzy search over a command
  registry handles the common case with no AI; the model fires only on
  tab / no-results, and can take actions (fix typos, open billing, change a
  setting). Mutating actions confirm first; Creed edits show a diff.

**Model per feature (hidden, automatic, via OpenRouter).** The pinned Tab,
Panel, and Analysis models match the model to the job,
never one model for everything. Picks as of OpenRouter, mid-2026
(re-confirm live IDs and prices before pinning):

- **Tab -> `gpt-oss-120b` on Groq**, reasoning off, Creed prefix cached.
  Chosen on latency / time-to-first-token, not benchmark IQ. Challengers to
  A/B: gpt-oss-20b (lighter), MiniMax M2.5 (prose-tuned).
- **CMD-K -> GLM 5.2**, reasoning low, on a low-TTFT provider. Chosen on
  tool-calling reliability (beats GPT-5.5 on TAU-bench), ~1/5 the cost, 1M
  context. Verify on the real tool schema before locking.
- **Analysis -> Claude Sonnet 4.6.** Chosen for strict, structured critique
  at temp 0. Confirm with a one-time bake-off vs GPT-5.5, GLM 5.2 as a
  cheap wildcard; if Sonnet wins it also keeps synthesis.

**Billing: a usage allowance, not prepaid-only credits.**

- Each plan includes an allowance (e.g. $7/mo -> "$5 of usage"). The included
  figure is **marked-up dollars**, so $5 of user-facing spend is ≈ $2.50
  real cost at a **2× premium** (lean 2× over 1.5× once Stripe, OpenRouter's
  own fee, and the giveaway are counted).
- **All three features metered.** Tab is explicitly invoked, so there is no
  per-keystroke meter anxiety; bill one generation per Tab press -
  approve / reject / keep-typing are free (no model call).
- Hit the allowance -> AI features pause until the user adds credits. Soft
  warnings at 80% / 100% and one-click top-up, never a silent wall.
- **Purchased** credits carry over (consider an expiry); the monthly
  included allowance resets.

**UI.** Keep most of today's AI settings UI, minus two things: **cut the
model selector** and **cut the BYOK toggle** (keep the BYOK code as a
possible hidden power-user escape hatch, not a first-class mode). Show spend
as `$3.24 / $5.00`. Recolor the spend graph **by feature** - blue Analysis,
green Tab, pink CMD-K - instead of by model quality, which is meaningless
once the model is hidden.

**Why it is cheap.** Reuses the credit substrate from the entry above:
`creed_credits`, the transaction ledger, the Stripe Payment Element flow,
`estimateAiCostUsd`, the markup constant, the atomic deduct RPC. Genuinely
new work: the per-feature model config, the CMD-K command registry plus
confirm-gated action tools, the Tab suggestion UI, folding synthesis onto
the Analysis model, and tagging each spend row with its feature for the
colored graph.

**Risk and design.**

- CMD-K mutates account state: whitelist typed tools, confirm before any
  settings or billing change, diff-preview before any Creed edit. Never let
  free text drive an irreversible action.
- Tab conditions on the whole Creed every press - prefix caching is the cost
  lever; without it each press is dear.
- Hidden models mean prompts are tuned per model: pin specific IDs (never
  auto-routing) and gate any swap behind a small eval. Analysis especially
  runs at temp 0 against a versioned rubric, so a model swap shifts every
  user's scores.

**Explicitly not this.** Not a user-facing model picker (auto and hidden).
Not postpaid metered billing (allowance plus prepaid top-up only). Not BYOK
as a first-class mode (cut from the default UX). Not per-keystroke
ghost-text autocomplete (Tab is explicit-invoke).
