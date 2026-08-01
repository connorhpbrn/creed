---
name: review
description: Review completed repository code changes for actionable defects, regressions, unsafe behavior, and incomplete verification. Apply automatically after meaningful code edits and before claiming the work is done, and when the user asks to review, inspect, audit, or check a diff or implementation.
---

# Review

Inspect the real change as a skeptical maintainer and catch consequential problems before handoff or commit.

## Scope

1. Read the repository instructions and task-relevant context.
2. Inspect `git status`, unstaged changes, staged changes, and untracked files.
3. Reconstruct the user's intended outcome and identify the exact diff that belongs to it.
4. Preserve and exclude unrelated user changes. Mention them only when they materially block the review.
5. Read enough surrounding code, callers, consumers, types, tests, and data flow to evaluate behavior rather than syntax alone.

## Review Order

Review in descending consequence:

1. **Correctness:** broken logic, wrong assumptions, missing states, races, stale closures, invalid data flow, and edge cases.
2. **Safety:** auth or ownership gaps, exposed secrets or personal information, data loss, unsafe migrations, token handling, and destructive behavior.
3. **Regression risk:** changed public interfaces, persistence formats, accessibility, responsive behavior, performance, or compatibility paths.
4. **Completeness:** requested behavior only partially implemented, missing loading or error states, dead branches, stale exports, or abandoned temporary code.
5. **Repository fit:** violated local patterns, unnecessary dependencies, forbidden logging, weak types, unrelated formatting churn, or stale context and skill references.
6. **Verification:** missing or inadequate checks for the affected surface, and claims unsupported by evidence.

For UI changes, inspect desktop and mobile behavior, keyboard and pointer interaction, focus, clipping, loading, empty, and error states when relevant. For API and data changes, trace authentication, validation, ownership, persistence, response behavior, and audit effects end to end.

## Findings Bar

Report only actionable findings that could affect behavior, security, reliability, maintainability, or the user's stated intent. Do not manufacture findings to appear thorough. Avoid subjective style comments unless a clear repository convention is violated.

Each finding must include:

- severity: `critical`, `high`, `medium`, or `low`
- the tightest useful file and line reference
- the concrete failure or maintenance cost
- the condition under which it occurs
- the smallest credible correction

Order findings by severity. Combine duplicates that share one root cause.

## Corrections

When reviewing work the agent is currently authorized to implement, fix clear in-scope defects, rerun the relevant checks, and review the resulting diff again. Ask before fixing when the correction materially expands scope, changes intended behavior, alters a public contract, or requires a consequential external action.

When the user requested review only, remain read-only. Report findings without modifying files.

Never stage, commit, push, amend, rebase, or alter Git history as part of review.

## Verification

- Run checks proportionate to the changed surface and repository requirements.
- Prefer focused checks first, then broader checks when risk warrants them.
- Treat typecheck and lint as evidence, not proof of runtime correctness.
- Never claim a check passed unless it actually ran successfully.
- Identify pre-existing failures separately from failures introduced by the change.
- Inspect the final diff even when automated checks pass.

## Report

Lead with actionable findings. If none remain, state that no actionable findings were found, summarize the reviewed scope, and list the verification performed. Call out residual risk only when a relevant check could not be completed or an important behavior could not be observed.
