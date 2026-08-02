# Decisions

Durable decisions that future agents should not reopen casually.

## Product

- Creed is a curation product, not a notes app, memory feed, or dashboard.
- Personal Creed is always one user, one file.
- Company Creed is a separate shared workspace file with roles and permissions,
  not collaboration bolted onto a personal Creed.
- MCP is the preferred agent connection path. HTTP bearer APIs remain fallback.
- GitHub version control is manual push/pull, not autosync.
- AI features use BYOK or Creed credits through OpenRouter. Creed should not
  silently spend a platform-owned AI key on user work.

## Architecture

- The repository uses npm workspaces with one root lockfile. The main app lives
  in `apps/creed/`, the status site in `apps/status/`, and the published CLI in
  `packages/creed-cli/`.
- Creed and status deploy as separate Vercel projects from the same repository.
  Do not introduce Turborepo or extract shared packages until repeated use
  proves the boundary.
- `app/layout.tsx` stays static and does not load user state.
- User state is loaded in `components/creed/authed-providers.tsx` for app and
  onboarding layouts only.
- `/api/app/*` routes require `requireApiAuth()`.
- `/api/creed/*` routes verify hashed bearer tokens.
- `/mcp` uses OAuth access tokens, discovery metadata, and browser consent.
- `creed-cli` discovers the live MCP contract. Never duplicate Creed tool
  definitions or handlers in the CLI package.
- Token columns store ciphertext only. Hash for lookup, decrypt for use.
- Core state flows through `CreedState` and `CreedProvider`; avoid new global
  stores unless state must survive page navigation.

## Design

- Calm, premium, editorial, document-first.
- No em dashes in product copy, prompts, comments, or context docs.
- Reuse shared components and local patterns before inventing new UI.
- Mobile web should be genuinely good.
- Toasts are short, user-facing, and handled by `sonner`.

## Company

- Role model is owner, admin, member.
- Owner/admin can manage shared company context. Members can read and propose
  within their permissions.
- Seat billing is capacity-based. Removing a member does not automatically
  reduce purchased seats.
- Archive is reversible hide. Delete is permanent unless a shared history/trash
  feature is deliberately built for both Personal and Company.
- Company profile fallback avatar is the first character of the company name.

## Agent Work

- Code is canonical when docs drift.
- Update project context only for durable truths.
- Historical plans belong in Git history or the relevant issue, not durable
  agent context.
- Commits use lowercase titles and no AI co-author attribution.
