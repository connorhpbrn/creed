# Full Repo Audit

Date: 2026-07-01
Scope: entire Creed codebase, with extra scrutiny on app-route auth, token-authenticated agent APIs, shared document source-of-truth rules, GitHub sync, BYOK-only AI, active runtime config, deployment config, and static-analysis output.

## Result

Status: pass after fixes. No open blocking findings remain.

## Whole-Repo Checks

- `/api/app/*` routes: 30 route files checked, all contain `requireApiAuth()` or `requireApiJson()`.
- `/api/creed/*` routes: 3 route files checked, all remain token-authenticated.
- `/mcp`: OAuth/token handling remains present, and shared document tools use the live Supabase document helpers.
- Shared documents: Supabase remains the live source of truth; GitHub receives the serialized Markdown projection with frontmatter.
- Shared document writes: latest content, metadata, archive, pull, and sync-stamp writes now consistently exclude archived rows where needed.
- GitHub document sync: push/pull/status/preview/apply routes are session-authenticated before using integration tokens.
- BYOK AI: no active runtime path references a platform OpenRouter key.
- Removed payment flow: no active app/runtime config references Stripe origins, route handlers, webhook env vars, or publishable/secret keys.
- Personal identifiers: no source fallback remains for personal email, social, or GitHub handles.
- Dependency audit: 0 vulnerabilities reported.

## Fixes From This Audit

- Hardened document publish after dirty-save failure.
- Fixed document GitHub SHA/content-hash drift.
- Re-fetched GitHub content server-side during document pull/apply.
- Blocked archived document mutation through content and sync-stamp paths.
- Added canonical document Markdown frontmatter parsing/serialization.
- Removed stale active Stripe/CSP/Vercel/env config.
- Documented currently used optional env vars.
- Removed one Fallow-reported dead export.
- Reduced duplicated document GitHub route mapping by adding `lib/document-github.ts`.

## Verification

- `npx tsc --noEmit -p .` passed.
- `npm run lint` passed with 0 errors and existing warnings only.
- `npm test` passed, 25 tests.
- `npm run build` passed.
- `npm audit --json` passed with 0 vulnerabilities.
- `git diff --check` passed.
- Fallow normal mode passed with 0 check issues.
- Fallow production dead-code passed with 0 issues.

## Residual Structural Debt

- Fallow health remains advisory-nonzero: 307 functions above threshold, 114 critical, 85 high, 108 moderate.
- Top complexity hotspots: `components/creed/file-screen.tsx`, `components/creed/settings-screen.tsx`, `lib/creed-backend.ts`, `lib/shared-documents.ts`, `components/creed/documents-dashboard-screen.tsx`, `app/mcp/route.ts`, `lib/creed-data.ts`, and `lib/ai/quality.ts`.
- Duplication is not blocking but remains visible: 57 clone groups, 5.2947% exact duplication. Most remaining groups are route boilerplate, loading skeletons, UI primitives, and large-file local patterns.

## Notes

- No Supabase migrations were touched, so local `supabase db reset` was not required.
