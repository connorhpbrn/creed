<div align="center">

# Creed

**One file across every agent.**

Your personal context, written once and kept polished by your agents — so every AI you talk to knows you instantly.

[Website](https://creed.md) · [Docs](https://creed.md/docs) · [Privacy](https://creed.md/privacy) · [Stack](https://creed.md/stack)

</div>

---

## What is Creed?

Anyone using AI seriously hits the same tax: re-explaining themselves every chat, every tool, every session.

Creed kills that tax with one file.

You write yourself down once — your role, goals, preferences, routines, the people who matter, anything you want every AI to know — and connected agents read that file before they answer you. As they learn new things about you, they propose updates. You approve the good ones. The file sharpens over time.

It's not a notes app. It's not a journal. It's not a memory dump. It's a curated personal-context profile, sized to fit on one page, that travels with you across Claude, ChatGPT, Codex, Cursor, OpenClaw, Hermes, OpenCode, and any custom agent you wire up.

---

## Why Creed exists

There's a small set of tools every AI-native person re-invents for themselves: a "system prompt" that grows in their notes, a `CLAUDE.md` they paste into every project, a list of "things ChatGPT keeps getting wrong about me." Creed is what happens when you decide that file should be **a real product**, not a hack.

The file is plain Markdown. The app exists to:

- help you write the first draft (4-vibe onboarding tuned to who you are)
- score quality and surface gaps (BYOK OpenRouter — never our tab)
- let agents read and propose updates without you copy-pasting
- keep one canonical version across every tool you use

If you've ever maintained a personal `creed.md` by hand, this is that, with the boring parts solved.

---

## How it works

```
┌──────────────────────┐         ┌────────────────────┐
│  You — onboarding    │ ──────► │  Your Creed file   │
│  (one short pass)    │         │  10 sections, MD   │
└──────────────────────┘         └─────────┬──────────┘
                                           │
                              ┌────────────┴────────────┐
                              ▼                         ▼
                  ┌─────────────────────┐    ┌──────────────────────┐
                  │  Agent reads it     │    │  Agent proposes an   │
                  │  before answering   │    │  update; you approve │
                  └─────────────────────┘    └──────────────────────┘
```

The file has 10 sections — five core, five optional — sized so the whole thing reads in under a minute:

| Always-on   | Optional      |
|-------------|---------------|
| Identity    | Beliefs       |
| Goals       | Constraints   |
| Work        | People        |
| Preferences | Health        |
| Routines    | Context       |

Every section is agent-writable. Every change goes through the review (or direct-edit, if you trust it).

---

## Status

Creed is in active development. Free while pricing is shaped around real user feedback. The likely paid tier later wraps heavy AI use (synthesis, quality, model spend) — but Creed will stay BYOK on AI, so you control the cost.

---

## Run it locally

You'll need:

- **Node.js 20+**
- **a Supabase project** (free tier is fine)
- **an OpenRouter API key** (only needed for the AI-powered features — onboarding synthesis, quality analysis, refinement)

### 1. Clone and install

```bash
git clone https://github.com/<your-fork>/creed.git
cd creed
npm install
```

### 2. Configure environment

Copy the template and fill in values:

```bash
cp .env.example .env.local
```

`.env.example` documents every variable Creed reads. The minimum to boot the app:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
SUPABASE_SECRET_KEY=<your-supabase-service-role-key>
CREED_ENCRYPTION_SECRET=<base64-encoded-32-byte-secret>
```

Generate the encryption secret with `openssl rand -base64 32`.

Optional (branding shown in the public chrome, payments, GitHub integration, feedback widget) are all documented inline in `.env.example` — copy whichever ones you want to enable.

### 3. Run database migrations

```bash
# install Supabase CLI if you don't have it: brew install supabase/tap/supabase
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates every table Creed needs (sections, proposals, activity, tokens, MCP, GitHub, AI usage, audit log, rate limits, Stripe entitlements) plus the row-level-security policies that make sure users only ever see their own data.

### 4. (Optional) Wire up Stripe

The hosted Creed gates `/file` and `/onboarding` behind a one-time $49 entitlement. For local development you can either:

- **Skip it** — leave `STRIPE_*` env vars unset. The app still boots; signed-in users without an entitlement row are redirected to `/pricing` by the layout guard. Useful when you only want to work on marketing pages or non-paid flows.
- **Run the full flow** — add the four `STRIPE_*` variables from `.env.example` using your sandbox/test keys, then in a second terminal run:
  ```bash
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  ```
  Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`. The webhook auto-grants entitlements when test payments complete.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Google and you'll land on `/pricing` (or `/onboarding` if you've granted yourself an entitlement row manually for development).

### Deploying your own

If you're standing up a separate hosted Creed (not contributing back to this repo):

- Set `NEXT_PUBLIC_SITE_URL` to your deployed origin so OAuth callback and Stripe redirect URLs resolve correctly.
- Set `CREED_CSP_ENFORCE=1` in production once you've watched one deploy cycle in Report-Only mode.
- The Stripe webhook signing secret in production differs from your local `whsec_…` — create a webhook endpoint in the live Stripe dashboard pointing at `https://<your-domain>/api/stripe/webhook` and use that secret.
- The dormant example agent prompts in `lib/creed-data.ts` reference `https://creed.md` purely as illustration; real users see URLs derived from your `NEXT_PUBLIC_SITE_URL` at request time.

---

## Connect an agent

Once you have a Creed, copy the setup prompt from `/connections` into your agent of choice. We have first-class flows for:

- Claude Code
- Codex
- OpenClaw
- Hermes
- OpenCode
- Custom Agent (any client that speaks MCP or HTTP)

MCP is the preferred path. The agent installs Creed as an MCP server, verifies it can read your file, and starts shaping replies around it from the next message forward. API fallback exists for clients that don't speak MCP yet.

---

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **Tiptap** for the rich-text editor
- **Framer Motion** for the calmer-than-normal interactions
- **Supabase** for auth, Postgres, RLS, realtime
- **OpenRouter** for BYOK AI

A complete tour of the public stack lives at [creed.md/stack](https://creed.md/stack).

---

## Repository tour

```
app/                    Next.js routes (marketing, app, API)
├── (creed-app)/        signed-in product (/file, /connections, /settings)
├── api/                session-authed and token-authed APIs
├── auth/callback/      OAuth callback
├── home/               public landing
├── onboarding/         7-step onboarding flow
└── proxy.ts            request-id + path-aware request forwarding

components/
├── creed/              the product UI
├── marketing/          the public site
├── auth/               sign-in / hero
└── ui/                 shadcn primitives + animated icons

lib/
├── creed-data.ts       types, section IDs, agent contract
├── creed-backend.ts    Supabase reads/writes
├── ai/                 OpenRouter, model catalog, quality
├── onboarding/         the synthesizer pipeline
└── supabase/           browser + server clients

supabase/migrations/    canonical schema
public/                 static assets
```

---

## Commands

```bash
npm run dev      # local dev server (Turbopack)
npm run build    # production build
npm run lint     # ESLint
npm run start    # serve a built app

npx tsc --noEmit -p .   # typecheck only
```

---

## Contributing

We'd love contributions. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a PR — it's short and saves both of us time.

If you're an AI agent picking up this codebase to make changes, read [`AGENTS.md`](./AGENTS.md) first instead. It's the same information, written for you.

---

## Security

Found a vulnerability? Please don't open a public issue. See [`SECURITY.md`](./SECURITY.md) for the responsible-disclosure path.

---

## License

[MIT](./LICENSE).
