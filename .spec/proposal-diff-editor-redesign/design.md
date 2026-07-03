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

# Design Document: Proposal Diff Editor Redesign

## Summary
Creed should move from profile-section editing and section-scoped proposals to a document-first editor with hunk-level proposal review. The target product has no personal Creed profile surface and no fixed 10-section contract. The only durable content model is a shared Markdown document body in Supabase, rendered through a continuous editor. Navigation comes from `H1` / `H2` / `H3` headings in the document, not from persisted `CreedSection[]` rows or `<!-- creed:depth=N -->` markers.

Every non-touching changed span in an agent or human edit becomes an independent proposal hunk. Hunks created by one submitted edit share a proposal family so the review UI and version history stay readable. Review happens inside a diff mode: a top summary toggles the full diff, a side panel lists hunks, inline decorations show red/green/yellow changes, and each hunk can be accepted, rejected, or commented on in place.

## Scope Statement
In scope:
- Remove the personal Creed profile as an active product surface, including the 10-section contract, profile section editing, and profile-section proposal workflow.
- Replace document editor section cards with one continuous Markdown/Tiptap editor for shared documents.
- Replace section-scoped document proposals with hunk-scoped proposals grouped by proposal family.
- Update MCP instructions and tools so agents operate against shared documents and proposal families, not personal profile sections.
- Define the data migration and compatibility gates for `creed_sections`, `creed_proposals`, `creed_activity`, and token-auth profile routes.

Out of scope for this spec:
- Reintroducing GitHub sync for documents.
- Changing Supabase as the source of truth.
- Adding a second workspace tenancy model unless the auth spike decides this must be solved before profile removal.
- Implementing code before the critical public contract, data model, and rollout decisions are approved.

## Original Plan Alignment Audit
- Original plan or prompt excerpts reviewed: user requested a new branch and described a full proposal/editor redesign with no real nesting, heading-based navigation, one proposal per non-touching diff, shorthand PR-like classification, show/hide diff mode, inline accept/reject/comment, conflict display in yellow, a side panel for hunks, floating accept/reject all, and version-history family grouping. User then clarified: "its both" and "remoce it", meaning both shared documents and the personal Creed profile are in scope, and personal profiles should be removed.
- Explicit requirements confirmed from the original plan: remove sections from the editor; use `H1` / `H2` / `H3` for navigation; create smaller proposals from contiguous changed spans; group proposal rows into families; show aggregate and per-hunk diff review; expose inline and sidebar resolution controls; add conflict UI; add flat comment affordances for hunks; group version history by family.
- Plan items excluded or deferred, with reason: exact schema names and MCP payload shape are deferred to decision spikes because changing them incorrectly would strand existing agents or pending proposals.
- Gaps, contradictions, or stale assumptions found: `AGENTS.md`, `app/mcp/route.ts`, `lib/creed-data.ts`, and the current MCP contract still define Creed as a personal context profile. That product assumption is now superseded by the user clarification.
- Upstream artifact changes required before continuing: update `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, public docs, and MCP instructions after the product contract decision is approved.
- Architecture standards reviewed: architecture-standards operating modes, design gates, simplicity gate, target-state design, refactor design, review checklists, and completion guidance were read for this spec.
- Agent judgment or justified architecture-standard deviations: no implementation starts while profile-removal compatibility and hunk persistence are undecided. This follows the high-risk transition gate rather than producing partial code against unstable contracts.
- Post-design audit outcome: target state is coherent, but tasks remain blocked by critical data-model, public-contract, rollout, and auth decisions.

## Repository Discovery Summary

### Repo Root
- `/Users/declancowen/Documents/GitHub/Creed`

### Repo-Specific Profile and House Patterns
- project-context is absent in this checkout, so fallback reading was `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and the provided `AGENTS.md`.
- `AGENTS.md` currently says Creed is "one personal context profile" and separately describes shared documents as Supabase-only. That is current-state guidance, not target-state guidance for this redesign.
- House invariants still apply during the transition: `requireApiAuth()` on app API routes, hashed token verification on token-auth agent routes and MCP, no GitHub sync for shared documents, TypeScript strict, no `console.log`, and Supabase migrations are forward-only.
- UI patterns use React 19, Next.js App Router, Tailwind v4, shadcn/ui primitives, Tiptap, and Framer Motion.

### Entry Points and Execution Path
- App document editing enters through `components/creed/file-screen.tsx`, which currently switches between personal profile mode and shared document mode.
- Shared document saves call `app/api/app/documents/[id]/route.ts`, which delegates to `lib/document-editing.ts::routeDocumentEdit`.
- Document proposal listing and resolution use `app/api/app/documents/[id]/proposals/route.ts`, `app/api/app/documents/[id]/proposals/[proposalId]/accept/route.ts`, and `app/api/app/documents/[id]/proposals/[proposalId]/reject/route.ts`.
- MCP document tools live in `app/mcp/route.ts` and already call `routeDocumentEdit` for `creed_update_document`.
- Personal profile reads and writes still use `lib/creed-backend.ts::loadCreedState`, `lib/creed-backend.ts::persistCreedState`, `app/api/creed/proposals/route.ts`, `app/api/creed/write/route.ts`, and `app/api/app/state/route.ts`.

### Confirmed Code and Runtime Facts
- `lib/creed-data.ts` defines `CreedSection`, `CreedState`, personal profile section IDs, `collaborationRules`, `buildVisibleCreedMarkdown`, and `buildAgentReadPayload`.
- `lib/creed-backend.ts::loadCreedState` loads `creed_sections`, `creed_proposals`, and `creed_activity`, then hydrates `state.sections`, `state.proposals`, and `sectionRevisions`.
- `lib/creed-backend.ts::persistCreedState` upserts `creed_sections`, `creed_proposals`, and `creed_activity`.
- `components/creed/creed-provider.tsx` owns personal profile section CRUD, section permissions, section proposal accept/reject, and state persistence.
- `components/creed/file-screen.tsx` parses shared document Markdown into `CreedSection[]` through `lib/document-sections.ts`, renders those sections in a `Reorder.Group`, and saves by serializing sections back to Markdown.
- `components/creed/file-screen.tsx::SectionCard` provides title chrome, nesting controls, color, archive/delete, per-section comments, `RichTextEditor`, and inline proposal cards.
- `lib/document-editing.ts` is the strongest existing pattern for the target: it centralizes policy routing, proposal creation, direct apply, and append-only versions.
- `lib/document-section-diff.ts` currently splits Markdown by headings and applies section replacements. The target needs a hunk engine instead of this section engine.
- `supabase/migrations/20260701120000_add_workspace_proposal_versioning.sql` creates `creed_document_proposals` and `creed_document_versions`.
- `supabase/migrations/20260701150000_add_proposal_section_batching.sql` adds `batch_id` for per-section proposals and explicitly documents section batching.

### Related Code and Pattern Inventory
- `lib/document-editing.ts`: keep the policy-gated edit router; replace section diffing and section apply with hunk diffing and hunk apply.
- `lib/document-section-diff.ts`: replace or retire after the new hunk diff module exists.
- `components/creed/document-review-panel.tsx`: current review panel, proposal pill, version history, comments, and realtime polling/subscription patterns.
- `components/creed/rich-text-editor.tsx`: current Tiptap extension set; target should reuse extensions while adding a document-level wrapper and diff decorations.
- `lib/rich-text.ts` and `lib/creed-data.ts::sectionToMarkdown`: current Markdown/HTML round-trip paths; target must move serialization ownership out of `CreedSection`.
- `lib/shared-documents.ts`: source of truth for `creed_documents.content`, revision, metadata, and optimistic update path.
- `lib/document-collaboration.ts`: comments, activity, workspace users, and proposal-linked comment resolution.
- `app/mcp/route.ts`: public agent contract and tools. This is a critical compatibility surface.
- `tests/document-editing.test.ts`: existing per-section proposal behavior that must be replaced by hunk-family proposal tests.

### Adjacent Pattern Comparison
- Shared documents already have the right central ownership pattern: full Markdown body, edit policy, proposal rows, version rows, comments, and MCP tools.
- Personal profiles have the wrong ownership pattern for the target: fixed section IDs, per-section permissions, section revisions, local provider mutations, and profile-specific proposal/activity tables.
- The existing document proposal batching pattern is close to proposal families, but it batches sections and stores section identity. The target family should group hunks and version history, not headings.
- The existing `DocumentReviewPanel` has realtime and accept/reject plumbing that can be retained, but its UI model is section-card based and must be replaced.

### Blast Radius Review
- High blast radius in app UI: `components/creed/file-screen.tsx`, `components/creed/document-review-panel.tsx`, `components/creed/rich-text-editor.tsx`, `components/creed/shell.tsx`, and profile-specific panels.
- High blast radius in domain logic: `lib/document-editing.ts`, `lib/document-section-diff.ts`, `lib/document-sections.ts`, `lib/creed-markdown.ts`, `lib/creed-data.ts`, and `lib/creed-backend.ts`.
- High blast radius in persistence: personal profile tables plus document proposal/version tables.
- High blast radius in public contracts: MCP instructions, token-auth profile routes, existing tools named `read_creed`, `creed_update_section`, and focused section mutation tools.
- Medium blast radius in settings, onboarding, dashboard, and login redirects because several flows currently check whether a personal Creed exists.

### Recent Related Repository History
- `.kiro/specs/workspace-proposal-versioning/design.md` designed the current Supabase-only proposal/version model for shared documents.
- `.kiro/specs/workspace-proposal-versioning/requirements.md` and `.kiro/specs/workspace-proposal-versioning/tasks.md` covered per-section document proposals and versioning.
- `.reviews/workspace-proposal-versioning-diff-review.md` recorded a clean review of the prior Model S implementation.
- `.audits/fallow.md` reports Fallow was unavailable in the local preflight and lists current hotspot files, including `components/creed/file-screen.tsx`, `lib/creed-backend.ts`, `lib/creed-data.ts`, and `app/mcp/route.ts`.

### Impacted Boundaries and Adjacent Systems
- Editor boundary: section cards and document body editing become one document-level editing surface.
- Review boundary: proposal rows become hunks, not sections or whole-document drafts.
- MCP boundary: agents must stop receiving personal-profile guidance and section mutation tools as the primary contract.
- Data boundary: profile tables become legacy/migration sources; document tables become canonical.
- Version-history boundary: accepted hunks must be grouped by family for UI readability.
- Comment boundary: proposal-linked comments attach to hunk proposals and stay flat.
- Permission boundary: workspace edit policy remains authoritative.

### Data, Contracts, and Config Surfaces
- Current profile data: `creed_sections`, `creed_proposals`, `creed_activity`, `creed_tokens`, and `creed_connections`.
- Current document data: `creed_documents`, `creed_document_proposals`, `creed_document_versions`, `creed_document_comments`, and `creed_workspace_settings`.
- Current document proposal columns: `draft`, `section_id`, `batch_id`, `summary`, `base_revision`, `status`, `resolving`, timestamps, and actor fields.
- Target proposal columns likely need `proposal_family_id`, `hunk_index`, `hunk_anchor`, `hunk_kind`, `classification`, `conflict_status`, and per-hunk before/after/context inside `draft`.
- Current config: workspace edit policy in `lib/workspace-settings.ts`; profile `requireApproval` in `creed_tokens` must be reconciled or retired.
- Public contracts: MCP tool schemas, token-auth profile route patterns, app API route patterns, and document review response shapes.

### Existing Tests and Operational Signals
- `tests/document-editing.test.ts` validates current per-section proposal batching, independent accept/reject, stale section apply, and no-op behavior.
- Existing review UI tests are not evident from discovery; this raises implementation risk for inline diff mode and navigation.
- Production build expectations from `AGENTS.md`: `npx tsc --noEmit -p .`, `npm run lint`, and `npm run build`.
- Supabase migrations require local reset when touched.
- Existing realtime migration `supabase/migrations/20260702190420_add_document_review_realtime.sql` means proposal/version subscriptions should be preserved.

### Static Analyzer and Audit Evidence
- Relevant audit/review artifacts: `.audits/fallow.md`, `.reviews/workspace-proposal-versioning-diff-review.md`, `.kiro/specs/workspace-proposal-versioning/design.md`, `.kiro/specs/workspace-proposal-versioning/requirements.md`, `.kiro/specs/workspace-proposal-versioning/tasks.md`.
- Analyzer commands, HEAD, date, mode, scope, baseline/gate, and result: architecture preflight found Fallow unavailable via project-local package manager or PATH. Existing `.audits/fallow.md` was used as advisory evidence. Current date is 2026-07-03.
- Gate versus advisory inventory distinction: Fallow evidence is advisory for hotspot awareness; spec lint, reference check, traceability, TypeScript, lint, build, and Supabase reset are gates at their respective stages.
- CI parity and accepted-debt status: no implementation code in this draft, so app CI was not run yet. Implementation must re-run the repo gates and record any accepted debt explicitly.

## Problem Statement and Context
The current proposal model is section-shaped. That made sense while Creed was a personal context profile with a fixed section contract, but it fights the new desired experience:

- Small edits inside one section are grouped too coarsely.
- Shared documents are parsed into fake `CreedSection[]` objects even though the source of truth is one Markdown body.
- UI nesting is stored as section depth instead of being read from headings.
- Personal profile code and public agent guidance still tell agents to maintain durable personal context.
- Version history becomes noisy if every accepted hunk is displayed as an unrelated version.

The new model treats documents as continuous Markdown and treats proposals as reviewable diff hunks. This matches how reviewers reason about changes: not "section changed", but "this specific phrase, paragraph, table row, or block changed".

## Current-State Analysis
- Shared document content is stored as one Markdown body in `creed_documents.content`, but the editor converts it into `CreedSection[]` through `lib/document-sections.ts`.
- Section titles and nesting controls are stored in UI state and serialized back to Markdown with `documentSectionsToMarkdown`.
- `routeDocumentEdit` receives full content and uses `diffMarkdownSections` to create one proposal per changed heading section.
- Acceptance uses `applySectionChange` and section keys derived from heading text and level.
- `DocumentReviewPanel` shows per-section cards and a proposal pill, not inline decorated hunks.
- Personal profile state has independent persistence, routes, MCP tools, activity, proposal semantics, and UI.
- MCP instructions still require `read_creed` and proactive profile proposals, which directly conflicts with removing personal profiles.

## Target-State Architecture
- Intended owner for each durable invariant: `creed_documents.content` owns Markdown content; `lib/document-editing.ts` owns policy routing and apply semantics; the new hunk diff module owns hunk extraction, anchoring, and merge checks; `creed_document_proposal_families` or equivalent owns proposal-family metadata; `creed_document_proposals` owns individual hunks; `creed_document_versions` owns append-only document snapshots.
- Dependency direction and public surfaces: UI calls app document APIs; app APIs call document domain modules; MCP document tools call the same document domain modules; profile-specific modules do not remain in the write path.
- Contracts, data ownership, async/reliability, and operational ownership: Supabase remains the source of truth; route handlers keep service-role writes; clients use realtime plus refetch; revisions remain optimistic; hunk acceptance is idempotent when already applied and conflictful when anchors diverge.
- What must stop happening after the transition: no active editor code parses documents into `CreedSection[]`; no active UI exposes Nest/Un-nest/section color controls; no MCP guidance tells agents to maintain personal profile sections; no new profile proposals write to `creed_proposals`; no document proposal is keyed only by heading section.
- Fitness functions that prove the target state is holding: two non-touching text edits produce two hunk proposals; two adjacent edits merge into one hunk proposal; all hunks from one edit share one family; accepting one hunk changes only that span; conflicting overlapping hunks show yellow and block blind accept; outline navigation changes when headings change without any section-table mutation; profile routes are removed, redirected, or compatibility-gated by an approved contract.

## Goals
- Remove the personal Creed profile as an active product model.
- Make shared documents the single content/workspace model.
- Render document editing as one continuous body rather than a list of section cards.
- Derive document outline and visual hierarchy from `H1` / `H2` / `H3` headings.
- Generate independent proposal hunks from non-touching diffs.
- Group hunks from one submitted edit into proposal families.
- Let reviewers accept, reject, comment on, and navigate hunks from inline UI and a side panel.
- Show conflicts clearly and require explicit conflict resolution.
- Keep Supabase-only document storage, edit policy, auth, versioning, and audit guarantees.

## Non-Goals
- No generic notes app pivot.
- No GitHub document sync.
- No dependency addition until the hunk algorithm spike proves the standard library and existing packages are insufficient.
- No bulk rewrite of Markdown serialization without tests across rich components.
- No temporary second proposal system for new work. Compatibility paths may exist only for migration and old agents.

## Confirmed Facts
- Current branch: codex/proposal-diff-editor-redesign.
- Current shared document proposals are per-section, grouped by `batch_id`.
- Current personal profile proposals are per-section, stored in `creed_proposals`.
- Current shared documents already have document versions and workspace edit policy.
- Current MCP instructions and tool descriptions still encode personal-profile and section-nesting concepts.
- User clarified that both shared documents and personal profiles are in scope, and personal profiles should be removed.

## Assumptions
- Existing user content in `creed_sections` must not be silently discarded; it needs migration, archival export, or an approved deletion policy.
- Existing MCP clients may continue calling old section tools for a period unless the compatibility decision chooses a hard break.
- The target editor can reuse current Tiptap extensions rather than replacing Tiptap.
- Hunk anchoring can be made deterministic using Markdown text ranges plus context, without storing DOM positions as the source of truth.
- Version history may still store one full snapshot per accepted write, but UI must group rows by family.

## Open Questions
- Should a migrated personal profile become a normal shared document, an archived export, or be deleted after user confirmation?
- Should the old MCP tool names remain as compatibility aliases that target a default document, or should they return migration errors?
- Should proposal families be a new table or an evolved `batch_id` column with richer metadata?
- Should accepting all hunks in a family create one document version or one version per hunk?
- Should conflict detection mark overlapping pending proposals at proposal creation time, review time, accept time, or all three?

## Decision Needed
- [critical][public-contract] Decide the public compatibility path for personal-profile MCP tools and token-auth profile routes after profile removal.
- [critical][data-model] Approve the proposal-family and hunk persistence schema before migrations are written.
- [critical][public-contract] Approve the MCP and app API payload shape for per-hunk classification, family IDs, conflicts, and bulk resolution.
- [critical][rollout] Approve migration and cutover behavior for existing `creed_sections`, `creed_proposals`, `creed_activity`, pending profile proposals, and connected agents.
- [critical][auth] Confirm whether the current signed-in shared workspace remains intentionally global after profile removal or whether workspace tenancy must be introduced first.
- [non-critical][observability] Choose final analytics/audit names for family creation, hunk accept/reject, conflict surfacing, and bulk resolution.

## Proposed Design

### Solution Overview
Converge Creed on one content model:

1. Shared documents are the only editable content objects.
2. The editor renders one document body.
3. The outline reads headings from the document body.
4. The edit router diffs full Markdown submissions into hunks.
5. Each hunk becomes one proposal row with a short classification.
6. All hunks from one submission share one proposal family.
7. Review UI toggles diff mode, shows inline hunk controls, and mirrors all hunks in a side panel.
8. Accept/reject all resolves the remaining hunks in the current family or filtered proposal set.
9. Version history groups accepted changes by family and expands to individual hunks.
10. Personal profile tables, routes, UI, and MCP language are migrated or removed according to the approved compatibility plan.

### Transition Plan From Current State
- Containment gate: do not modify migrations or public agent contracts until the critical Decision Needed items are resolved.
- Safe implementation slices: first introduce the hunk/family domain model behind tests; then migrate shared document proposals; then replace review UI; then replace the document editor; then remove/deprecate personal profile paths; then update docs and MCP copy.
- Old bypasses or compatibility paths to remove: `creed_sections` active writes, `creed_proposals` active writes, `app/api/creed/proposals/route.ts`, `app/api/creed/write/route.ts`, `buildAgentReadPayload` personal-profile contract, `documentSectionsToMarkdown`, `parseDocumentSections`, `SectionCard` in document mode, and `<!-- creed:depth=N -->` guidance.
- Baselines, suppressions, allowlists, or module-budget caps that remain temporarily: current profile imports may remain until the migration slice removes active callers. Any compatibility alias must have a removal condition.
- Revisit trigger for each accepted exception: remove compatibility once all connected tools use document APIs, once migrated data is verified, and once no profile-route traffic appears during the rollout window.

### End-to-End Flow
1. User or agent reads a shared document and receives `contentMarkdown` plus `revision`.
2. User or agent submits full replacement Markdown with `expectedRevision` and optional hunk classifications or an overall summary.
3. `routeDocumentEdit` reads workspace policy.
4. Under direct policy, the document body is applied and a version is appended.
5. Under propose policy, the hunk engine compares base content with proposed content and emits ordered hunk changes.
6. The server creates one proposal family and one proposal per reviewable hunk.
7. The UI enters or offers diff mode. The top summary shows aggregate counts and a show/hide diff toggle.
8. Inline decorations mark additions, removals, and conflicts. Hovering a hunk shows classification, accept, reject, and comment controls.
9. The side panel lists hunks in document order and smooth-scrolls to each hunk.
10. Accepting a hunk applies only that hunk through the merge guard, appends or updates version history according to the family policy, and resolves open comments attached to that hunk if appropriate.
11. Rejecting a hunk marks only that proposal rejected.
12. Conflicting hunks show yellow. The resolver displays competing candidate changes and requires an explicit accept/reject choice.
13. Version history shows one collapsed family row such as "Declan made changes"; expanding reveals every hunk proposal in that family.

### Component and Module Changes

#### UI or Client
- Replace document-mode `SectionCard` rendering in `components/creed/file-screen.tsx` with a document-level editor component.
- Keep the existing Tiptap extension set from `components/creed/rich-text-editor.tsx`, but expose document-level editing and decoration hooks.
- Add a heading outline parser for `H1` / `H2` / `H3` navigation. This outline is derived from editor state or Markdown, never persisted as sections.
- Add diff mode state: hidden, visible, focused hunk, side panel open, and conflict resolver state.
- Replace `DocumentReviewPill` with a summary control that toggles the total diff and opens the hunk side panel.
- Add a bottom floating bar for Accept all / Reject all while diff mode is visible.
- Preserve comments, mentions, public link toolbar behavior, document properties, and document share controls.

#### API or Application Layer
- Keep `app/api/app/documents/[id]/route.ts` as the app edit entry point.
- Keep document proposal list/accept/reject endpoints, but return hunk/family fields instead of section fields.
- Add bulk resolution endpoints or extend existing endpoints only after the API contract decision.
- Update `app/mcp/route.ts` instructions and document tool schemas to remove profile guidance and section-depth guidance.
- Decommission or compatibility-gate token-auth profile routes according to the public contract decision.

#### Domain or Business Logic
- Replace `diffMarkdownSections` with a hunk diff engine that can emit:
  - stable family ID;
  - hunk index;
  - before text;
  - after text;
  - surrounding context;
  - Markdown range or anchor;
  - classification;
  - conflict state.
- Replace `applySectionChange` with hunk apply that checks base context, detects already-applied hunks, rejects ambiguous context, and preserves untouched Markdown exactly.
- Retain `routeDocumentEdit` as the policy gateway.
- Retain no-op detection using rendered/review text normalization, but scope it to hunks.

#### Data Model and Persistence
- Candidate family table: `creed_document_proposal_families(id, document_id, actor_type, author_user_id, author_agent_label, summary, base_revision, status, created_at, resolved_at, resolved_by)`.
- Candidate proposal changes:
  - add `family_id` or rename semantics from `batch_id`;
  - add `hunk_index`;
  - add `classification`;
  - add `conflict_status`;
  - store hunk before/after/context/anchor in `draft`;
  - make `section_id` legacy nullable and unused for new rows.
- Candidate version changes:
  - add `source_proposal_family_id`, or infer family through `source_proposal_id`;
  - keep full content snapshots for rollback/read simplicity.
- Profile data migration:
  - migrate each existing personal profile into a normal document, archive export, or approved deletion path;
  - close/reject/migrate pending `creed_proposals`;
  - preserve audit history if required by the rollout decision.

#### Integrations, Events, or Background Jobs
- MCP tools become document-first. Agents list/read/update documents rather than reading a personal profile.
- Connection usage can remain in `creed_connections` if it is not profile-specific, but observed-via labels should distinguish document read, proposal family, direct edit, and comment proposal.
- Realtime subscriptions for document proposals and versions remain, with family/hunk payloads.

#### Security and Permissions
- Keep `requireApiAuth()` on all app routes.
- Keep hashed-token verification for MCP and any remaining token-auth agent route.
- Keep workspace edit policy as the server authority for agent/human edits.
- Use service-role writes server-side; clients read via RLS.
- Do not let compatibility aliases bypass workspace policy or optimistic revision checks.

#### Performance and Scalability
- Hunk diff should run server-side within the existing request budget for typical documents.
- Client diff decorations should virtualize or lazily render where needed for long documents.
- Proposal side panel should render a compact list and only expand focused hunk details.
- Avoid adding heavy diff dependencies unless the spike proves the existing `diff` package cannot satisfy hunk extraction and display.

#### Observability and Operations
- Record family creation, hunk accept, hunk reject, bulk accept/reject, conflict detected, and conflict resolved in document activity.
- Add structured server logs through `lib/observability.ts` for unexpected hunk apply failures.
- During rollout, track traffic to legacy profile routes and old MCP section tools.
- Document rollback: disable hunk proposal feature flag, keep old section proposal read path for legacy rows, and stop accepting new profile-route writes if migration has started.

## Impacted Surfaces Matrix
- UI: `components/creed/file-screen.tsx`, `components/creed/document-review-panel.tsx`, `components/creed/rich-text-editor.tsx`, `components/creed/shell.tsx`, personal profile review components, settings references to profile sections.
- API: `app/api/app/documents/[id]/route.ts`, document proposal endpoints, `app/mcp/route.ts`, token-auth profile routes, `app/api/app/state/route.ts`, `app/api/app/profile/route.ts`, `app/api/app/claim/route.ts`.
- Domain logic: `lib/document-editing.ts`, `lib/document-section-diff.ts`, new hunk diff module, `lib/shared-documents.ts`, `lib/document-collaboration.ts`, `lib/creed-data.ts`, `lib/creed-backend.ts`.
- Persistence: `creed_document_proposals`, `creed_document_versions`, new family schema, legacy `creed_sections`, `creed_proposals`, `creed_activity`.
- Integrations: MCP tools, connected agent instructions, connection usage records.
- Auth: app auth, token auth, workspace edit policy, possible workspace tenancy decision.
- Infra: Supabase migrations, realtime publication, PostgREST schema reload.
- Telemetry: document activity events, structured logs, compatibility traffic metrics.
- Tests: hunk diff unit tests, edit router tests, migration tests, MCP schema tests, UI interaction tests.
- Docs: `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, public docs, MCP instructions.

## Change Impact Map
- Direct impact: proposal creation, proposal review, document editing, MCP agent behavior, profile storage, version history display, comments on proposals.
- Indirect impact: dashboard document list, settings, onboarding, auth redirects, shell outline, public document shares, link previews, rich-text round-trip.
- Unchanged but risk-adjacent areas: document metadata editing, public share links, folder tree, workspace member listing, Supabase auth, link preview cache.

## Invariants and Forbidden Outcomes
- Do not lose existing user content during profile removal.
- Do not create new active writes to personal profile section tables after cutover.
- Do not persist editor nesting outside Markdown headings.
- Do not accept a hunk if its base context no longer matches and the conflict has not been resolved.
- Do not let Accept all silently choose between conflicting hunks.
- Do not store comments without a clear hunk/proposal/document reference.
- Do not reintroduce GitHub document sync.
- Do not ship MCP guidance that tells agents to maintain personal profile sections.
- Do not let old section compatibility bypass workspace edit policy.

## Compatibility Matrix
- Public API: existing document APIs can evolve response payloads behind version-tolerant clients; profile APIs need an approved redirect, alias, or removal policy.
- Internal API: `DocumentProposal` types change from section fields to hunk/family fields; old section fields remain only for legacy row display if needed.
- Data schema: additive migration first; legacy columns stay nullable until legacy rows age out or are migrated.
- Events: `document.proposal.created` should become family-aware; hunk-level accept/reject events should include family ID and hunk index.
- Cache keys: client proposal caches must include family/hunk revision and not key by section heading.
- Config: workspace edit policy remains; profile `requireApproval` must be retired or mapped.
- External consumers: MCP clients and connected agents are the main consumers. They require explicit migration messaging and stable error responses.
- Rollback compatibility: old section proposal rows must remain readable while hunk feature is disabled; profile content migration must be reversible or auditable before destructive cleanup.

## Contract Examples and Before/After Payloads
- Request examples:
  - Current MCP document update:
    ~~~json
    {
      "documentId": "doc-id",
      "expectedRevision": 4,
      "contentMarkdown": "# Plan\n\nOld text changed."
    }
    ~~~
  - Target optional classification envelope, pending contract decision:
    ~~~json
    {
      "documentId": "doc-id",
      "expectedRevision": 4,
      "contentMarkdown": "# Plan\n\nNew text changed.",
      "summary": "Clarified launch plan",
      "classifications": [
        {
          "clientHunkKey": "optional-client-key",
          "label": "Clarifies launch wording"
        }
      ]
    }
    ~~~
- Response examples:
  - Target proposed response:
    ~~~json
    {
      "ok": true,
      "outcome": "proposed",
      "family": {
        "id": "family-id",
        "summary": "Clarified launch plan",
        "proposalCount": 2
      },
      "proposals": [
        {
          "id": "proposal-id",
          "familyId": "family-id",
          "hunkIndex": 0,
          "classification": "Clarifies launch wording",
          "conflictStatus": "clean"
        }
      ]
    }
    ~~~
- Event or message examples:
  - `document.proposal_family.created`
  - `document.proposal_hunk.accepted`
  - `document.proposal_hunk.rejected`
  - `document.proposal_hunk.conflict_detected`
- Before/after comparisons:
  - Before: one edit touching two headings creates two section proposals with one `batch_id`.
  - After: one edit touching two non-touching spans creates two hunk proposals with one `family_id`.
  - Before: version history lists accepted section proposals individually.
  - After: version history shows a family row and expands to hunk rows.
  - Before: nesting stored with section depth and `<!-- creed:depth=N -->`.
  - After: outline depth is derived from actual Markdown heading levels.

## Cross-Cutting Applicability Matrix
- Security: server policy routing remains central; token-auth compatibility must not bypass auth or policy.
- Privacy: migrated personal profile content may contain sensitive personal data and must not become a shared document without approved visibility semantics.
- Performance: hunk diff, decoration rendering, and side-panel navigation need explicit targets and tests.
- Resilience: accept/reject paths must be idempotent for already-applied or already-resolved states and conflictful for divergent anchors.
- Migration: profile tables and section proposals require a migration or archival plan before removal.
- Observability: document activity and structured logs need family/hunk event names.
- Supportability: old agents need actionable errors or aliases during the rollout window.
- Backward compatibility: legacy document section proposals may need display/resolve code until they are resolved or migrated.

## Success Metrics and Numeric NFR Targets
- Latency targets: for documents up to 50,000 Markdown characters, hunk proposal creation p95 under 750ms server time; hunk accept/reject p95 under 500ms excluding network; side panel hunk navigation under 100ms after data is loaded.
- Throughput or concurrency targets: concurrent accept/reject on the same hunk produces exactly one resolution; 10 pending hunks can be bulk accepted sequentially without corrupting content.
- Error-rate or availability targets: hunk apply conflict false-positive rate under 2 percent in seeded regression fixtures; no unhandled 500s for stale proposal accept/reject paths.
- Timeout, retry, or queue-depth limits: server diff/apply path should complete within the route default timeout; client review refresh keeps the existing 5s visible polling/realtime fallback until realtime is proven sufficient.

## Decision Register

### DES-001: Remove Personal Profile As Active Product Model
- Context: user clarified this redesign applies to both shared documents and personal Creed profiles, and personal profiles should be removed.
- Current-state gap: `lib/creed-data.ts`, `lib/creed-backend.ts`, `components/creed/creed-provider.tsx`, and token-auth profile routes still encode the 10-section personal profile contract.
- Decision: target architecture has no active personal Creed profile editor, section table writes, profile proposal workflow, or profile-first MCP guidance.
- Rationale: keeping both models would preserve the current confusion and duplicate proposal systems.
- Tradeoffs: requires migration and public contract work before code removal; old connected agents may need compatibility responses.
- Affected surfaces: UI, MCP, app APIs, token-auth APIs, persistence, docs, tests.
- Fitness signal: no active route or UI path creates or edits `CreedSection` profile rows after cutover.

### DES-002: Use One Continuous Document Editor
- Context: current shared documents are converted into fake sections and rendered as draggable section cards.
- Current-state gap: document body editing is split across section cards and loses the user's desired continuous diff experience.
- Decision: target document editing uses a single document-level Tiptap editor bound to one Markdown body.
- Rationale: hunk proposals and inline diff decorations require a continuous surface.
- Tradeoffs: existing section CRUD UI must be removed or redesigned as document editing commands.
- Affected surfaces: `components/creed/file-screen.tsx`, `components/creed/rich-text-editor.tsx`, `lib/document-sections.ts`.
- Fitness signal: document mode no longer imports or calls `parseDocumentSections` or `documentSectionsToMarkdown`.

### DES-003: Derive Navigation From H1/H2/H3 Headings
- Context: user explicitly wants no real nesting and navigation represented by headings.
- Current-state gap: section depth is persisted in `CreedSection.depth` and serialized with `<!-- creed:depth=N -->` in document guidance.
- Decision: outline items are derived from Markdown heading levels `#`, `##`, and `###`; no separate nesting metadata is stored.
- Rationale: Markdown headings are portable, visible, and round-trip without hidden Creed-specific markers.
- Tradeoffs: users reorder or nest by editing headings, not dragging section cards.
- Affected surfaces: shell outline, editor commands, MCP docs, Markdown parser.
- Fitness signal: changing an `H2` to an `H3` changes outline nesting without any database section update.

### DES-004: Create One Proposal Per Reviewable Hunk
- Context: user wants three consecutive changed words and a separate later changed span to become two proposals when they do not touch.
- Current-state gap: current document proposals are section-scoped and too coarse.
- Decision: proposal creation emits one proposal row per contiguous reviewable hunk.
- Rationale: reviewers can accept or reject each real change independently.
- Tradeoffs: more rows, more UI state, stronger conflict detection required.
- Affected surfaces: `lib/document-editing.ts`, new hunk diff module, proposal APIs, review UI, tests.
- Fitness signal: non-touching edits in one paragraph or across paragraphs create distinct proposals.

### DES-005: Group Hunks Into Proposal Families
- Context: user wants many smaller proposals without making version history unreadable.
- Current-state gap: `batch_id` groups section proposals, but version history still reasons about individual proposal rows.
- Decision: all hunks from one submitted edit share a proposal family used by review summary, bulk actions, activity, and version history.
- Rationale: family grouping preserves the author's intent and keeps review history readable.
- Tradeoffs: schema and API payloads become richer.
- Affected surfaces: proposal schema, document activity, version history UI, bulk endpoints.
- Fitness signal: the UI can collapse and expand a family row showing all hunk proposals from that edit.

### DES-006: Add Diff Mode With Inline And Side-Panel Review
- Context: user wants show/hide diff, a side list, smooth navigation, hover controls, and bottom bulk actions.
- Current-state gap: current proposals render as cards at section bottoms and a summary pill, not as inline decorations.
- Decision: review UI adds a diff mode that decorates the editor, lists hunks in a sidebar, and exposes inline hunk actions.
- Rationale: reviewers should resolve changes while reading the edited document.
- Tradeoffs: requires editor decoration plumbing and careful mobile/desktop layout.
- Affected surfaces: `components/creed/document-review-panel.tsx`, document editor, comments UI, shell layout.
- Fitness signal: clicking a side-panel hunk smoothly scrolls to the decorated hunk and focuses its controls.

### DES-007: Treat Conflicts As First-Class Hunk State
- Context: multiple agents may edit overlapping or adjacent content.
- Current-state gap: current section apply returns a conflict only at accept time and the UI has no yellow conflict resolver.
- Decision: hunk proposals can be marked clean, conflicting, or resolved, and conflicts render yellow with an explicit resolver.
- Rationale: Accept all must never silently choose between competing edits.
- Tradeoffs: conflict detection needs both creation-time overlap checks and accept-time merge guards.
- Affected surfaces: schema, hunk apply, review UI, bulk resolution, tests.
- Fitness signal: overlapping pending hunks cannot both be blindly accepted through Accept all.

### DES-008: Keep Comments Flat And Attach Them To Hunks
- Context: user wants a comment button on hunk hover and no nested comments in this proposal flow.
- Current-state gap: existing document comments allow `parent_id` replies and proposal-linked comments.
- Decision: proposal hunk comments attach to proposal/hunk IDs and display as one-level threads for this UI.
- Rationale: hunk review comments should be quick review notes, not nested discussions.
- Tradeoffs: existing reply functionality must be hidden or constrained in hunk review mode.
- Affected surfaces: `lib/document-collaboration.ts`, comment endpoints, `MentionTextarea`, review side panel.
- Fitness signal: a hunk comment appears under that hunk in the side panel and does not create nested review replies.

### DES-009: Preserve Central Policy, Versioning, And Supabase Ownership
- Context: shared document Model S already centralizes policy and versions in Supabase.
- Current-state gap: personal profile routes bypass this document edit router.
- Decision: all new content mutations go through the document edit router or a direct equivalent that uses workspace policy, optimistic revisions, and append-only versions.
- Rationale: one write path reduces data loss and permission risk.
- Tradeoffs: profile direct-edit convenience must be removed or remapped.
- Affected surfaces: `lib/document-editing.ts`, `app/mcp/route.ts`, token-auth profile routes, `lib/creed-backend.ts`.
- Fitness signal: hunk accept, bulk accept, MCP update, and UI save all append document versions through the same central path.

### DES-010: Gate Implementation On Migration And Public Contract Decisions
- Context: this change removes a public product model and public agent contract.
- Current-state gap: existing agents and users may still rely on profile routes and pending profile proposals.
- Decision: implementation tasks stay blocked until migration, data model, MCP/API compatibility, rollout, and auth decisions are resolved.
- Rationale: code-first removal risks content loss and broken integrations.
- Tradeoffs: delays implementation but avoids irreversible mistakes.
- Affected surfaces: all public and data surfaces listed above.
- Fitness signal: migration and contract choices are documented before any destructive migration or route removal.

## Risk Register
- Risk: existing personal profile content becomes visible to shared workspace users if blindly migrated into shared documents.
  - Impact: privacy breach.
  - Mitigation: decide visibility semantics before migration; default to private archive or explicit user confirmation if needed.
  - Residual risk: low after approved migration design and tests.
- Risk: hunk anchoring applies a change to the wrong repeated text.
  - Impact: document corruption.
  - Mitigation: store surrounding context and reject ambiguous anchors; add repeated-text fixtures.
  - Residual risk: medium because natural language has repeated phrases.
- Risk: old MCP clients break abruptly.
  - Impact: connected agents fail or submit profile-shaped proposals.
  - Mitigation: compatibility alias or explicit migration error window; traffic monitoring.
  - Residual risk: medium until traffic confirms low legacy use.
- Risk: diff decorations make the editor slow on long documents.
  - Impact: poor review experience.
  - Mitigation: measure long-document fixtures, render compact side panel, lazy-render expanded hunk details.
  - Residual risk: medium until Playwright verification.
- Risk: profile code removal touches large hotspot files.
  - Impact: regression in unrelated settings, onboarding, or dashboard flows.
  - Mitigation: slice changes, run focused tests, run full TypeScript/lint/build, and review each slice.
  - Residual risk: high until implementation is complete.

## Residual Risks
- Privacy semantics for migrated personal profile data remain unresolved until SPIKE-001 and SPIKE-005 close.
- Hunk anchoring around repeated text remains inherently risky until fixtures prove deterministic conflict behavior.
- Old MCP client behavior remains uncertain until compatibility traffic is measured during rollout.
- UI performance on long documents remains unproven until a document-level editor prototype and Playwright timing pass exist.
- Large-file refactors remain risky because `components/creed/file-screen.tsx`, `lib/creed-data.ts`, and `lib/creed-backend.ts` are current hotspots.

## Test Impact Matrix
- Existing tests to update: `tests/document-editing.test.ts` per-section proposal tests become hunk-family proposal tests; any profile route/provider tests must be removed or converted to document-first behavior.
- New tests required: hunk extraction, adjacent versus non-touching changes, repeated-text anchors, conflict detection, family grouping, bulk accept/reject, flat hunk comments, heading-derived outline, MCP document update response.
- Compatibility tests: legacy document section proposal rows still list and resolve if retained; old profile tools return approved alias or removal response.
- Rollback-safety tests: disabling hunk proposals keeps legacy section proposal display for existing rows; migration can be audited or reversed according to rollout decision.

## Validation Strategy
- Spec stage: run spec lint, local reference check, traceability report, summary generation, and drift check where possible.
- Domain stage: run focused unit tests for hunk diff/apply before UI changes.
- API stage: run route tests for proposal family creation, resolution, and conflict behavior.
- Migration stage: run `supabase db reset` locally after migrations and verify migrated fixtures.
- UI stage: run Playwright review flows for desktop and mobile: show diff, side-panel navigation, hover controls, comments, conflict resolver, accept/reject all.
- Final stage: run `npx tsc --noEmit -p .`, `npm run lint`, and `npm run build`.

## Post-Design Review
- Original plan coverage review: all user-requested concepts are represented: removal of sections/profile model, heading navigation, hunk proposals, classification, total diff toggle, side panel, inline accept/reject/comment, conflict UI, floating bulk actions, and version family grouping.
- Repository evidence review: design is grounded in the current files and tables listed in Repository Discovery Summary.
- Architecture standards review: target centralizes ownership, narrows write paths, avoids dual models, and blocks implementation on high-risk decisions.
- Requirements readiness: requirements can be authored, but implementation remains blocked by critical decisions.
- Required upstream changes before requirements authoring: none for requirements, but implementation tasks must wait for Decision Needed items.

## Rollout, Abort, and Reversal
- Rollout: ship behind a server/client feature flag after migrations; migrate or archive profile data; enable document hunk proposals for a small internal set; monitor legacy MCP/profile route traffic; then remove profile UI and update docs.
- Abort: disable hunk proposal creation, keep old document proposal rows readable, stop destructive profile cleanup, and route new edits through the previous document section proposal path if still present.
- Reversal: restore prior document review UI for legacy rows, keep migrated profile export references, and use append-only document versions to roll back document content when needed.

## Forbidden Shortcuts and Guardrails
- Do not edit migrations until schema and rollout decisions are approved.
- Do not delete `creed_sections` data without a verified migration/export/deletion decision.
- Do not keep the old personal-profile contract in MCP instructions after cutover.
- Do not fake hunk proposals by hiding section proposals in the UI.
- Do not implement comments as nested proposal discussions.
- Do not add a new diff dependency without documenting why existing `diff` usage is insufficient.
- Do not touch `lib/creed-data.ts::collaborationRules` without testing the new agent contract across at least two models.

## Alternatives Considered
- Alternative: keep personal profiles and only redesign shared documents.
  - Why rejected: user explicitly clarified "its both" and "remoce it".
- Alternative: keep per-section proposals but show them as inline diffs.
  - Why rejected: it would not create separate proposals for non-touching changes inside one section.
- Alternative: store editor outline as a new tree table.
  - Why rejected: user wants no real nesting; headings already express navigation.
- Alternative: store only patch deltas instead of full document versions.
  - Why rejected: append-only full snapshots are already implemented and simpler to roll back.
- Alternative: implement hunk UI first and migrate profile code later.
  - Why rejected: MCP and profile contracts shape the core proposal system; delaying the decision would cause churn and compatibility risk.
