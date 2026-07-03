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

# Requirements Document: Proposal Diff Editor Redesign

## Source Artifacts
- `.spec/proposal-diff-editor-redesign/design.md`

## Scope Statement
This requirements package covers the document-first proposal/editor redesign for Creed. It includes shared documents and removal of the personal Creed profile model. Requirements are implementation-ready only after the critical decisions in `.spec/proposal-diff-editor-redesign/design.md` are resolved.

## Upstream Alignment Audit
- Original plan requirements reviewed: the user asked for no persisted sections, heading-based navigation, hunk proposals, proposal classifications, show/hide total diff, inline and sidebar review, conflict resolution, flat hunk comments, floating bulk actions, and version-history family grouping.
- Design decisions reviewed: DES-001 through DES-010 were reviewed and mapped below.
- Repository evidence and current tests reviewed: current per-section proposal code in `lib/document-editing.ts`, section diff code in `lib/document-section-diff.ts`, document review UI in `components/creed/document-review-panel.tsx`, document-mode section parsing in `components/creed/file-screen.tsx`, profile state in `lib/creed-data.ts` and `lib/creed-backend.ts`, MCP contract in `app/mcp/route.ts`, and current tests in `tests/document-editing.test.ts`.
- Architecture standards implications reviewed: because this removes a product model and public agent contract, implementation remains blocked until migration, data model, public contract, rollout, and auth decisions are approved.
- Requirements added, changed, or rejected during audit: added explicit requirements for personal-profile removal, heading outline derivation, hunk proposal generation, family grouping, conflict resolver, hunk comments, MCP contract migration, data migration, and numeric performance targets.
- Design updates required before continuing: none for requirements authoring.
- Agent judgment or justified architecture-standard deviations: no deviation. Blocking implementation is required by the risk profile.
- Post-requirements audit outcome: requirements are sufficient for decision spikes and future task slicing, but not sufficient for immediate implementation while critical Decision Needed items remain.

## Cross-Cutting Coverage
- Security: all content writes must still pass authenticated app routes or hashed-token MCP routes and server-side workspace edit policy.
- Privacy: personal profile data cannot be migrated into shared workspace visibility without an approved migration and visibility decision.
- Performance: hunk extraction, hunk apply, diff decoration, and side-panel navigation have explicit numeric targets.
- Resilience: stale anchors, overlapping edits, and repeated text must produce deterministic success, no-op, or conflict outcomes.
- Migration: legacy profile tables and section proposal rows require an approved data path before removal.
- Observability: family and hunk events must be recorded in document activity and server logs where failures occur.
- Supportability: old MCP clients and profile routes need explicit compatibility behavior during the rollout window.
- Backward compatibility: legacy document section proposals and old profile data are governed by compatibility and migration decisions.

## Requirements

### REQ-FUNC-001: Personal Profile Model Removal
Source Design Decisions:
- DES-001
- DES-009
- DES-010

Priority: High

Rationale:
- The target product no longer has personal Creed profiles or the fixed 10-section contract.

Requirement:
- THE system SHALL remove active personal-profile editing, active personal-profile proposal creation, and active personal-profile section persistence from the primary product after the approved migration and compatibility gates pass.

Verification Method:
- Code review, route tests, MCP contract tests, and database write tests.

Risk if Unmet:
- Creed continues to run two incompatible proposal models and agents keep writing profile-shaped proposals.

Acceptance Criteria
1. No primary UI route renders personal profile section cards after cutover.
2. No post-cutover app or MCP flow writes new active rows to `creed_sections` or `creed_proposals`.
3. Existing profile data follows the approved migration, archive, or deletion policy.
4. Product docs and MCP instructions no longer describe Creed as a personal 10-section profile.

Negative Cases
1. A legacy profile route must not write a new profile proposal after cutover.
2. A migrated profile must not become visible to unintended workspace readers.
3. Removing profile UI must not remove shared document access.

### REQ-FUNC-002: Continuous Document Editor
Source Design Decisions:
- DES-002
- DES-003

Priority: High

Rationale:
- Hunk-level review requires one continuous editing surface instead of section cards.

Requirement:
- THE system SHALL render shared document content in a single document-level editor whose persisted value is the full Markdown body.

Verification Method:
- Component tests, Playwright editor smoke tests, and code reference checks for retired document-mode section parsing.

Risk if Unmet:
- The review UI remains tied to fake sections and cannot show accurate inline hunks.

Acceptance Criteria
1. Document mode no longer stores editor state as `CreedSection[]`.
2. Saving a document sends the full Markdown body derived from the document editor.
3. The editor preserves existing rich Markdown components: headings, lists, callouts, dividers, inline tags, code blocks, tables, mermaid diagrams, document references, folder references, and URL references.
4. The document title remains structured metadata, not duplicated into body Markdown unless the approved contract says otherwise.

Negative Cases
1. The editor must not serialize `<!-- creed:depth=N -->` markers for navigation.
2. The editor must not expose section color, Nest, Un-nest, archive, or duplicate controls for document content.
3. Document save must not reformat unchanged Markdown blocks.

### REQ-FUNC-003: Heading-Derived Navigation
Source Design Decisions:
- DES-003

Priority: High

Rationale:
- The requested nesting is visual navigation from headings, not stored hierarchy.

Requirement:
- THE system SHALL derive document outline entries from Markdown `H1`, `H2`, and `H3` headings in document order.

Verification Method:
- Unit tests for heading parsing, editor outline tests, and Playwright navigation tests.

Risk if Unmet:
- Users keep managing hidden section state and outline navigation drifts from visible content.

Acceptance Criteria
1. `H1`, `H2`, and `H3` headings appear in the side navigation with visual depth matching heading level.
2. Editing a heading updates the outline without a database section mutation.
3. Clicking an outline item scrolls smoothly to the corresponding heading.
4. Duplicate headings remain navigable through deterministic occurrence indexing.

Negative Cases
1. Non-heading text must not appear as outline entries.
2. `H4` and deeper headings must not create primary navigation entries unless a later approved decision changes the level limit.
3. Reordering outline entries must not persist a separate tree.

### REQ-FUNC-004: Hunk Proposal Creation
Source Design Decisions:
- DES-004
- DES-009

Priority: High

Rationale:
- Review units must match actual contiguous changes, not heading sections.

Requirement:
- THE system SHALL create exactly one pending proposal for each non-empty, contiguous, reviewable hunk in a submitted document edit under propose policy.

Verification Method:
- Unit tests for hunk extraction, route tests through `routeDocumentEdit`, and regression fixtures with adjacent and separated edits.

Risk if Unmet:
- Reviewers cannot independently accept or reject the actual changed spans.

Acceptance Criteria
1. Two separated changed spans in one paragraph create two proposals.
2. Adjacent changed words create one proposal.
3. Pure formatting changes that create no visible review diff are rejected as no-op according to the approved normalization rules.
4. Hunk proposals record before text, after text, context, hunk index, base revision, author, and document ID.

Negative Cases
1. One changed word must not create a whole-document proposal.
2. A heading section containing two unrelated non-touching edits must not collapse into one proposal solely because the edits share a heading.
3. An empty hunk must not create a proposal row.

### REQ-FUNC-005: Proposal Classification
Source Design Decisions:
- DES-004
- DES-005

Priority: High

Rationale:
- Each hunk needs a short PR-like label that explains the local change.

Requirement:
- THE system SHALL persist one short classification label for each hunk proposal, using agent-supplied text when valid and deterministic server fallback text when absent.

Verification Method:
- API schema tests, hunk proposal creation tests, and UI rendering tests.

Risk if Unmet:
- The side panel and hover controls become opaque lists of red/green changes.

Acceptance Criteria
1. A hunk proposal returned from the API includes `classification`.
2. Invalid, empty, or overlong classification input is replaced or trimmed according to the approved API contract.
3. The classification is visible in the side panel and hunk hover controls.
4. Bulk-created hunks each receive their own classification.

Negative Cases
1. A family summary must not replace per-hunk classification.
2. Missing agent classification must not reject an otherwise valid proposal.
3. Classification text must not be treated as executable instructions.

### REQ-FUNC-006: Proposal Family Grouping
Source Design Decisions:
- DES-005
- DES-009

Priority: High

Rationale:
- Many small proposals need one parent group for review and history readability.

Requirement:
- THE system SHALL assign every hunk proposal created by one submitted edit to a single proposal family.

Verification Method:
- Database tests, route tests, review UI tests, and version history tests.

Risk if Unmet:
- Review and version history become noisy and lose the intent of the submitted edit.

Acceptance Criteria
1. One submitted edit that creates multiple hunks returns one family ID and multiple proposal IDs.
2. Family metadata includes document ID, author, actor type, base revision, summary, created time, and status or aggregate status.
3. The review summary can calculate remaining, accepted, rejected, and conflicting hunks from the family.
4. Accept all and Reject all can target the remaining hunks in a family or the currently filtered proposal set according to the approved UI contract.

Negative Cases
1. Hunks from different submissions must not share a family.
2. A family must not be marked fully accepted while any hunk remains pending or conflicting.
3. Rejecting one hunk must not reject its sibling hunks unless the reviewer invokes a bulk action.

### REQ-FUNC-007: Diff Mode Review UI
Source Design Decisions:
- DES-006
- DES-008

Priority: High

Rationale:
- The requested review flow happens while reading the edited document.

Requirement:
- THE system SHALL provide a document diff mode that displays aggregate diff summary, inline hunk decorations, a hunk side panel, hover controls, comments, and floating bulk actions.

Verification Method:
- Playwright tests across desktop and mobile, component tests for state transitions, and visual checks for long labels.

Risk if Unmet:
- Review remains detached from the document and users cannot navigate or resolve hunks efficiently.

Acceptance Criteria
1. The top review summary toggles Show diff and Hide diff.
2. When diff mode is visible, additions render green, removals render red, and conflicts render yellow.
3. Hovering or focusing a hunk shows classification, Accept, Reject, and Comment controls.
4. The side panel lists hunks in document order and smooth-scrolls to a selected hunk.
5. A bottom floating bar offers Accept all and Reject all for remaining eligible hunks.
6. UI text and controls do not overlap at mobile and desktop viewport sizes.

Negative Cases
1. Accept all must not resolve conflicting hunks without explicit conflict choices.
2. Hiding diff must not discard pending proposal state.
3. Side-panel navigation must not scroll to stale section-card anchors.

### REQ-FUNC-008: Conflict Detection And Resolution
Source Design Decisions:
- DES-007
- DES-009

Priority: High

Rationale:
- Multiple agents can submit overlapping changes that cannot be blindly merged.

Requirement:
- THE system SHALL mark overlapping or stale hunk proposals as conflicts and require explicit reviewer resolution before acceptance.

Verification Method:
- Unit tests for overlap detection, route tests for stale anchors, and Playwright tests for conflict resolver choices.

Risk if Unmet:
- Accept all can silently choose a conflicting edit or apply a hunk to the wrong content.

Acceptance Criteria
1. A hunk whose base context no longer matches returns a conflict on accept.
2. Overlapping pending hunks are marked conflicting according to the approved conflict timing.
3. Conflict hunks render yellow in diff mode and in the side panel.
4. The resolver shows competing before/after candidates and lets the reviewer accept or reject each candidate explicitly.
5. Bulk accept skips or blocks conflicting hunks.

Negative Cases
1. A conflict must not be accepted through the ordinary clean-hunk button.
2. Rejecting one conflicting hunk must not mutate document content.
3. Already-applied matching content must be treated as idempotent success only when the hunk's desired end state is unambiguous.

### REQ-FUNC-009: Flat Hunk Comments And Mentions
Source Design Decisions:
- DES-008

Priority: Medium

Rationale:
- Review comments should attach to the hunk being discussed and stay one level deep.

Requirement:
- THE system SHALL let reviewers add one-level comments with mentions to individual hunk proposals.

Verification Method:
- API tests for comment creation, mention parsing tests, and UI tests for hunk comment placement.

Risk if Unmet:
- Review feedback becomes detached from the exact changed span or reintroduces nested discussion complexity.

Acceptance Criteria
1. A hunk hover Comment action opens a comment composer for that hunk.
2. Submitted hunk comments include proposal ID or hunk ID, body, author, and mentioned user IDs.
3. Hunk comments appear under the matching hunk in the side panel.
4. Mention behavior follows existing document mention rules.

Negative Cases
1. A hunk comment must not attach only to the whole document when a hunk ID is available.
2. The hunk review UI must not create nested replies.
3. Empty comments must be rejected.

### REQ-FUNC-010: Version History Family Display
Source Design Decisions:
- DES-005
- DES-009

Priority: Medium

Rationale:
- Fine-grained proposals would overwhelm version history unless grouped.

Requirement:
- THE system SHALL display version history grouped by proposal family with expandable hunk details.

Verification Method:
- Component tests for grouping, route tests for family metadata, and Playwright tests for expand/collapse animation.

Risk if Unmet:
- Version history becomes unreadable after normal multi-hunk edits.

Acceptance Criteria
1. Version history shows a collapsed family row for accepted hunk families.
2. Expanding a family shows the hunk proposals in document order.
3. Collapsing a family restores the family list without losing scroll position.
4. Animation follows the existing motion timing guidance.

Negative Cases
1. The history view must not show every hunk as an unrelated top-level event by default.
2. Expanding one family must not expand all families.
3. Legacy versions without family IDs must remain readable as standalone rows.

### REQ-API-001: MCP And App Contract Migration
Source Design Decisions:
- DES-001
- DES-004
- DES-005
- DES-009
- DES-010

Priority: High

Rationale:
- MCP is a public agent contract and currently tells agents to maintain personal profile sections.

Requirement:
- THE system SHALL expose document-first MCP and app API contracts that return proposal family and hunk fields and omit personal-profile section guidance after cutover.

Verification Method:
- MCP schema tests, route tests, contract snapshot tests, and manual prompt validation across at least two models if `collaborationRules` or agent guidance changes.

Risk if Unmet:
- Connected agents continue submitting section-shaped profile proposals or cannot interpret hunk proposals.

Acceptance Criteria
1. `app/mcp/route.ts` instructions describe shared documents as the content model and remove proactive personal-profile maintenance language.
2. `creed_update_document` proposed responses include family ID, proposal IDs, hunk count, and classification fields.
3. Old profile/section tools return the approved compatibility response or alias behavior.
4. Tool descriptions remove `<!-- creed:depth=N -->` and section-nesting guidance.

Negative Cases
1. MCP instructions must not say Creed is a 10-section personal context profile after cutover.
2. A missing hunk classification must not break the MCP update flow.
3. Compatibility aliases must not bypass workspace edit policy.

### REQ-DATA-001: Data Model And Migration
Source Design Decisions:
- DES-001
- DES-005
- DES-007
- DES-009
- DES-010

Priority: High

Rationale:
- The current schema stores section proposals and personal profiles; target behavior needs hunk proposals and family grouping.

Requirement:
- THE system SHALL persist proposal families, hunk proposals, conflict state, and legacy profile migration outcomes in forward-only Supabase migrations.

Verification Method:
- Migration review, `supabase db reset`, database unit tests, and migration fixture checks.

Risk if Unmet:
- Hunk review cannot survive reloads, and profile removal can lose or expose data.

Acceptance Criteria
1. New proposal rows can represent hunk proposals without requiring `section_id`.
2. Proposal families are queryable by document, status, author, and created time.
3. Conflict state is persisted or derivable in a deterministic way from persisted data.
4. Existing section proposal rows remain readable or are migrated according to the approved rollout decision.
5. Existing profile data receives an auditable migration, archive, or deletion outcome.

Negative Cases
1. A migration must not drop `creed_sections` before content migration or deletion is verified.
2. A hunk proposal must not require a heading match to resolve.
3. New rows must not violate existing RLS/read patterns.

### REQ-SEC-001: Auth And Edit Policy Preservation
Source Design Decisions:
- DES-009
- DES-010

Priority: High

Rationale:
- The redesign changes write paths but must keep security invariants.

Requirement:
- THE system SHALL route all new document content mutations through authenticated application routes or hashed-token MCP routes and apply workspace edit policy server-side.

Verification Method:
- Route tests, auth tests, code review, and policy tests.

Risk if Unmet:
- Agents or clients could write content without approval or with the wrong identity.

Acceptance Criteria
1. App document mutation routes call `requireApiAuth()`.
2. MCP and any token-auth compatibility route verify hashed tokens.
3. Human and agent writes evaluate `policyForActor` or an approved equivalent.
4. Hunk accept/reject records resolver identity.

Negative Cases
1. Client-side policy checks must not be the authority.
2. Compatibility routes must not write when workspace agent editing is turned off.
3. A stale `expectedRevision` must not clobber newer document content.

### REQ-NFR-001: Performance And Scale Targets
Source Design Decisions:
- DES-004
- DES-006
- DES-007

Priority: Medium

Rationale:
- Hunk diffing and inline decorations add more work than section cards.

Requirement:
- THE system SHALL meet the latency, navigation, and concurrency targets defined for hunk proposal creation, hunk resolution, and diff-mode review.

Target Metrics:
- Documents up to 50,000 Markdown characters: hunk proposal creation p95 under 750ms server time; hunk accept/reject p95 under 500ms excluding network; side-panel navigation under 100ms after data load; 10 pending hunks bulk accepted without content corruption; zero unhandled 500s for stale accept/reject fixtures.

Verification Method:
- Unit timing checks where stable, Playwright interaction timing, route-level regression tests, and manual profiling for long documents.

Risk if Unmet:
- Review mode feels slow or corrupts content under normal multi-agent use.

Acceptance Criteria
1. Long-document fixtures satisfy the stated p95 server targets in local test runs or documented CI-equivalent measurements.
2. Side-panel navigation visibly lands on the selected hunk within the target after data is loaded.
3. Concurrent accept/reject of the same hunk produces exactly one terminal resolution.
4. Bulk accept of clean hunks preserves all unrelated Markdown exactly.

Negative Cases
1. A repeated-text fixture must not apply a hunk to the wrong occurrence.
2. Long documents must not freeze the editor while diff mode is toggled.
3. Concurrent hunk resolution must not produce duplicate accepted versions for the same proposal.

### REQ-OPS-001: Rollout, Observability, And Rollback
Source Design Decisions:
- DES-005
- DES-007
- DES-009
- DES-010

Priority: High

Rationale:
- This is a high-risk architecture transition with public contract and data migration risk.

Requirement:
- THE system SHALL ship hunk proposals and profile removal through a gated rollout with activity events, structured failure logs, compatibility traffic monitoring, and a documented rollback path.

Verification Method:
- Rollout checklist review, activity event tests, log-path review, feature-flag checks, and rollback drill on local data.

Risk if Unmet:
- Regressions cannot be diagnosed or reversed without data loss or agent breakage.

Acceptance Criteria
1. Activity events include family creation, hunk accepted, hunk rejected, conflict detected, conflict resolved, and bulk resolution.
2. Unexpected hunk apply failures log through `lib/observability.ts`.
3. Legacy profile-route and old MCP section-tool traffic can be measured during rollout.
4. A feature flag or equivalent gate can stop new hunk proposal creation while preserving legacy row display.
5. Rollback steps are documented before destructive cleanup.

Negative Cases
1. Rollout must not require deleting existing document versions.
2. Disabling hunk proposals must not hide existing pending legacy proposals.
3. Destructive profile cleanup must not run before migration verification.

## Traceability Matrix
- DES-001 -> REQ-FUNC-001, REQ-API-001, REQ-DATA-001
- DES-002 -> REQ-FUNC-002
- DES-003 -> REQ-FUNC-002, REQ-FUNC-003
- DES-004 -> REQ-FUNC-004, REQ-FUNC-005, REQ-API-001, REQ-NFR-001
- DES-005 -> REQ-FUNC-005, REQ-FUNC-006, REQ-FUNC-010, REQ-API-001, REQ-DATA-001, REQ-OPS-001
- DES-006 -> REQ-FUNC-007, REQ-NFR-001
- DES-007 -> REQ-FUNC-008, REQ-DATA-001, REQ-NFR-001, REQ-OPS-001
- DES-008 -> REQ-FUNC-007, REQ-FUNC-009
- DES-009 -> REQ-FUNC-001, REQ-FUNC-004, REQ-FUNC-006, REQ-FUNC-008, REQ-FUNC-010, REQ-API-001, REQ-DATA-001, REQ-SEC-001, REQ-OPS-001
- DES-010 -> REQ-FUNC-001, REQ-API-001, REQ-DATA-001, REQ-SEC-001, REQ-OPS-001
