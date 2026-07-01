# Fallow Audit

## Turn 2 — 2026-07-01 14:31 (post document-workspace)

Fallow v2.103.0. Commands: `fallow` (check), `fallow dead-code`,
`fallow dead-code --production`, `fallow dupes`.

### Gates
- Check: 25 → 22 issues after cleanup (advisory; no blocking category).
- Unresolved imports: 0. Unlisted/unused dependencies: 0. Boundary/circular/policy
  violations: 0. Production dead-code: 0.
- Exact duplication remains ~5% (route/UI boilerplate) — advisory, unchanged class.

### Removed (dead scaffolding, zero consumers — verified)
- `lib/document-reference-index.ts`: `refreshReferenceIndex`,
  `isReferenceIndexLoaded`, `getReferenceEntries` (module keeps its used API:
  `ensureReferenceIndex`, `resolveReference`, `searchReferences`,
  `subscribeReferenceIndex`).
- `lib/document-editing.ts`: unused `DocumentEditDraft` type; de-exported
  internal-only `applyDocumentContent`.
- `components/creed/file-screen.tsx` (R4): removed the unreachable `documentMode`
  arm of `githubConfigured` and the dead `handleApplyPull` `documentMode` block
  that fetched the deleted `/api/app/documents/[id]/github/pull/apply` route.
  No dangling references to deleted document-GitHub routes remain in live source.

Lint warnings 37 → 36; dead-code total 25 → 22.

### Accepted advisory debt (kept deliberately, with reason)
- `components/creed/feedback-menu.tsx` (unused file): a real feature component
  posting to the live `/api/feedback` route (configured in `vercel.json`). It is
  currently not mounted in any menu. Preserved rather than deleted — removing a
  feature is a product decision, not dead-code cleanup. FLAG: wire it back into a
  menu or remove it together with the API route + vercel entry.
- `lib/creed-data.ts` unused exports (`IDENTITY/GOALS/WORK/PREFERENCES/ROUTINES_SECTION_ID`,
  `sectionSuggestions`): canonical domain constants / used internally; AGENTS.md
  marks creed-data as a legacy-sensitive god file. Kept.
- `components/ui/phosphor-icons.tsx` (`RotateCw`, `Send`), `components/creed/brand.tsx`
  (`CreedMark`): design-system primitives; repo intentionally keeps a full icon set.
- `lib/document-reference.ts` (`DOC_REFERENCE_KINDS`, `CARD_REFERENCE_PATTERN`),
  `lib/workspace-settings.ts` (`EDIT_POLICY_VALUES`): used internally; only the
  `export` is unused. Left exported as small, coherent module APIs.
- Duplication: idiomatic Next.js route boilerplate (auth + `await params` +
  `apiResultErrorResponse`) and paired restore/delete + diff-render blocks.
  Per architecture-standards, extracting these would blur route ownership for
  marginal gain. Not consolidated.

### Verification
- `npx tsc --noEmit -p .` clean; `npm run lint` 0 errors/36 warnings;
  `npm test` 68/68; `npm run build` success.

---

## Turn 1 — 2026-07-01 (pre document-workspace)

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
