# Document Workspace Diff Review

Date: 2026-07-01
Scope: local working tree plus whole-repo review touchpoints for shared documents, document-mode `/file`, GitHub document sync, MCP document tools, BYOK/config cleanup, route auth, and deployment config.

## Outcome

Status: issues found and fixed. No open blocking findings remain.

## Findings Fixed

### B1 - Dirty document publish could continue after a failed save

Severity: high

Fix:
- `handleSaveDocument()` now returns the saved document or `null` on failure.
- `handlePublishDocument()` aborts when the dirty save fails instead of publishing stale content.
- Successful saves and publishes refresh local sync/status keys so the GitHub status badge does not stay stale.

### B2 - Document GitHub sync mixed commit SHA and blob/content state

Severity: high

Fix:
- `pushGitHubFile()` now returns the GitHub content/blob SHA when available.
- Document push conflict detection compares remote content hash against `lastSyncedContentHash`, avoiding false conflicts from old commit-SHA rows.
- Shared document publish stamps the synced row only if the pushed revision still matches.

### B3 - Document pull/apply trusted client-provided remote content

Severity: high

Fix:
- Document pull/apply now re-fetches the mapped GitHub file server-side.
- Apply requires the previewed remote SHA and rejects if GitHub changed since preview.
- A shared `lib/document-github.ts` helper centralizes mapped-document loading and remote fetches for document GitHub routes.

### B4 - Archived shared documents could still be updated by content writes

Severity: medium

Fix:
- `updateSharedDocumentContent()` now filters `archived_at is null`, matching metadata and pull writes.
- `markSharedDocumentSynced()` also excludes archived rows and keeps the revision guard.

### B5 - Shared document frontmatter was not the canonical API/GitHub surface

Severity: medium

Fix:
- Added `lib/document-markdown.ts` as the canonical document frontmatter parser/serializer.
- Document create/update/pull split YAML frontmatter into property columns while keeping `content` body-only.
- MCP `creed_read_document` returns `contentMarkdown` with frontmatter, and `creed_update_document` accepts that same representation.

### B6 - Active runtime config still carried removed payment/credits defaults

Severity: medium

Fix:
- Removed stale Stripe and platform-credit env examples.
- Removed Stripe origins and removed payment route cache entries from active Next config.
- Removed the dead Vercel Stripe webhook function entry.
- Removed personal branding fallbacks from source and documented the active optional env vars.

### B7 - Fallow found a dead export in new hierarchy logic

Severity: low

Fix:
- Removed the unused `descendantCount` export while keeping it as an internal helper.
- Added hierarchy round-trip tests covering orphan-depth normalization and valid nested depth preservation.

## Verification

- `npx tsc --noEmit -p .` passed.
- `npm run lint` passed with warnings only.
- `npm test` passed, 25 tests.
- `npm run build` passed.
- `npm audit --json` passed with 0 vulnerabilities.
- `git diff --check` passed.
- Fallow normal and production dead-code modes passed with 0 issues.

## Notes

- Fallow health still flags structural complexity in large modules such as `components/creed/file-screen.tsx`, `lib/creed-backend.ts`, `lib/shared-documents.ts`, `app/mcp/route.ts`, and `components/creed/settings-screen.tsx`. Those are architectural follow-ups, not silent all-clear items.
- No Supabase migrations were changed in this pass, so `supabase db reset` was not required.
