# Creed Product

## One-line

Creed is one personal context profile every AI you talk to reads before
answering - written by you, kept polished by your agents.

## Wedge

Anyone who uses AI seriously hits the same tax: re-explaining themselves
every conversation, every tool, every session. The tax is highest for
people who use multiple agents (Claude, Codex, ChatGPT, OpenClaw,
Hermes, Cursor) and who care about quality of reply.

Creed kills that tax with one shared file.

## Audience

Creed is for **anyone using AI seriously**, not only developers.

Onboarding asks three open questions, the same for everyone, so it works
as well for a founder as for a writer or researcher. No persona picker, no
per-field forms - just who you are, what you're working toward, and how AI
should treat you.

In rough order of fit:
- builders (founders, indie hackers, devs)
- writers + creatives
- researchers + students
- operators + executives
- power users with serious personal AI use

Casual users who only ever use one chat assistant aren't the wedge.

## Core loops

### 1. Onboarding loop (one-time)

Welcome slide -> three open questions (with three explainer slides woven
through them that teach what Creed is) -> claims an instant deterministic seed ->
copies a prefilled prompt into any AI assistant -> pastes the returned
markdown back -> previews -> buys ("Get Creed") and lands in `/file`.

Onboarding holds no OpenRouter key, runs no platform AI, and uses no MCP.
The three answers compile to a clean deterministic seed of the five core
sections (the claimable fallback), then the user's own assistant composes
the polished Creed on its own tokens off a copy-paste prompt - no agent
connection needed. Pasting is the value step; payment happens at the end,
on the preview.

Each starter section includes a `Graph Tags` subsection, and the copy prompt
instructs the assistant to keep or create 2-4 related-section references per
section. Graph tags are only links to real sections, not tool/app/theme labels,
so new users immediately see the intended Obsidian-style section graph pattern.

The file screen can switch from editor view into **Nexus**, a pan/zoom graph of
section references. Users can drag the map, hover nodes for section name/score
context, and select a node to focus its immediate neighbourhood. Clicking the
selected node again or pressing Escape clears that focus. Nodes do not navigate:
the section rail remains the explicit route through the file. Nexus preserves
its settled layout and viewport when switching between the two views.

### 2. Connection loop (per agent)

User adds the Creed MCP URL to their agent as a custom connector, the
client opens a browser, the user clicks **Allow** on the Creed-branded
consent screen, and it's connected. No tokens to copy. This is the
OAuth 2.1 flow every spec-compliant MCP client (Claude, ChatGPT,
Cursor, ...) drives off the server URL.

Connecting an agent is part of the paid plan: the consent page and grant
route require a paid entitlement, so users connect after onboarding +
payment, not during it. MCP is the only surfaced connection path; the
`/api/creed/*` HTTP API is the documented non-MCP fallback (in `/docs`).

### 3. Read loop (every agent reply)

Connected agent reads the user's Creed before answering. The read
payload includes:
- the visible Markdown content
- a hidden agent contract specifying proposal mode, endpoints, and
  judgment rules

Agent shapes its reply around the read.

### 4. Proposal loop (continuous)

As the agent learns something durable about the user, it proposes a
narrowly-scoped update to the right section. The proposal lands as a
diff in the user's Creed file. The user reviews and accepts / rejects.

Direct-edit mode skips review when the user trusts the agent.

### 5. Curation loop (occasional)

User opens `/file`, reads through, prunes stale lines, sharpens vague
ones. Quality popovers nudge them where sections need work. They're
not pushed to add - they're pushed to improve what's there.

## The 10 sections

Always-on core:

| Section     | Accent     | What goes in it                                       |
|-------------|------------|-------------------------------------------------------|
| Identity    | violet     | role, defining traits, values, defaults               |
| Goals       | orange     | live priorities (near-term + long-horizon)            |
| Work        | sky        | what they do, tools, how they like to work            |
| Preferences | cyan       | reply-style defaults with concrete do/avoid signal    |
| Routines    | indigo     | daily / weekly / seasonal rhythms AI should respect   |

Optional (grow in-app as you and your agents fill them; not seeded at
onboarding):

| Section     | Accent     | What goes in it                                       |
|-------------|------------|-------------------------------------------------------|
| Beliefs     | emerald    | stable worldview that changes how AI reasons          |
| Constraints | red        | hard noes, sensitive topics, permission gates         |
| People      | rose       | named relationships AI should remember                |
| Health      | lime       | conditions, accessibility, dietary patterns           |
| Context     | grey       | durable catch-all (location, life stage, environment) |

Every section is **agent-writable** by default.

## What "great" looks like, screen by screen

### `/home` (signed-out landing)
- hero with "One file across every agent"
- below-hero sections: why-use-it stats, how-it-works loop,
  governed-collab, AI features, get-started steps, integrations, FAQ,
  closing CTA
- premium, calm, editorial - feels like a product you'd pay for

### `/onboarding` (10-step flow)
- step 0: welcome (greets the user by first name; the AI agents you use,
  drawn in a rough circle and pulsing into the one file at the centre)
- step 1: Q1 identity (one open question: who you are, what you do, your tools)
- step 2: explainer (the five core sections assembling into one file)
- step 3: Q2 goals (one open question: what you're working toward)
- step 4: explainer (an agent proposal landing as a diff you approve)
- step 5: Q3 preferences (one open question: how AI should treat you)
- step 6: explainer (ownership: your Creed as plain markdown you own and can
  export anywhere); Continue here claims the instant deterministic seed so the
  paste-compose endpoint has it
- step 7: prompt (a card with the agent glyphs and a "Copy prompt" button;
  `buildComposePrompt` prefills the prompt with the seed draft)
- step 8: paste (a textarea for the markdown the assistant returns;
  `/api/app/onboarding/compose` parses it with `parseCreedMarkdown` and maps
  the bodies onto the seed sections, then advances to the preview)
- step 9: preview the composed Creed (read-only render of the real editor)
  + "Get Creed" (Stripe checkout) when unpaid, or "Go to my Creed" when paid

Onboarding seeds only the five core sections (Identity, Goals, Work,
Preferences, Routines); Work and Routines start as light stubs the user's
assistant fleshes out, and the five optional sections grow in-app via
proposals. No OpenRouter key, no platform AI, no MCP. The deterministic
seed is the instant claimable fallback; the user's own assistant composes
the polished Creed off the copy-paste prompt.

### `/file` (the editor)
- left rail with section list, accent strips, lock icons, drag handles
- main canvas with the section the user clicked into
- top header: lock toggle, push/pull (GitHub), activity drawer trigger,
  `…` menu (rename / colour / duplicate / delete)
- review pill (top of canvas) when there are pending agent proposals
- inline accept-all card and per-section diffs
- quality ring + popover at the section level + overall
- right activity drawer (toggleable)

Mobile shell collapses the left rail to icons and the activity drawer
to an overlay.

### `/connections`
- Separate MCP and CLI setup cards switch the whole page between the two
  connection modes. No bearer tokens are shown anywhere.
- MCP mode shows the server URL, native per-agent setup actions, connection
  state, and the health dashboard.
- CLI mode shows `npx creed-cli`, then gives every agent card a copyable prompt
  and command for the shared terminal workflow. Its connection state is true
  only while the user has an unrevoked, unexpired CLI OAuth grant for the active
  Creed. Historical usage rows never count as a named active connection.
- below it, the **MCP health dashboard** (range control, KPI tiles,
  stacked read-volume chart, per-agent breakdown, section-coverage donut)

### `/settings`
- profile (avatar, name, email)
- agent edit behaviour (require-approval toggle)
- (no agent-credentials card: MCP is OAuth, so there is no token to copy
  or rotate; connect from `/connections`)
- AI (BYOK OpenRouter key, model select, estimated spend as a recharts
  bar chart stacked by model quality, over a 7d/30d/90d range)
- integrations (Google, GitHub)
- version control (repo + branch picker)
- danger zone (delete file, delete account)

## Priorities right now

1. **Make the public landing rock-solid.** Marketing copy + assets that
   make a non-developer instantly understand what Creed is.
2. **Make first-time onboarding feel high-trust.** Every question and
   example must read like it was written for them, not for a generic
   founder.
3. **Make agent connection trivially easy.** Add the MCP URL, click
   Allow, done. The OAuth connect flow should work first try across the
   listed agents (per-agent commands for Claude Code and Codex, one-click
   for Cursor, paste-the-URL for the rest).
4. **Keep the file feeling sacred.** Quality + curation UI should feel
   like editing a published essay, not triaging an inbox.

## What we are explicitly not building

- multi-user editing of a *personal* Creed (team collaboration lives only in
  the separate company Creed; a personal Creed is always one user, one file)
- for the company Creed specifically: custom roles, groups/departments,
  nested teams, multiple Creeds per company, per-block permissions, comment
  threads, approval chains, a shared god-mode MCP key, channels, or task
  management
- company-only section history, restore, or trash. Archive is the reversible
  hide path; delete is permanent. If section history returns, it should be
  shared across Personal and Company rather than added as a Company-only feature
- a chat assistant in the app
- a notes / wiki product
- platform-paid AI (we will never silently spend Creed's own AI key on
  user work - it's BYOK forever for AI features)
- a full git client (push / pull is manual; we don't autosync)
- mobile-native apps (the web app is the surface; we make mobile web
  excellent)

## Pricing

Three tiers, each paid tier billable two ways via a monthly/lifetime
toggle on `/pricing` (default Monthly):

- **Free** - self-host the open-source build, $0.
- **Personal** - $12/mo, $99/yr, or $199 lifetime. $5/mo usage allowance
  on subscriptions, or a one-time $20 usage credit for lifetime.
- **Company** - $129/mo, $999/yr, or $1,999 lifetime. 10 seats included,
  then +$12/mo, +$99/yr, or +$199 one-time per extra seat. $50/mo usage
  allowance on subscriptions, or a one-time $200 credit for lifetime. BYOK
  supported. One shared company Creed with roles (owner/admin/member),
  per-member section permissions, per-user MCP, invites, and owner-only
  billing.

Each card shows a large tier title coloured to its CTA (Open in border-grey,
Personal in blue, Company in amber). The Company card collapses Personal into
a single ticked "Everything in Personal" line, then lists the workspace
exclusives (shared Company Creed, per-employee Work Creeds, admin controls,
pooled company credits, priority support) as gold-star rows.

Strategy: the subscription is the trial - you subscribe to try Creed, then
buy it outright (lifetime) if you love it. **Ownership is terminal**: once
lifetime is bought the subscription is canceled and you can't go back to
monthly. Access requires a live subscription (active/trialing/past_due) OR
lifetime ownership. Onboarding's CTA starts the $7/mo sub with an "or own it
for $49" link. Billing is managed from a **Billing button in the profile
dropdown** (between the theme toggle and Log out), which opens a dialog with
plan/renewal, the Stripe Customer Portal ("Manage billing"), and the
upgrade-to-own action.

All tiers are BYOK or Creed-credits on OpenRouter - Creed never silently
spends the platform's own AI budget on a user's work.

Prices resolve from env (`STRIPE_PRICE_PERSONAL_MONTHLY`,
`STRIPE_PRICE_PERSONAL_LIFETIME` - falls back to legacy `STRIPE_PRICE_ID` -,
`STRIPE_PRICE_COMPANY_MONTHLY`, `STRIPE_PRICE_COMPANY_LIFETIME`). The webhook
must subscribe to `customer.subscription.updated/deleted` alongside
`checkout.session.completed`. Implementation: `lib/stripe.ts` +
`app/api/stripe/{checkout,webhook,portal,status}` + the
`(creed-app)/layout.tsx` gate (`hasActiveEntitlement`). The
`creed_entitlements` table carries `plan`, `billing_mode`,
`stripe_subscription_id`, `current_period_end`, `cancel_at_period_end`.

## Brand voice

Calm, precise, editorial. Like a quiet design publication, not a SaaS
landing page. Avoid:

- em dashes in product copy unless explicitly asked for
- hype words ("revolutionary", "AI-powered", "next-gen")
- all-caps UI labels
- exclamation marks
- emoji unless the user asked for them

Prefer:

- short, declarative sentences
- concrete nouns (tools, workflows, sections) over abstract claims
- one-clause sublines that explain the headline rather than restate it
