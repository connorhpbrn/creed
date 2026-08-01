# Current State

Last updated: 2026-07-14.

This is the fast current-truth file for fresh sessions. Read it after
`index.md` and before task-specific files.

## Product Shape

Creed is a hosted and open-source personal-context product with two active
workspace shapes:

- **Personal Creed:** one user, one file, agent proposals by default, optional
  direct edit mode.
- **Company Creed:** one shared company file with owner/admin/member roles,
  per-member section permissions, invitations, seat billing, pooled AI credits,
  team GitHub integration, shared activity, and company profile picture.

The app surfaces MCP as the primary agent connection path. HTTP token APIs still
exist for non-MCP fallback and internal compatibility, but the UI teaches MCP
OAuth: add the server URL, authorize in browser, done.

## Marketing / SEO / GEO surface

The public content surface was built out for search and AI-answer visibility:

- `/company` is a static Company-plan landing page; `/changelog` renders curated
  entries from `lib/marketing/changelog.ts`.
- Pricing is one source of truth in `lib/marketing/pricing.ts` (cards, the
  crawlable `PricingReference`, the Offer schema, and the llms files all read it).
  `/pricing` server-renders every plan and cycle plus a pricing FAQ, so all
  prices (including yearly/lifetime) ship in no-JS HTML.
- Every public page carries JSON-LD. Builders live in `lib/seo/structured-data.ts`
  (Organization, WebSite, SoftwareApplication with all seven offers, WebPage with
  optional dateModified, Article, FAQPage, BreadcrumbList). Shared FAQ content is
  in `lib/marketing/faq.ts`; render collapsible visible FAQ with the server
  `FaqSection` (native `<details>`, no JS) so answers are crawlable.
- `/llms.txt` maps the site + pricing + guides; `/llms-full.txt` is the full
  plain-text corpus (>3000 words), both generated from the shared content modules.
- `robots.ts` lists AI crawlers explicitly (GPTBot, ClaudeBot, PerplexityBot,
  Bingbot, etc.). IndexNow is wired: key at `/<key>.txt` (`lib/indexnow.ts`),
  `npm run indexnow` pings Bing from the live sitemap after deploys.
- OG/twitter share images are optimized JPEG (`app/opengraph-image.jpg`,
  `app/twitter-image.jpg`, ~270KB); schema and layout reference the jpg.

## Recently Shipped Behaviour

- `/bench` renders Creed Bench, a cost-versus-tool-use comparison. The
  repository-local harness under `bench/` runs 24 resettable synthetic tasks
  across every production MCP tool: eight single-tool, ten multi-tool, and six
  adversarial policy or restraint cases. The runner executes real OpenRouter
  tool-call loops against an isolated in-memory Creed and grades final state,
  required contract paths, policy mode, restraint, recovery, and answer
  quality. `npm run bench -- <openrouter-model-id>` is a one-trial development
  run; `--official --yes` requires a clean git worktree and runs low, medium,
  and high effort three times each. Interrupted runs can continue with
  `--resume`. Only complete official artifacts for the active benchmark version
  publish to the graph. Chart X is average cost per task attempt; tooltips also
  show total official-run cost. Local traces are gitignored, gzipped, and
  pruned (`bench:prune` / `bench:regrade`).

- The add-section composer shows six deterministic suggestions drawn from a
  broader preset pool. Existing section names and pending new-section proposals
  are excluded case-insensitively, and custom names cannot duplicate either.
  Custom sections start with body guidance only because the section title
  already supplies the visible heading.
- `creed-cli@0.2.2` is published on npm and maintained under
  `packages/creed-cli/`. It is a first-party Streamable HTTP MCP client with the
  same browser OAuth flow as other Creed connections, a blue terminal rendering
  of the Creed mark, an interactive command loop, exact one-shot tool calls,
  resources, prompts, JSON output, diagnostics, secure local credential storage,
  and OAuth token revocation. It discovers capabilities from live MCP list calls,
  so tool definitions are never duplicated in the package.
- `/connections` treats MCP and CLI as separate setup modes even though the CLI
  uses MCP as its transport. Selecting either setup card switches every agent
  card's instructions and actions. CLI mode always offers `Copy prompt` and
  `Copy command`, excludes the CLI identity from the MCP client stack, and hides
  MCP-only health, test, logs, and revoke controls. CLI connection state comes
  from a live, active-Creed-scoped OAuth grant check, not the historical MCP
  usage roster. It rechecks after load, Creed switches, window focus, and tab
  return so browser OAuth and terminal logout update without background polling.
  Per-agent commands include `--agent <id>`; the CLI sends that exact identity
  on every MCP request, and Creed binds each agent's status and last-seen time
  to the active OAuth token and Creed rather than projecting one CLI login onto
  every card. The MCP health view excludes CLI identities and their rollups so
  the two connection modes never leak into each other's status or analytics.

- Tab autocomplete in the section editor: press Tab once and one suggestion
  streams in as ghost text (a decoration, never document content), with a
  trailing Tab accept / Esc dismiss keycap hint. Tab accepts, Escape or typing
  dismisses, Cmd/Ctrl+ArrowRight accepts word by word, and empty sections get
  a short drafted opening, with a small ring spinner while the suggestion is
  in flight. Inside lists Tab completes; native indentation keeps Tab only at
  the very start of an item. The slash menu and # picker keep Tab while open. Implementation:
  `components/creed/extensions/tab-complete.ts` (ProseMirror plugin, priority
  1000), `app/api/app/ai/tab/route.ts` (text/plain stream, billed feature
  "tab" after the stream, rate limited 30/min), `lib/ai/tab.ts` (prompt +
  context truncation, import-free and covered by `tests/tab-completion.test.ts`).
  Model comes from `TAB_MODEL` (default `openai/gpt-oss-120b`, routed
  Cerebras > SambaNova > Groq with fallbacks). Only the press is metered;
  accept, reject, and keep-typing are free.
- Tab's marketing surface shipped with it: the landing "AI inside the file"
  Tab card runs a looping typed-prefix -> ghost-text -> accept demo (the
  coming-soon particle demo is gone), the governed-collaboration demos
  auto-loop on timers (clicks still work), the demo accept/reject buttons are
  text-only, and `/changelog` has a Tab entry.

- Activity rows filter no-op direct edits and no-op accepted edits, so clicks,
  editor init echoes, and wrapper-only rich-text churn do not create empty
  activity cards.
- Pending-proposal review diffs are deliberately isolated behind stable props:
  `ReviewPill` is memoized and its parent preserves item identity unless the
  proposal or its target section actually changes. Keep that boundary intact
  because word-level diffs over large Creed content are expensive enough to
  block editor input.
- Activity is a seven-day recent-collaboration feed, enforced both in Supabase
  cleanup and in state-loading queries. The rail keeps a lightweight first page
  mounted, adds more rows only on request, and computes word-level detail only
  after its row is expanded. Nexus stays mounted after idle prewarming so view
  toggles never recreate the editor tree.
- Company archive and restore persist through `/api/app/sections/[sectionId]`.
  Archive and restore should feel instant in the UI, with backend sync
  reconciling afterward.
- Company profile pictures upload from Settings, update live, and appear in
  dropdowns/member selectors. Company fallback avatars show the first character
  of the company name, not a generic pictogram.
- GitHub integration has connect, disconnect, and reauthorize paths. Company
  GitHub is separate from the user's personal GitHub connection.
- Company version-control repo and branch changes should update provider state
  optimistically. Selecting a repo also selects that repo's default branch so
  `/file` push is available immediately after a valid save.
- Company direct/proposal delete activity diffs use the real section body, not
  a synthetic `Keep X` to `Delete X` label. Rename, recolor, reorder, and
  archive remain compact metadata diffs.
- Section bodies are collapsible from the section header. The body should open
  and close smoothly without remounting heavy editor content.
- Inline graph tags are section references only. Typing `#` in the editor opens
  a section picker; selecting or matching a visible section such as `#goals` or
  `#Goals` resolves to a styled section chip. Non-section hashtags stay plain
  text. Agents should use these references sparingly to point between related
  sections, not for tools, apps, brands, or generic labels. Permanently deleting
  a section removes its rich-text reference chips from every surviving section
  across personal, company, proposal-accept, HTTP, and MCP deletion paths.
  Archiving deliberately preserves references because it is reversible.
- Rich-text section bodies support h2, h3, and h4 headings. In section-scoped
  markdown input, `##`, `###`, and `####` map to those editor headings. In full
  exported Creed markdown, headings are shifted down one level under the
  section title (`###`, `####`, `#####`) and shifted back on import.
- Personal and company onboarding seeds include a `Graph Tags` subsection in
  every starter section, and the copy-prompt instructions require assistants to
  preserve/create 2-4 real section references per section. This teaches the
  Obsidian-style related-section pattern from the first generated Creed.
- `/file` has a Nexus view toggle in the header, between GitHub push/pull and
  Activity. Nexus renders visible sections as an Obsidian-style force graph from
  those graph tags: section colours become node colours, valid tags become
  tethers, and fake tags are ignored. Hover shows the section name, unique
  connections out of all possible section connections, and score when one
  exists, separated by quiet dots. Selecting a node focuses its direct
  neighbourhood; click it again or press Escape to clear focus. Double-click
  navigation is deliberately absent because nodes are reserved for graph
  interaction; the section rail handles navigation. The settled graph layout
  and viewport survive view switches. Canvas rendering sleeps after the graph
  settles and wakes only for simulation or pointer/view changes, so Nexus does
  not consume a permanent animation frame loop.
- The root layout mounts `AppVersionNotifier`, which compares the build version
  embedded in the current page against no-store `/api/version`. When a newer
  deployment is available, it shows a persistent Sonner-stacked update card with
  Ignore and Refresh actions. In development, press `R` outside editable fields
  to preview it.

## Known Local Caveats

- The repo currently has no formal CI workflow. Local verification remains
  `npm run lint`, `npx tsc --noEmit -p .`, and `npm run build`.
- Local development defaults to `.next-runtime.nosync` because the maintainer's
  Desktop is managed by iCloud Drive. Keep high-churn local Next caches on a
  `.nosync` path so File Provider does not synchronize every Turbopack write.
  Production still defaults to `.next`; isolated verification builds can set
  `CREED_DIST_DIR` to their own `.nosync` directory.
- Next's `.next` generated types can get stale after interrupted builds. If
  type errors mention duplicate `.next/types/* 3.ts` or missing old validator
  files, remove `.next` and retry before changing source.
## Active Risk Areas

- `components/creed/file-screen.tsx`, `components/creed/creed-provider.tsx`,
  `lib/creed-backend.ts`, `lib/creed-data.ts`, and
  `components/creed/company-settings.tsx` are large, shared, and easy to
  regress. Read around the exact path before editing.
- Company behaviour often needs optimistic UI plus backend reconciliation.
  Prefer making the UI feel immediate, then syncing or reverting on failure.
- Activity and version rows are user-visible audit surfaces. Do not create
  empty rows, wrapper-only diffs, or generic "edited" rows when the operation
  has a clearer verb.

## What Fresh Agents Should Do

1. Read `index.md`.
2. Read this file.
3. Read only the task-relevant durable context named in `index.md`.
4. Use a matching repository skill from `.agents/skills/` when one exists.
5. Inspect the code path.
6. Make the smallest durable change.
7. Update project context only when the change creates durable truth.
