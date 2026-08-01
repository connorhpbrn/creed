---
name: debug
description: Diagnose bugs, regressions, failing checks, unexpected behavior, and performance problems from concrete evidence before changing code. Apply automatically whenever the user asks to debug, investigate, fix a bug, explain a failure, or determine why something is not working.
---

# Debug

Find the smallest proven cause before choosing a fix.

## Authority

- If the user asks only for diagnosis, remain read-only and report the cause and recommended fix.
- If the user asks to fix the problem, diagnose first, then implement the smallest correction within the requested scope.
- Preserve unrelated user changes and do not use destructive Git operations to manufacture a clean baseline.

## Workflow

1. Restate the observed failure precisely: expected behavior, actual behavior, environment, frequency, and earliest known boundary.
2. Read repository instructions, current diffs, the exact execution path, and relevant logs or errors.
3. Reproduce the failure or establish the strongest available evidence before editing.
4. Trace the flow across UI, state, network, API, authentication, persistence, external services, and rendering as relevant.
5. Form a small set of falsifiable hypotheses. Rank them by evidence and test the cheapest discriminating check first.
6. Identify the root cause, not merely the line where the symptom becomes visible.
7. Implement one focused fix when authorized.
8. Add or update a focused regression test when the behavior is non-obvious and a stable test surface exists.
9. Verify the original reproduction, nearby edge cases, and required repository checks.
10. Remove temporary instrumentation and review the final diff for speculative or unrelated changes.

## Evidence Rules

- Distinguish confirmed facts, strong inferences, and untested hypotheses.
- Prefer runtime evidence, minimal reproductions, existing tests, structured logs, and direct code tracing over architectural guesses.
- Compare working and failing paths when possible.
- Check recent diffs and dependency, environment, schema, cache, and deployment changes before blaming unrelated code.
- Do not treat a disappeared symptom as proof of a fixed cause.
- Do not change several variables at once unless they are inseparable.

## Instrumentation

- Use existing observability and diagnostics before adding new logging.
- Use `lib/observability.ts` for server logging. Do not add `console.log` to committed code.
- Never log secrets, tokens, personal content, raw credentials, or unnecessary user data.
- Keep temporary diagnostics narrow and remove them before completion unless durable observability is part of the requested fix.

## Common Boundaries

- For UI bugs, verify state ownership, event ordering, effects, memoization, remounts, responsive behavior, focus, and stale closures.
- For API bugs, verify authentication, validation, ownership, status codes, retries, and client assumptions.
- For data bugs, verify schema, RLS, service-role bypass, active Creed scope, transactions, and stale generated types.
- For performance bugs, measure the slow boundary before optimizing and compare before-and-after evidence.
- For environment-only failures, inspect configuration and generated caches before changing source.

## Stop Conditions

Stop and request missing evidence or direction when the failure cannot be reproduced or bounded, the proposed fix changes intended product behavior, production access is required, external state would be mutated, or multiple causes remain equally plausible after safe checks are exhausted.

## Report

Lead with the confirmed cause. State the evidence, fix when applied, verification result, and any residual uncertainty. Do not bury uncertainty beneath a confident summary.
