# Changelog policy

Public changelog entries live in
[`apps/creed/lib/marketing/changelog.ts`](./apps/creed/lib/marketing/changelog.ts) and render on
`/changelog`. This file is the rule for when to add one.

## When to add an entry

Add an entry only when something **user-facing and durable** ships:

- A new product surface (page, plan, CLI, major tool)
- A capability users can feel without reading the diff
- A pricing, billing, or access change people need to know about
- A public benchmark, docs section, or launch that changes how Creed is
  described externally

One entry per real ship. Newest first. Write for users, not for git.

## When not to add an entry

Skip the changelog for:

- Tiny UI polish, spacing, copy tweaks, animation nits
- Refactors, cleanup, type fixes, dependency bumps
- Internal harness, test, or infra work with no product story
- Chart refreshes, model score updates, or data regenerations on an
  existing surface (unless the surface itself is new)
- Bugfixes unless they reverse a widely felt breakage

If you are unsure, leave it out. A short, major-only changelog is more
honest than a busy one.

## How to write an entry

1. Edit `apps/creed/lib/marketing/changelog.ts` (not this file).
2. Use today's ISO date (`YYYY-MM-DD`).
3. Title: short product name, not a commit subject.
4. Body: one or two sentences of what changed and why it matters.
5. Optional `highlights`: concrete bullets users can act on.
6. No em dashes. No raw commit lists. No "various improvements."
