---
name: migrate
description: Design, implement, review, and verify safe Supabase Postgres schema migrations for Creed. Apply automatically whenever changing tables, columns, indexes, constraints, functions, triggers, RLS policies, grants, storage policies, or persisted data shapes.
---

# Migrate

Make every database change forward-only, secure, reviewable, and safe to deploy across mixed application versions.

## Hard Rules

- Create a new timestamped file in `supabase/migrations/`. Never edit an applied migration.
- Keep migrations forward-only and idempotent where practical.
- Preserve existing data unless deletion is explicitly required and authorized.
- Treat every RLS or grant change as a security change, not boilerplate.
- Never expose service-role credentials, decrypted secrets, tokens, or personal data.
- Never apply a migration to a linked or production database unless the user explicitly requests that external change.
- Do not combine immediate code removal with destructive column or table removal. Deploy code that stops using the shape first, then remove it in a later migration.

## Workflow

1. Read `AGENTS.md`, `.agents/context/architecture.md`, nearby migrations, and every code path that reads or writes the affected data.
2. Inspect migration state with `npx supabase migration list --linked` when linked access is available.
3. Define the current schema, target schema, data transition, access model, compatibility window, rollback or recovery strategy, and verification evidence.
4. Create the smallest migration that expresses one coherent schema change.
5. Update application code, generated types, validation, and tests required by the new shape.
6. Review SQL for locks, table rewrites, unsafe defaults, null transitions, duplicate data, foreign-key behavior, and partial-deploy compatibility.
7. Run a local database reset when Docker is available and inspect the resulting schema and representative data behavior.
8. Run Supabase advisors after risky RLS, function, index, or policy changes when available.
9. Apply remotely only after explicit authorization, then verify the live migration state and affected behavior.

## SQL Safety

- Prefer additive changes before destructive ones.
- Add nullable columns before backfilling and enforcing `NOT NULL` when existing rows require transition.
- Backfill deliberately. Avoid one unbounded update when data volume or lock duration could be meaningful.
- Index foreign keys and columns used by real query filters, joins, or policy predicates. Avoid speculative indexes.
- Use `CREATE OR REPLACE` only where replacement semantics are understood and safe.
- Specify intentional `ON DELETE` behavior for foreign keys.
- Keep functions schema-qualified, control `search_path`, and choose invoker or definer security deliberately.
- Make atomic billing, ownership, entitlement, and seat mutations transactional.

## RLS and Access

- Enable RLS on every user or workspace scoped table.
- State who can select, insert, update, and delete, and through which identity or role.
- Add an explanatory SQL comment for every new or changed policy.
- Test owner, admin, member, unauthenticated, and service-role behavior where relevant.
- Keep Personal and Company Creed boundaries explicit through `creed_id`, membership, role, and active-Creed scope.
- Remember that service-role backend paths bypass RLS and therefore require explicit application-level ownership checks.

## Verification

At minimum:

- `npx supabase migration list --linked`
- local `supabase db reset` when Docker is available
- focused application tests for the affected data flow
- `npx tsc --noEmit -p .`
- `npm run lint`
- production build when required by repository instructions

Inspect both migration success and application behavior. A migration that applies but breaks an older or newer application version is not safe.

## Stop Conditions

Stop and request direction when the data-loss scope is unclear, a production backfill may be expensive, rollback is impossible, existing rows violate the target constraint, access requirements conflict, or applying remotely was not explicitly authorized.

## Report

State the schema change, compatibility strategy, migration file, RLS impact, verification completed, and whether the migration was only authored or also applied.
