# Fallow Audit

Date: 2026-07-01
Branch: `main`

## Result

- Normal Fallow check: 0 issues.
- Dead-code, normal mode: 0 issues.
- Dead-code, production mode: 0 issues.
- Dependency audit: 0 vulnerabilities.
- Exact duplication: 5.2947%, 57 clone groups, 121 clone instances.
- Semantic duplication advisory scan: 18.2076%, 234 clone groups.
- Health advisory scan: 307 functions above threshold; average maintainability 91.8; 114 critical, 85 high, 108 moderate findings.

## Actions Taken

- Removed the unused `descendantCount` export in `lib/section-hierarchy.ts`.
- Added document GitHub route helper extraction in `lib/document-github.ts`, reducing route-mapping duplication.
- Removed stale active Stripe/CSP/Vercel config that survived the earlier billing removal.
- Tightened sync helpers so Fallow's clean dead-code result is not hiding stale parameters or unused runtime surfaces.

## Accepted Structural Debt

Fallow health still flags complexity in large modules:

- `components/creed/file-screen.tsx`
- `components/creed/settings-screen.tsx`
- `lib/creed-backend.ts`
- `lib/shared-documents.ts`
- `components/creed/documents-dashboard-screen.tsx`
- `app/mcp/route.ts`
- `lib/creed-data.ts`
- `lib/ai/quality.ts`

Those are architectural follow-up candidates. Refactoring them wholesale in this pass would carry more risk than the scoped correctness fixes above.

## Verification

- `npx --yes fallow --format json --quiet --explain` passed with 0 check issues.
- `npx --yes fallow dead-code --production --format json --quiet --explain` passed with 0 issues.
- `npm test` passed.
- `npx tsc --noEmit -p .` passed.
- `npm run lint` passed with warnings only.
- `npm run build` passed.
