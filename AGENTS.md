# AGENTS.md

You're an AI coding agent picking up the Creed codebase. This file is the
short version of `README.md` + `CONTRIBUTING.md` written for you.

If a human is reading this, the document you want is [`README.md`](./README.md).

---

## What Creed is

One personal context profile every AI reads before answering the user.
10 sections (5 always-on, 5 optional). Plain Markdown content. Connected
agents read it and propose updates; users approve.

Creed is **not** a notes app, journal, chat memory store, or generic AI
wrapper. If a change would make it feel like one of those, it's the
wrong change.

---

## Stack

```
Next.js 16 (App Router, Turbopack)   React 19   TypeScript (strict)
Tailwind v4   shadcn/ui   Tiptap   Framer Motion / motion
Supabase (Postgres + RLS + auth)   OpenRouter (credits + BYOK)
```

---

## Repo layout

```
apps/
├── open/                     thin self-hosted Next.js composition
├── cloud/                    thin managed Next.js composition
└── status/                   independent status.creed.md Next.js app
packages/
├── creed-app/                shared product, marketing, routes, and AI
├── creed-open/               Open owner access and Open-only compositions
├── creed-cloud/              accounts, billing, Shared, and Cloud routes
├── creed-core/               domain types and pure Creed logic
├── creed-ui/                 reusable interface primitives
├── persistence/              Supabase clients and canonical migrations
└── integrations/             protocol and integration helpers
.agents/
├── context/            versioned internal context pack (read this first)
└── skills/             task-triggered agent workflows
```

Unless a path explicitly starts with `apps/` or `.agents/`, shared application
paths in this file are relative to `packages/creed-app/`.

The four "god" files to be careful in:
- `packages/creed-app/components/creed/file-screen.tsx`, the editor
- `packages/creed-app/lib/creed-backend.ts`, shared Supabase glue
- `packages/creed-core/creed-data.ts`, types, agent contract, and seed
- `packages/creed-app/components/creed/settings-screen.tsx`, settings tabs

---

## Reading order before edits

1. `.agents/context/index.md`
2. The task-relevant files in `.agents/context/` listed by `index.md`
3. The exact code path you're about to change

If `.agents/context/` is unexpectedly missing, read `README.md` +
`CONTRIBUTING.md` + `SECURITY.md` and then this file end-to-end.

---

## Repository skills

When a skill is delivered as `/name` or `$name`, treat it as an explicit request
to load that skill. A direct natural-language request for the same operation is
equivalent. Slash-command support varies by client, so skills must never depend
on `/name` as their only invocation path. Invocation loads the workflow but does
not bypass its permission, confirmation, or safety gates.

- Before creating any Git commit, always read and apply
  `.agents/skills/tasks/commit/SKILL.md`, even when the current agent does not
  discover repository skills automatically.
- Before an intentional Open, Cloud, CLI, or Status product release, always
  read and apply `.agents/skills/tasks/semver/SKILL.md`. A commit targeting
  `main` is not automatically a product release. The skill owns SemVer,
  release metadata, and release copy; it does not grant commit, tag, push, or
  publication authority.
- Read and apply `.agents/skills/tasks/comment/SKILL.md` whenever adding,
  rewriting, or auditing source-code comments. Comments must explain durable,
  non-obvious intent rather than narrate syntax or preserve implementation
  history.
- Read and apply `.agents/skills/tasks/refactor/SKILL.md` whenever the user asks to
  refactor, restructure, simplify, extract, consolidate, split, or clean up
  existing code.
- After meaningful code edits and before claiming completion, always read and
  apply `.agents/skills/tasks/review/SKILL.md`. Apply it in read-only mode when
  the user requested review without implementation.
- Read and apply `.agents/skills/tasks/copy/SKILL.md` whenever writing, editing,
  or reviewing product, marketing, onboarding, interface, error, toast, prompt,
  documentation, pricing, or other user-facing language.
- Read and apply `.agents/skills/tasks/migrate/SKILL.md` whenever changing
  Supabase schema, persisted data shapes, indexes, functions, triggers, grants,
  storage policies, or RLS.
- Read and apply `.agents/skills/tasks/debug/SKILL.md` whenever diagnosing or
  fixing a bug, regression, failed check, unexpected behavior, or performance
  problem.
- Read and apply `.agents/skills/tasks/release/SKILL.md` only when the user
  explicitly asks to prepare or execute a release, deployment, publication, or
  tag.
- After meaningful work, make one quiet skill-maintenance check. Read
  `.agents/skills/authoring/create/SKILL.md` when a concrete repeated
  workflow may deserve a new skill, and read
  `.agents/skills/authoring/update/SKILL.md` when usage or repository
  changes expose a stale or ineffective skill. When the opportunity was not
  explicitly requested, offer the narrow create or update with a reason and wait
  for approval. If no durable opportunity exists, say nothing about skills.
- Read the matching authoring skill immediately whenever the user explicitly
  asks to create or update a repository skill.

---

## Core invariants

These are non-negotiable. Don't cross them without asking.

1. **`requireApiAuth()` on every `/api/app/*` route.**
2. **Hashed-token verification on every `/api/creed/*` and `/mcp` route.**
3. **No personal info in source.** Email / handles / names go through
   `lib/branding.ts` env vars.
4. **Marketing routes never read user state.** The root layout skips
   `loadCreedState` based on the `x-pathname` header set by `proxy.ts`.
   Don't reintroduce a fan-out without that gate.
5. **Don't touch `lib/creed-data.ts:collaborationRules`** without
   thinking carefully. It ships to every connected agent on every
   read. Test across at least 2 models if you do.
6. **No em dashes in product copy** unless the user explicitly asked for
   them. Em dashes in code comments are fine.
7. **No `console.log` in committed code.** Use `lib/observability.ts`
   `log.info / warn / error` for server-side logging.
8. **No new dependencies without justification** in the commit message.
9. **TypeScript strict, no `any`.** `unknown` + narrowing instead.
10. **Default to server components.** Add `"use client"` only when a
    hook, browser API, or interactive event genuinely needs it.

---

## Working defaults

### Temporary working documents
- Put one-off plans, audits, scratch reports, and similar agent-created
  Markdown in the repository-root `disposable/` folder.
- `disposable/` is local and gitignored. Keep durable product, architecture,
  and contributor documentation in its canonical tracked location.

### Style + motion
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Durations: 160ms (popovers, dropdowns), 200ms (chevrons), 220-280ms (accordions).
- Tailwind v4 important syntax: **postfix** `text-red-500!`, not prefix.
- Inline `style` is acceptable when Tailwind merge isn't deduplicating
  arbitrary classes correctly.

### Fetches
- Server fetches in route handlers / server components.
- Client fetches go through `lib/ai/quality-runner.ts`-style module
  singletons when state must survive navigation.
- No `next/dynamic({ ssr: false })` for heavy public-route components
  because it is known to hang in Next 16 dev.

### Animations
- `framer-motion` (older imports) and `motion/react` (newer) are the
  same library aliased. Match the surrounding file.
- Don't double up `layout` and `AnimatePresence mode="popLayout"`;
  pick one.
- Don't reintroduce `contentVisibility: auto`. It breaks the document
  `load` event.

### Images
- Default Next/Image quality (75) is fine for backgrounds. Don't use
  `quality={100}` without confirming `next.config.ts:images.qualities`
  allowlists it AND restarting the dev server.
- Marketing page MediaSlots show a clean placeholder card when an
  image file is missing. See the comment block at the top of
  `MediaSlot` in `components/marketing/below-hero-sections.tsx` for
  the canonical naming convention.

---

## Verification before claiming "done"

```bash
npm run typecheck       # zero new type errors across workspaces
npm run lint            # zero new ESLint errors
npm test                # every workspace test suite passes
npm run build           # production build must succeed
```

If you touched a Supabase migration, run `supabase db reset` from
`apps/open/` against a local Supabase before pushing. Schema-only PRs that
haven't been applied will not be merged.

If you touched the agent contract, paste the universal connection
prompt into Claude Code or Codex and confirm the agent reads + proposes
a sample update.

---

## Reply style

- Lead with the answer or the action.
- One short paragraph of context, max.
- Bullet lists for multiple changes; prose for single changes.
- Quote file paths and identifiers in backticks.
- No emoji unless the user asked for them.
- No filler ("I hope this helps!", "Let me know if you need anything else").

---

## When you finish a task

Decide:
- Did I learn something durable about the product, architecture, or
  repo conventions? → update the relevant file in `.agents/context/`.
- Did I leave the code worse in some small way (a `TODO`, a duplicated
  helper, a missing edge case)? → fix it now or call it out.
- Did I create a new file or pattern? → make sure it's discoverable
  (sensible name, top-of-file comment, exported from where it should
  be).

If all three are "no", just stop. Don't add a postscript.

---

## What "done" looks like

- TypeScript clean.
- No new ESLint errors (warnings on pre-existing patterns are fine).
- The user's intent is met.
- The codebase is no worse than before, and ideally a little better.

---

## A word on legacy paths

Creed pivoted from a developer-context product to a personal-context
product. Some legacy code paths still reference the old framing:
`conventions` section ID, "operating principles" naming, chips/rules/
focus payload variants in the markdown parser.

When you find one of these, leave it alone unless you're explicitly
cleaning up legacy paths. Removing them too early breaks existing
imported user data. The plan is to gate them behind a feature flag
for one release, then drop in a follow-up.

---

If anything here conflicts with the code: **the code is canonical.**
Update this file in the same pass.
