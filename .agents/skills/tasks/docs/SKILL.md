---
name: docs
description: Keep Creed's standalone user documentation accurate, minimal, and aligned with shipped behavior. Apply automatically when changing apps/docs, setup or doctor flows, deployment and hosting support, configuration or environment variables, agent connections, MCP or HTTP interfaces, permissions, maintenance, troubleshooting, privacy behavior, or any product change that may require docs.creed.md to change. Also apply when explicitly asked to add, edit, review, or plan Creed documentation.
---

# Docs

Maintain `docs.creed.md` as the smallest complete guide to using and self-hosting Creed Open.

## Establish truth

1. Read `.agents/context/index.md`, then the task-relevant context and implementation.
2. Read `.agents/skills/tasks/copy/SKILL.md` before changing user-facing language.
3. Treat code, scripts, environment examples, migrations, and supported client configuration as canonical. Never document a planned capability as shipped.
4. Distinguish clearly between a supported preset, a platform-neutral hosting contract, and an unverified possibility.

For a hosting provider such as Railway, inspect the actual deployment configuration and verify the complete setup path before naming it as supported. If Creed only satisfies the generic Node.js contract, keep it under generic hosting guidance.

## Decide the documentation impact

Update docs when a change affects what a user must know, choose, run, configure, connect, maintain, recover, or trust. Skip docs for internal refactors, tests, and implementation details with no user-visible consequence.

Map changes to the narrowest existing section:

- installation, prerequisites, setup, or doctor: `Start here` or `Self-host Creed`
- deployment providers, environment configuration, updates, or backups: `Self-host Creed`
- editor behavior, sections, proposals, permissions, quality, Graph Tags, or Nexus: `Use Creed`
- MCP clients, agent behavior, tokens, or HTTP fallback: `Connect agents`
- protocol surfaces, errors, recovery, security, storage, or privacy: `Reference and help`

Prefer extending an existing entry or adding an `h3` subsection. Add a new sidebar entry only when the subject needs its own durable destination. Add a new top-level group only when the current information architecture genuinely cannot contain it.

## Edit the canonical surface

The standalone app in `apps/docs/` exclusively owns `docs.creed.md`.

- Put documentation entries and navigation metadata in `apps/docs/components/docs-content.tsx`.
- Use `DocsCommand` for commands, URLs, and literal terminal input.
- Use `InlineCode` for paths, environment names, endpoints, tool names, and short literals.
- Use `Steps` only for ordered procedures, `Bullets` for unordered facts, and `Note` only for a constraint worth interrupting the reading flow.
- Keep entry IDs unique, stable, lowercase, and suitable for URL fragments.
- Keep group names and labels short enough for the left sidebar.
- Preserve the shared shell, editor-derived typography, purple callouts, syntax highlighting, responsive navigation, and `M` theme shortcut unless the task explicitly changes the design.
- Do not recreate `/docs` routes in Open, Cloud, or shared packages.

Write only what the user needs to succeed. Lead with the action or fact, keep paragraphs short, omit section-summary filler, and avoid repeating the same instruction across entries. Preserve exact commands and identifiers. Never use em dashes.

## Reconcile related sources

Search for the changed command, capability, provider, environment name, endpoint, or client across the repository. Update another surface only when it owns the same user-facing truth, especially:

- `SETUP.md` for complete manual setup and deployment detail
- environment example files for configurable values
- `README.md` for repository-level onboarding and support claims
- `packages/creed-app/app/llms.txt/route.ts` and connection guidance for agent-facing contracts
- `.agents/context/` for durable shipped architecture or support boundaries

Do not copy detailed reference material into every surface. Keep docs concise and link or point to the canonical source when detail belongs elsewhere.

## Verify

1. Re-read every changed command against the owning script, package name, route, or client implementation.
2. Search for stale names and contradictory support claims.
3. Run:

```bash
npm run typecheck --workspace=creed-docs
npm run lint --workspace=creed-docs
npm run build --workspace=creed-docs
```

4. Render the affected location at desktop and mobile widths. Check light and dark themes when callouts, code, colours, or layout changed.
5. Confirm sidebar expansion, anchor navigation, wrapping, copy controls, syntax highlighting, and horizontal overflow where relevant.
6. Apply `.agents/skills/tasks/review/SKILL.md` before completion.

## Report

State which user truth changed, which documentation entries changed, which canonical implementation sources were checked, and which verification ran. Call out an intentionally undocumented capability when evidence was insufficient to claim support.
