---
name: refactor
description: Carefully improve existing code structure while preserving behavior. Use whenever the user asks to refactor, restructure, simplify, extract, consolidate, split, or clean up existing code.
---

# Refactor

Improve internal structure without intentionally changing externally observable behavior.

## Core Rules

- Read the repository instructions and trace the relevant code path before editing.
- Inspect the working tree and preserve unrelated user changes.
- Establish the behavior, interfaces, state, side effects, and dependencies that must remain stable.
- Keep structural work separate from behavior changes unless the user requests both.
- Choose the smallest coherent scope that achieves the requested improvement.
- Match surrounding conventions instead of introducing a competing pattern.
- Never add a dependency merely to make a refactor easier.
- Never rewrite a large file wholesale when focused edits or a clear extraction are sufficient.

## Approach

1. Identify the real structural problem, such as duplication, mixed ownership, unclear boundaries, excessive coupling, or unnecessary complexity.
2. Inspect callers, consumers, tests, and public interfaces before choosing the change.
3. Briefly state the intended scope when the refactor is broad or risky. Do not force a separate approval step unless the scope is genuinely ambiguous or materially expands beyond the request.
4. Refactor in small, coherent batches while keeping the code runnable.
5. Run focused checks after risky changes and the repository-required checks before finishing.
6. Review the final diff for accidental behavior changes, scope creep, dead code, stale exports, compatibility leftovers, and formatting churn.

Prefer removing unnecessary complexity over hiding it behind a new abstraction. Extract code only when the new unit has a clear owner and stable boundary. Do not split files merely to reduce line count or create abstractions for hypothetical future reuse.

## Extra-Care Boundaries

Pause and obtain direction before changing:

- public APIs or exported contracts
- database schemas, persistence formats, or migrations
- authentication, authorization, encryption, or security boundaries
- agent contracts or externally consumed prompts
- behavior that cannot be established from code, tests, or user evidence
- scope that becomes materially larger than the request

## Verification

Use evidence proportionate to the affected surface:

- typecheck and lint for structural TypeScript changes
- focused tests for logic and data-flow changes
- runtime or browser checks for UI behavior
- before-and-after output comparison where equivalence matters
- final diff inspection in every case

Passing TypeScript alone is not proof that runtime behavior is unchanged. Report any verification that could not be completed and the remaining risk.

## Anti-Patterns

- Do not mix unrelated cleanup into the refactor.
- Do not replace established local patterns with personal preferences.
- Do not rename broadly without proving every reference is covered.
- Do not leave duplicate helpers, stale exports, or temporary compatibility wrappers without a deliberate reason.
- Do not claim behavior was preserved without checking the relevant path.

## Report

Summarize the structural improvement, files changed, behavior preserved, and verification performed.
