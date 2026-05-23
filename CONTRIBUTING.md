# Contributing to Creed

Thanks for the interest. A few principles up front, then the practical
bits.

## What Creed is, in one paragraph

Creed is one personal context file every AI you talk to reads before
answering. It's not a notes app, not a chat log, not a memory dump.
The whole product depends on the file staying small, current, specific,
and worth reading. If a change makes Creed feel more like a journal,
dashboard, or generic AI wrapper, it's probably the wrong change.

If you're an agent reading this, also read [`AGENTS.md`](./AGENTS.md)
before you make changes.

## Before you open a PR

1. **Open an issue first** if it's a non-trivial change. Half-finished
   PRs are friction for everyone. A two-line "I'm thinking about doing
   X — does that fit?" issue avoids it.
2. **Run the project locally** (see `README.md`). If you can't reproduce
   the behaviour you're changing, you can't be sure your change works.
3. **Read the file you're touching, not just the function.** Most files
   in this repo are organised top-down — types, then helpers, then the
   exported component / function — and changing a helper without
   reading the consumer at the bottom usually breaks something subtle.
4. **Don't add dependencies casually.** If you're adding a new package,
   say why in the PR description. We'd rather write a small helper than
   pull in a 200KB transitive dependency tree.

## What to verify before sending the PR

```bash
npm run lint          # ESLint must be clean (or no worse than main)
npx tsc --noEmit -p . # zero new type errors
npm run build         # production build must succeed
```

If you touched a route under `/app/api/`, exercise it locally with
`curl` or the app and confirm the audit log entry shows up
(`creed_audit_events` table) where appropriate.

If you touched a Supabase migration, run `supabase db reset` against a
local Supabase before pushing — schema-only PRs that haven't been
applied will not be merged.

## Coding style

We follow the surrounding code rather than a strict written style guide,
but a few things are non-negotiable:

- **TypeScript everywhere.** No `.js` files. Avoid `any` — `unknown`
  with a narrowing check is almost always better.
- **Server vs client components**: default to server. Add `"use client"`
  only when a hook, browser API, or interactive event genuinely needs it.
- **No em dashes in product copy** unless they were already there.
  (Hyphens are fine. Em dashes in code comments are fine.)
- **No unnecessary all-caps in UI text.** `BUTTON LABEL` reads as
  shouting; `Button label` reads as a button label.
- **Tailwind classes**: prefer the project's CSS-variable tokens
  (`var(--creed-text-primary)`, `accentColorMap[...]`) over raw hex.
- **No console.log in committed code.** Use `lib/observability.ts`'s
  `log.info / warn / error` if you need server-side logging.
- **API routes use `requireApiAuth`** unless they're explicitly
  unauthenticated (and you've thought hard about why).

## Architecture cheatsheet

- `app/(creed-app)/` — the authenticated product (`/file`,
  `/connections`, `/settings`).
- `app/` (top level) — public marketing routes, `/auth/callback`,
  `/onboarding`, API handlers.
- `app/api/app/*` — session-authenticated user APIs.
- `app/api/creed/*` and `app/mcp/route.ts` — token-authenticated agent
  APIs.
- `components/creed/*` — product UI (editor, sidebars, dialogs).
- `components/marketing/*` — public-site UI.
- `components/ui/*` — shadcn-style primitives.
- `lib/creed-data.ts` — shared types + section constants.
- `lib/creed-backend.ts` — Supabase reads / writes for product state.
- `lib/ai/*` — OpenRouter calls, prompt construction, model catalog.
- `supabase/migrations/*` — every schema change goes here.

For deeper notes, see the comment block at the top of each file or
`AGENTS.md`.

## Tests

There are no unit tests yet. If you write one, put it next to the
module under test (`foo.ts` → `foo.test.ts`) and add a script to
`package.json`. PRs that add a test for a tricky code path are
especially welcome.

## Reporting a security issue

Don't open a public issue. See [`SECURITY.md`](./SECURITY.md).

## Conduct

Be kind, be specific, and assume good faith. We'll add a more formal
code of conduct if the project grows enough to need one.
