# Repo Audit — post-document-workspace (turn 2)

Date: 2026-07-01 14:22
HEAD: 022b8d0 (+ working-tree fixes this turn)
Scope: whole repo, with focus on auth/tenancy invariants, admin-client (RLS
bypass) usage, migration integrity, and lingering legacy surfaces after the
AI/GitHub-sync removal. Builds on `.audits/full-repo-audit.md` (turn 1) and
`.reviews/full-working-tree-diff-review.md`.

## Result

Pass after one fix (A1). No open Critical/High findings.

## Findings

### A1 — High (deployment integrity) — RESOLVED
Two migrations shared the exact version prefix `20260701120000`
(`_add_workspace_proposal_versioning.sql` and `_drop_ai_byok_and_quality.sql`).
Supabase records applied migrations keyed by that version (PK), so a fresh
`supabase db push` (the documented self-host path) could reject or skip the
second migration, leaving either the proposal/version tables uncreated or the
old AI tables undropped.
- Verified both are fully idempotent (`create table if not exists` / `drop ...
  if exists`) and touch disjoint objects.
- Fix: `git mv` the drop migration to `20260701120500_drop_ai_byok_and_quality.sql`.
  Order preserved (add tables, then drop legacy), unique versions restored.

### A2 — Observation (naming) — ACCEPTED
`lib/stripe.ts` no longer touches Stripe; it is a documented self-hosted
`hasActiveEntitlement → true` shim consumed by the authorize routes. Renaming to
`entitlements.ts` would churn 2 imports for cosmetic gain. Left as-is; clearly
commented.

## Verified clean (repo-wide)

- **Auth:** every `app/api/app/*` route calls `requireApiAuth`/`requireApiJson`
  (0 missing). All `app/api/creed/*` routes are Bearer-token only. `/mcp` uses
  hashed-token verification.
- **Admin-client / RLS bypass:** all document routes use the service-role client
  behind `requireApiAuth`, consistent with the single-shared-workspace model
  (all authed members may access all documents by design — accepted deviation
  O1-4, revisit under multi-tenancy).
- **Per-user IDOR:** notifications, dashboard preferences, account, and mcp
  clients all scope by `auth.user.id`; `markNotificationRead` filters on both
  `id` and `user_id`.
- **Legacy surfaces:** `app/payment/` empty (no routes); no live Stripe SDK,
  webhook, or key usage; profile `creed.md` GitHub sync (`/api/app/github/*`)
  intentionally retained.

## Carried to Fallow pass (task 4)

- R4 (dead GitHub-pull branch in `components/creed/file-screen.tsx`).
- Lint-reported unused exports (creed-data, rich-text, creed-backend, mcp-health,
  observability, supabase/server, creed-prompts) — triage as dead vs legacy.
- Known health hotspots (file-screen, settings-screen, creed-backend,
  shared-documents, mcp/route, creed-data) — structural, advisory.

## Non-audit working-tree note

`components/creed/shell.tsx` carries an unrelated live edit (adds a Dashboard
icon button to the utility row; duplicates the existing nav item). Compiles
(`Link`/`LayoutGrid` imported). Folded into the final review, not reverted.
