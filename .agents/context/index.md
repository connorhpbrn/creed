# Creed Context

This versioned folder contains durable product and system truth for agents
working on Creed. Code remains canonical when documentation drifts.

## Start here

1. Read [`lucidity.md`](../../lucidity.md) at the repo root. It is the
   decision backbone for this project. Do not casually rewrite it.
2. Read `current.md` for shipped behaviour and active risks.
3. Read only the task-relevant files below.
4. Inspect the exact code path before editing.
5. Use a matching repository skill from `.agents/skills/` when one exists.

## File guide

- `product.md` - product thesis, audience, core loops, priorities, and non-goals.
- `brand.md` - promise, voice, imagery, and brand meaning.
- `architecture.md` - routes, state, persistence, integrations, and security boundaries.
- `decisions.md` - durable decisions future agents should not reopen casually.
- `roadmap.md` - future work and parked directions, not current truth.

## Task routing

- Product behaviour or copy: `product.md`, `decisions.md`, then the code path.
- UI, motion, or layout: `brand.md`, then the surrounding components and styles.
- Backend, auth, persistence, or integrations: `architecture.md`, then nearby routes and helpers.
- Quality analysis: read the quality rubric, implementation, and relevant UI.
- Future planning: `roadmap.md`, checked against `current.md` and the code.

## Non-negotiable posture

- Creed is a personal-context curation product, not a notes app, journal, memory feed, or generic AI wrapper.
- Keep the file sacred, portable, high-signal, and worth reading.
- Marketing and product UI should feel calm, premium, editorial, and document-first.
- Never put personal information in source. Use environment-backed branding values.
- Protect authentication, token hashing, encryption, RLS, and the static marketing layout boundaries.
- Do not use em dashes in product copy, prompts, comments, or context.
- Update context only when a durable product, architecture, decision, roadmap, brand, or current-state truth changes.
