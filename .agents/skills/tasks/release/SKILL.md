---
name: release
description: Prepare and execute a verified Creed release across Git, packages, migrations, changelog, deployment, and publishing surfaces. Use only when the user explicitly asks to release, ship, publish, deploy, tag, or prepare a release.
---

# Release

Turn an approved set of changes into one traceable, verified release without silently expanding external impact.

## Determine Intent

Establish the release target, scope, channel, environment, version, and whether the user wants preparation only or actual publication. Infer these from canonical repository configuration only when unambiguous. Ask when multiple packages, environments, or release targets are plausible.

A request to prepare a release does not authorize publishing. A direct request to release, deploy, or publish authorizes the named target, but not unrelated packages, environments, migrations, or announcements.

## Hard Rules

- Never release unrelated working-tree changes.
- Never expose secrets, tokens, environment values, or private build output.
- Never force-push, rewrite history, bypass hooks, skip required checks, or suppress a failed publish.
- Never add agent or AI attribution. Apply the `commit` skill to every release commit.
- Never invent a version, tag, changelog claim, or release note unsupported by the diff and repository policy.
- Never apply a database migration remotely unless that action is explicitly included in the release authority.
- Never claim success until the published artifact or deployment is independently verified.

## Prepare

1. Read repository instructions, release configuration, package metadata, current branch, remotes, tags, deployment settings, and working-tree state.
2. Define the exact release contents from the diff and exclude unrelated user work.
3. Apply the `review` skill and resolve blocking findings.
4. Apply the `copy` skill to user-facing release notes and changelog text.
5. Add a changelog entry only when the shipped change is significant and user-visible. Keep it factual, specific, and sourced from real behavior.
6. Update versions and lockfiles only for packages whose release process requires them.
7. Confirm migrations are authored, locally verified, ordered, and compatible. Separate remote application authority from code deployment.
8. Run required tests, typecheck, lint, and production build in the release configuration.
9. Inspect the final diff, generated artifacts, package contents, and commit plan.

## Publish

Perform only the authorized release actions in a traceable order:

1. Create any required commit using the `commit` skill.
2. Push the intended branch without force.
3. Create the exact required tag or release record.
4. Publish the intended package or deploy the intended environment.
5. Apply authorized migrations at the correct compatibility point.
6. Verify the resulting version, deployment, health, public behavior, and release metadata from the destination.

Stop immediately on a failed step. Do not continue publishing dependent artifacts into a partially failed release.

## Recovery

Before consequential publication, identify the practical recovery path: rollback deployment, deprecate package version, revert commit, restore data, or roll forward with a corrective migration. Do not promise rollback where the platform or schema change only supports roll-forward recovery.

## Stop Conditions

Stop and request direction when the target or version is ambiguous, the tree contains inseparable unrelated changes, required checks fail, credentials or permissions are missing, migration ordering is unsafe, the destination differs from the requested environment, or recovery from the next step is not understood.

## Report

State the released scope, version or identifier, commit and tag when applicable, migration status, verification evidence, destination link when available, and any action deliberately not performed.
