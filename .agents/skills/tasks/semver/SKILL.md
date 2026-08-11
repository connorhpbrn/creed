---
name: semver
description: Prepare an intentional Creed product release using Semantic Versioning. Use when the user asks to release or version Open, Cloud, CLI, or Status, or when a commit has explicitly been designated as a product release. Do not use merely because a commit targets main.
---

# SemVer

Prepare one deliberate product release. Commits and product releases are separate concepts: ordinary work may land on `main` without changing a product version or creating a Git tag.

## Scope gate

- Identify the exact product being released: Open, Cloud, CLI, or Status.
- Apply this workflow only when the user has requested a release/version or the commit has already been explicitly designated as that product's release unit.
- Do not infer a release from the target branch, deployment possibility, changed directory, or user-facing nature of a change.
- Homepage, documentation, repository tooling, internal context, and status-site work do not bump Creed Open or Cloud unless the user deliberately includes them in that product release.
- Shared-package work bumps only the product deliberately being released, even when several products consume the code.
- Do not bump versions for intermediate development commits.
- If unrelated changes would be combined, split or stop before selecting a version.
- Never tag, commit, push, publish, or rewrite history without the user's authority for that action.

## Select the next version

Read the complete release diff since that product's previous release and its canonical package version:

- Open: `apps/open/package.json`
- Cloud: `apps/cloud/package.json`
- CLI: `packages/creed-cli/package.json`
- Status: `apps/status/package.json`

- `major`: incompatible data, API, setup, or product-contract change that requires user action.
- `minor`: a backwards-compatible feature or meaningful new capability.
- `patch`: a fix, polish, copy, documentation, dependency, refactor, or operational improvement with no incompatible contract change.

Use the highest impact present. Ask when either the target product or compatibility impact cannot be determined. The clean Open public-history root release is the explicit `1.0.0` exception.

## Update release surfaces

1. Update only the target product's canonical package version and the matching root lockfile entry without creating a Git tag.
2. Keep every other product on its independent version unless the user explicitly requests a coordinated release.
3. For an Open release, add the new release first in `packages/creed-app/lib/marketing/changelog.ts`:
   - ISO date;
   - `Creed Open vX.Y.Z` title;
   - one calm sentence describing the user-visible result;
   - concrete highlights only when they help someone use or upgrade Creed.
4. For another product, update its established release record. If none exists, stop and ask where its public release history should live instead of inventing one silently.
5. Keep `CHANGELOG.md` as the versioning policy, not a duplicate release list.
6. Confirm README badges, structured data, package metadata, and hardcoded version claims do not contradict the target version.
7. Never include an em dash, raw commit list, internal implementation inventory, or unsupported claim in public release copy.

## Verify

Run:

```bash
npm install --package-lock-only --ignore-scripts
npm run typecheck
npm run lint
npm test
npm run build
```

Then verify:

- package and lockfile versions agree;
- the changelog version and date agree;
- migrations required by the release are present and tested;
- the diff contains no secret, generated build output, or unrelated file;
- the selected SemVer impact matches the real compatibility impact.

Apply the repository `review` skill after meaningful code changes. When the release unit is verified and the user has asked for a commit, hand off to the repository `commit` skill. The commit title describes the shipped outcome and normally omits the version.

## Tags

Tags identify immutable releases; they do not categorize commits.

- Open: `v1.2.3`
- Cloud: `cloud-v1.2.3`
- CLI: `cli-v1.2.3`
- Status: `status-v1.2.3`

Create an annotated tag only after the release commit exists and only when the user explicitly asks. Never use Git tags such as `open`, `docs`, `home`, or `fix` as category labels.
