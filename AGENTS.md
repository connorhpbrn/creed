# AGENTS.md

You're an AI coding agent picking up the Creed codebase. This file is the
short version of `README.md` + `CONTRIBUTING.md` written for you.

If a human is reading this, the document you want is [`README.md`](./README.md).

---

## What Creed is

Creed is a shared Markdown document workspace for invited users. Personal Creed
profiles and the old 10-section profile contract have been removed. Connected
agents work through shared documents only.

The workspace is **Supabase-only**: Supabase is the source of truth, and
versioning and review happen inside Creed via hunk-level proposals and an
append-only version history. There is no GitHub syncing for documents
(push/pull/publish were removed).

Agents working through MCP must:
- list/read shared documents through the Creed MCP document tools;
  `creed_list_documents` returns every non-archived document and folder across
  the whole workspace regardless of nesting (each document reports its
  `folderId`/`path`); use `creed_get_folder` (by id or slug) to inspect one
  folder plus the child folders and documents it directly contains;
- read current comments before changing a document when review context matters;
- update document content with `expectedRevision` and re-read on conflicts;
- use document metadata tools for status/type/stage/lifecycle/priority/size;
- expect that document content edits are governed by the workspace Agent edit
  policy: a change is applied directly, split into pending hunk proposals for a
  workspace member to approve, or rejected outright. Read the `outcome` and
  `proposalCount` in the tool result to know what happened; do not assume an
  edit was applied;
- add comments for questions, uncertainty, review notes, and suggested changes
  that should not be applied silently; comments you add through MCP are recorded
  as private pending proposals that the user reviews and approves before anyone
  else sees them, and once approved they appear as the user's own comment (never
  labelled as an agent);
- mention a user only when their attention is actually needed (a mention in a
  pending comment only notifies once the user approves it).
- make targeted edits only: read the latest document, preserve unchanged
  Markdown exactly, and do not re-upload, reorder, or reformat a whole document
  for a small change;
- compare the intended content with the latest read before calling any mutation
  tool. If there is no visible change, do not submit a proposal or edit; the MCP
  server rejects no-op changes.

Documents can reference other documents and folders inline. Use the slug from
`creed_list_documents` / `creed_read_document`:

- `[[doc:SLUG]]` inline chip linking a document; `[[folder:SLUG]]` links a folder.
- `![[doc:SLUG]]` (or `![[folder:SLUG]]`) on its own line renders a full-width
  card with the target's title, description, and property pills.

Prefer a reference over pasting another document's contents so links stay live.
The token round-trips through Markdown, so it survives edits by both humans and
agents. In-editor, users insert the same references with `@` or the "Reference
document" slash command.

External URLs render in three shapes (mirroring Notion's paste-link menu),
which round-trip as reserved-label Markdown links:

- `[mention](https://url)` — inline favicon + title chip;
- `[bookmark](https://url)` on its own line — a card with title, description, favicon;
- `[embed](https://url)` on its own line — a full-width sandboxed-iframe preview.

A plain `[label](https://url)` stays an ordinary hyperlink. In-editor, pasting a
bare URL shows a picker (Link / Mention / Bookmark / Embed) — there is no slash
command. Link metadata is fetched server-side by `app/api/app/link-preview`
(SSRF-guarded) and cached client-side in `lib/link-preview-index.ts`; the nodes
live in `components/creed/extensions/url-reference.tsx` and the tokens in
`lib/url-reference.ts`. Parsing/serialization is in `lib/rich-text.ts` and
`lib/creed-data.ts` alongside the doc-reference and table handling.

Document content is Markdown with a rich component set that round-trips through
the Tiptap editor: `#`/`##`/`###` headings, bullet/numbered lists, `>` callouts,
`---` dividers, inline `#tags`, fenced code blocks, GFM pipe tables, and
```mermaid diagrams. The document title is metadata; do not repeat it as an H1
in the body unless the user explicitly asks. Headings drive outline/navigation
only; they do not create section records, and agents must not write
`<!-- creed:depth -->` markers. A document may start at H2; the sidebar treats
the highest heading level present as the root and indents deeper headings from
there. Both agents (via MCP) and users (via the editor's slash menu) choose the
clearest shape for the content:

- a **table** (`| A | B |` over a `| --- | --- |` delimiter row) for comparing
  items across shared attributes;
- a ```mermaid **flow diagram** (`flowchart`, `sequenceDiagram`, `erDiagram`,
  `journey`) for branching processes, sequences, and relationships - draw the
  branches, don't just list steps;
- lists for simple enumerations.

Each non-touching content change becomes its own proposal hunk. Consecutive word
changes inside the same range stay one proposal. Accepted proposal families are
shown grouped in version history; expanding a family reveals the individual
hunks and selecting one shows only that diff.

Tables and mermaid blocks parse in `lib/rich-text.ts` (`markdownToRichHtml`) and
serialize back through `lib/creed-data.ts` (`richHtmlToMarkdown`); the editor
registers them via `@tiptap/extension-table`'s `TableKit` and `MermaidBlock`.
Keep those two functions in lockstep if you touch either component.

Do not attempt to push, pull, or publish shared documents to GitHub — documents
live only in Supabase.

---

## Stack

```
Next.js 16 (App Router, Turbopack)   React 19   TypeScript (strict)
Tailwind v4   shadcn/ui   Tiptap   Framer Motion / motion
Supabase (Postgres + RLS + auth)
```

---

## Repo layout

```
app/                Next routes
├── (creed-app)/    signed-in product: /dashboard, /documents, /file, /connections, /settings
├── api/app/        session-authed APIs (requireApiAuth)
├── api/creed/*     token-authed agent APIs (hash compare)
├── auth/callback/  OAuth callback
├── mcp/route.ts    MCP protocol endpoint
├── accept-invite/  invite completion
├── login|reset-password/   auth screens
├── layout.tsx      root layout — no user state
└── proxy.ts        sets x-request-id + x-pathname

components/
├── creed/          product UI (editor, sidebars, settings)
├── marketing/      shared auth visual helpers
├── auth/           sign-in / invite / password screens
└── ui/             shadcn primitives + Phosphor icon adapter

lib/
├── creed-data.ts             types, section IDs, accent maps, agent contract
├── creed-backend.ts          Supabase reads/writes
├── creed-markdown.ts         Markdown ↔ section parser
├── section-hierarchy.ts      section nesting rules (depth 0-2, indent/collapse/insert)
├── workspace-settings.ts     workspace edit-policy (human/agent: cant-edit|propose|direct)
├── document-editing.ts       policy router + apply path for shared-document edits
├── document-versions.ts      append-only shared-document version history
├── rich-text.ts              Tiptap content normalization
├── supabase/{server,browser,admin}.ts        per-runtime clients
├── secret-crypto.ts          AES-256-GCM token storage
├── audit-log.ts              creed_audit_events writer
├── rate-limit.ts             per-token rate limiting
├── observability.ts          structured log helpers
├── api-auth.ts               requireApiAuth helper
└── branding.ts               env-driven contact / social URLs

supabase/migrations/    canonical schema (forward-only, idempotent)
public/                 static assets
project-context/        gitignored — internal context pack (read this first)
```

The four "god" files to be careful in:
- `components/creed/file-screen.tsx` (~2700L) — the editor
- `lib/creed-backend.ts` (~1750L) — Supabase glue
- `lib/creed-data.ts` (~1620L) — types + agent contract + seed
- `components/creed/settings-screen.tsx` (~1570L) — settings tabs

---

## Reading order before edits

1. `project-context/index.md` (gitignored — exists locally for the maintainer
   and any agent working in the repo)
2. The other files in `project-context/` listed by `index.md`
3. The exact code path you're about to change

If `project-context/` is missing (you cloned a public copy without it),
read `README.md` + `CONTRIBUTING.md` + `SECURITY.md` and then this file
end-to-end.

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
5. **Don't touch `lib/creed-data.ts:buildAgentReadPayload`** without
   thinking carefully. It ships the workspace contract to every connected agent
   on every MCP read. Keep it aligned with the MCP tool list and document edit
   policy.
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

### Style + motion
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Durations: 160ms (popovers, dropdowns), 200ms (chevrons), 220-280ms (accordions).
- Tailwind v4 important syntax: **postfix** `text-red-500!`, not prefix.
- Inline `style` is acceptable when Tailwind merge isn't deduplicating
  arbitrary classes correctly.

### Fetches
- Server fetches in route handlers / server components.
- Client fetches go through `lib/document-reference-index.ts`-style module
  singletons when state must survive navigation.
- No `next/dynamic({ ssr: false })` for heavy public-route components
  — known to hang in Next 16 dev.

### Animations
- `framer-motion` (older imports) and `motion/react` (newer) are the
  same library aliased. Match the surrounding file.
- Don't double up `layout` and `AnimatePresence mode="popLayout"` —
  pick one.
- Don't reintroduce `contentVisibility: auto`. It breaks the document
  `load` event.

### Images
- Default Next/Image quality (75) is fine for backgrounds. Don't use
  `quality={100}` without confirming `next.config.ts:images.qualities`
  allowlists it AND restarting the dev server.
- Auth scenery images live under `public/assets/landing/scenery/` and render
  through `components/marketing/scenery-image.tsx`.

---

## Verification before claiming "done"

```bash
npx tsc --noEmit -p .   # zero new type errors
npm run lint            # zero new ESLint errors
npm run build           # production build must succeed
```

If you touched a Supabase migration, `supabase db reset` against a
local Supabase before pushing — schema-only PRs that haven't been
applied will not be merged.

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
  repo conventions? → update the relevant file in `project-context/`.
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
- The codebase is no worse than before — and ideally a little better.

---

## A word on legacy paths

Creed pivoted from a developer-context product to a personal-context
product. Some legacy code paths still reference the old framing —
`conventions` section ID, "operating principles" naming, chips/rules/
focus payload variants in the markdown parser.

When you find one of these, leave it alone unless you're explicitly
cleaning up legacy paths. Removing them too early breaks existing
imported user data. The plan is to gate them behind a feature flag
for one release, then drop in a follow-up.

---

If anything here conflicts with the code: **the code is canonical.**
Update this file in the same pass.
