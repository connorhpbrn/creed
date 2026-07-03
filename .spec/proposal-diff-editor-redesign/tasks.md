---
title: Proposal Diff Editor Redesign
scope: proposal-diff-editor-redesign
status: draft
repo_root: /Users/declancowen/Documents/GitHub/Creed
change_class: architecture-transition
risk_level: high
owner: Declan
reviewers: unassigned
approvers: Declan
implementation_owner: unassigned
operations_owner: Declan
last_updated: 2026-07-03
---

# Task Plan: Proposal Diff Editor Redesign

## Source Artifacts
- `.spec/proposal-diff-editor-redesign/design.md`
- `.spec/proposal-diff-editor-redesign/requirements.md`

## Gating Status
- Blocked
- Blocking design decisions:
  - DES-001 profile removal compatibility path
  - DES-004 hunk proposal unit and apply semantics
  - DES-005 proposal family persistence
  - DES-007 conflict model
  - DES-010 migration, rollout, and public contract gate

## Execution Status Summary
- To do: SPIKE-001, SPIKE-002, SPIKE-003, SPIKE-004, SPIKE-005, SPIKE-006
- In progress: none
- Completed: none
- Deferred: none
- Blocked: none

## Sequencing Notes
- No implementation tasks are authorized while critical Decision Needed items remain in `.spec/proposal-diff-editor-redesign/design.md`.
- Run SPIKE-001 and SPIKE-002 first. They decide whether profile content becomes a document, archive, or deletion path, and whether proposal families need a new table or can evolve `batch_id`.
- Run SPIKE-003 before touching `app/mcp/route.ts` because MCP is a public agent contract.
- Run SPIKE-004 before writing migrations that affect `creed_sections`, `creed_proposals`, `creed_activity`, or `creed_document_proposals`.
- Run SPIKE-005 before assuming the current globally shared workspace remains acceptable after personal profiles are removed.
- Run SPIKE-006 before UI tasks so performance and conflict observability are built into the hunk model rather than added after the fact.

## Implementation Authority And Review Loop
- The spec is guidance; the original user request is authoritative for the target outcome, architecture standards are the review lens for solution shape, and live code/current tests are authoritative for current reality.
- Before each leaf task, read linked `DES-*` entries, linked `REQ-*` entries, the task entry, relevant code, and current tests.
- During each leaf task, use architecture standards to shape every material design/code/test decision, not only the final review.
- Treat a requirement slice as one leaf task or a small group of tightly coupled leaf tasks that completes one requirement or requirement cluster.
- After each implementation slice, run focused validation, then run a deep diff review scoped to that slice with architecture standards as the architecture lens.
- If diff review is unavailable, run an equivalent manual deep diff review and record the fallback.
- Fix slice review findings, then run normal diff review passes with architecture standards until the slice is clean before moving on.
- Record every slice review and the final total-diff review in the spec review log for this package.
- After test creation, verify tests prove requirement behavior and relevant negative cases rather than implementation details.
- If code reality and spec intent diverge, update `.spec/proposal-diff-editor-redesign/design.md`, then `.spec/proposal-diff-editor-redesign/requirements.md`, then `.spec/proposal-diff-editor-redesign/tasks.md` before continuing.
- If the user corrects a generated artifact or says an item drifted, treat that correction as authoritative and refresh upstream spec artifacts before continuing.
- The implementing agent may challenge a stale task or skill interpretation, but must document the rationale and update upstream artifacts before continuing.

## Blocking Work
- [ ] SPIKE-001 Resolve personal profile removal and compatibility path
  - Status: todo
  - Blocks: DES-001, DES-009, DES-010, REQ-FUNC-001, REQ-API-001, REQ-DATA-001, REQ-SEC-001, REQ-OPS-001
  - Likely areas: `lib/creed-data.ts`, `lib/creed-backend.ts`, `components/creed/creed-provider.tsx`, `components/creed/file-screen.tsx`, `app/api/creed/proposals/route.ts`, `app/api/creed/write/route.ts`, `app/api/app/state/route.ts`, `app/mcp/route.ts`, `supabase/migrations/20260403190000_init_creed.sql`
  - Validation: produce a decision note covering profile content migration/archive/deletion, old MCP section tools, old profile routes, pending profile proposals, profile activity, and user-visible docs.
  - Exit criteria: `.spec/proposal-diff-editor-redesign/design.md` Decision Needed public-contract and rollout items are updated with the approved profile compatibility path.

- [ ] SPIKE-002 Resolve hunk diff and proposal-family data model
  - Status: todo
  - Blocks: DES-004, DES-005, DES-007, DES-009, REQ-FUNC-004, REQ-FUNC-005, REQ-FUNC-006, REQ-FUNC-008, REQ-DATA-001, REQ-NFR-001
  - Likely areas: `lib/document-editing.ts`, `lib/document-section-diff.ts`, `tests/document-editing.test.ts`, `supabase/migrations/20260701120000_add_workspace_proposal_versioning.sql`, `supabase/migrations/20260701150000_add_proposal_section_batching.sql`, `components/creed/document-review-panel.tsx`
  - Validation: prototype or specify hunk extraction, hunk anchoring, hunk apply, family persistence, conflict state, indexes, and legacy section proposal read behavior.
  - Exit criteria: approved schema and algorithm notes are recorded in `.spec/proposal-diff-editor-redesign/design.md`, including whether `batch_id` is replaced or complemented by a new family table.

- [ ] SPIKE-003 Resolve MCP and app API contract for hunk proposals
  - Status: todo
  - Blocks: DES-001, DES-004, DES-005, DES-008, DES-009, DES-010, REQ-API-001, REQ-FUNC-005, REQ-FUNC-006, REQ-FUNC-009, REQ-SEC-001
  - Likely areas: `app/mcp/route.ts`, `app/api/app/documents/[id]/route.ts`, `app/api/app/documents/[id]/proposals/route.ts`, `app/api/app/documents/[id]/proposals/[proposalId]/accept/route.ts`, `app/api/app/documents/[id]/proposals/[proposalId]/reject/route.ts`, `lib/document-editing.ts`
  - Validation: define request and response examples for `creed_update_document`, family/hunk proposal listing, single hunk accept/reject, bulk accept/reject, conflict resolver, and comment creation.
  - Exit criteria: `.spec/proposal-diff-editor-redesign/design.md` Contract Examples section and `.spec/proposal-diff-editor-redesign/requirements.md` API requirement are updated with the approved contract.

- [ ] SPIKE-004 Resolve rollout, migration, and rollback plan
  - Status: todo
  - Blocks: DES-001, DES-005, DES-007, DES-009, DES-010, REQ-DATA-001, REQ-OPS-001
  - Likely areas: `supabase/migrations`, `lib/shared-documents.ts`, `lib/document-versions.ts`, `lib/document-collaboration.ts`, `lib/creed-backend.ts`, `.kiro/specs/workspace-proposal-versioning/design.md`, `.reviews/workspace-proposal-versioning-diff-review.md`
  - Validation: produce a step-by-step rollout, abort, reversal, and fixture migration plan, including Supabase reset requirements and legacy traffic monitoring.
  - Exit criteria: `.spec/proposal-diff-editor-redesign/design.md` Rollout, Abort, and Reversal section is implementation-ready and destructive cleanup gates are explicit.

- [ ] SPIKE-005 Resolve auth and workspace tenancy implications
  - Status: todo
  - Blocks: DES-001, DES-009, DES-010, REQ-SEC-001, REQ-DATA-001
  - Likely areas: `lib/workspace-settings.ts`, `lib/api-auth.ts`, `lib/shared-documents.ts`, `lib/document-collaboration.ts`, `app/api/app/documents`, `app/mcp/route.ts`, `supabase/migrations/20260701120000_add_workspace_proposal_versioning.sql`
  - Validation: decide whether the current authenticated shared workspace remains valid after private personal profiles disappear, or whether workspace membership/tenancy must be introduced before migration.
  - Exit criteria: `.spec/proposal-diff-editor-redesign/design.md` Decision Needed auth item is resolved and any new tenancy requirement is reflected in `.spec/proposal-diff-editor-redesign/requirements.md`.

- [ ] SPIKE-006 Resolve UI proof, performance targets, and observability names
  - Status: todo
  - Blocks: DES-002, DES-003, DES-006, DES-007, DES-008, REQ-FUNC-002, REQ-FUNC-003, REQ-FUNC-007, REQ-FUNC-008, REQ-FUNC-009, REQ-FUNC-010, REQ-NFR-001, REQ-OPS-001
  - Likely areas: `components/creed/file-screen.tsx`, `components/creed/document-review-panel.tsx`, `components/creed/rich-text-editor.tsx`, `components/creed/shell.tsx`, `components/creed/mention-textarea.tsx`, `components/creed/inline-proposal-diff.tsx`, `lib/observability.ts`
  - Validation: produce a UI interaction proof for desktop/mobile, conflict colors, hover controls, side-panel navigation, bottom bulk bar, comment placement, and event/log names.
  - Exit criteria: `.spec/proposal-diff-editor-redesign/design.md` UI and Observability sections are updated with final naming, layout, and validation expectations.

## Tasks
- No implementation tasks until the design is unblocked.

## Post-Deploy Verification
- Run `npx tsc --noEmit -p .`.
- Run `npm run lint`.
- Run `npm run build`.
- If Supabase migrations are touched, run `supabase db reset` locally.
- Verify MCP instructions and updated tool schemas in at least two model clients if agent contract guidance changes.
- Run Playwright review flows for show/hide diff, hunk side-panel navigation, inline accept/reject/comment, conflict resolver, floating bulk actions, and version-family expansion.
- Confirm no legacy profile writes occur during the rollout window.

## Traceability Matrix
- SPIKE-001 -> REQ-FUNC-001, REQ-API-001, REQ-DATA-001, REQ-SEC-001, REQ-OPS-001
- SPIKE-002 -> REQ-FUNC-004, REQ-FUNC-005, REQ-FUNC-006, REQ-FUNC-008, REQ-DATA-001, REQ-NFR-001
- SPIKE-003 -> REQ-API-001, REQ-FUNC-005, REQ-FUNC-006, REQ-FUNC-009, REQ-SEC-001
- SPIKE-004 -> REQ-DATA-001, REQ-OPS-001
- SPIKE-005 -> REQ-SEC-001, REQ-DATA-001
- SPIKE-006 -> REQ-FUNC-002, REQ-FUNC-003, REQ-FUNC-007, REQ-FUNC-008, REQ-FUNC-009, REQ-FUNC-010, REQ-NFR-001, REQ-OPS-001

## Coverage Checklist
- Every `REQ-*` appears in at least one blocking spike while the implementation plan is gated.
- No implementation task introduces scope absent from the requirements.
- Validation is included near risky changes.
- Rollout and rollback work is present before migration tasks can be created.
- Every future leaf task must include pre-implementation context review, test creation review, slice review loop, post-implementation review, and spec drift check fields.
- `Depends on` references must form a valid acyclic graph once implementation tasks are added.
- Every blocking spike appears exactly once in `Execution Status Summary`.
