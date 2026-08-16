---
name: pr
description: Open or update a GitHub pull request with a squash-ready title and a plain prose description. Use when the user asks to open, create, update, or write a pull request, or invokes /pr or $pr. Do not use for local commits, versioning, merging, tagging, or publishing.
---

# Pull request

Open one pull request for the completed work on this branch. The title is the history that will land on the base branch after squash-merge. The body is working notes for a human, not a template.

Invocation loads this workflow. It does not authorize force-push, merge, tag, release, or a push to `main`.

## Hard rules

- Never force-push, merge, rebase interactively, skip hooks, or push the current branch if it is `main`.
- Never bump a product version, create a Git tag, or treat a PR to `main` as a release. Hand those to `semver` and `release` only when the user asked for a product release.
- Never add agent, assistant, model, or AI attribution to the title, body, or branch name.
- Never include secrets, tokens, environment values, or private build output.
- Do not use `## Summary`, `## Test plan`, checklists, emoji, or em dashes.
- Do not invent reviewers, labels, projects, assignees, or auto-merge unless the user asked.

## Title

The title must be a valid squash commit title. Match the `commit` skill:

- entirely lowercase, including acronyms
- imperative, one coherent change
- preferably 72 characters or fewer
- no trailing period
- no vague titles such as `updates`, `fixes`, or `changes`
- omit the version number on ordinary PRs

If this PR *is* the product release the user already asked for, and `semver` has already set the canonical package version, use a release title that names the product and version:

```text
release cloud 0.4.0
```

Do not invent that version. Read it from the package `semver` already updated.

## Body

Write prose. A short paragraph is enough. Add a second paragraph or a few `-` lines only when they carry something the title cannot: why, a non-obvious risk, or how to check it.

Do not inventory files. Do not repeat the title. Do not pad with "this PR" throat-clearing.

Good:

```text
Keep proposal diffs from jumping when the editor remounts by pinning the
inline diff to the proposal id instead of the document revision.

Check a pending proposal in the file: the highlight should stay put after
a background save.
```

Bad: a filled-in GitHub template, a commit list, or a test-plan checkbox list.

The same title and body rules apply for any base branch, including a future `dev` branch.

## Workflow

1. Inspect `git status --short`, the current branch, upstream tracking, `git log` against the base, and `git diff` of the PR range. The default base is `main` unless the user named another.
2. Stop if the work does not belong in one PR, the branch is `main`, the range contains secrets, or there are merge conflicts.
3. If the intended change is still uncommitted, stop and apply the `commit` skill first. Leave unrelated dirty files alone.
4. If this is a product-release PR, confirm `semver` already ran. If the version is still unset, stop and say so.
5. Push the feature branch with `-u` when it has no safe upstream. Never force.
6. If a PR already exists for this branch, update its title and body when that is the request. Otherwise create one with `gh pr create`.

```bash
git push -u origin HEAD

gh pr create --base main --title "the squash title" --body "$(cat <<'EOF'
The prose description.

EOF
)"
```

7. Return the PR URL, title, base branch, and whether it was created or updated.

## Stop conditions

Stop and report the blocker when:

- the current branch is `main` or has no commits ahead of the base
- the intended scope cannot be bounded to one change
- uncommitted work is part of the PR
- the diff looks like it contains credentials
- `gh` or network access is missing
- a product-release PR is missing its already-chosen version

## Anti-patterns

- Do not open a PR to share WIP unless the user asked for a draft.
- Do not retarget, merge, or approve the PR.
- Do not copy the commit skill's body format into the PR by default. Commits stay terse. PR bodies may be a little longer.
- Do not mention the skill, the agent, or the tooling in the PR.

## Report

PR URL, exact title, base branch, created vs updated, and any step deliberately not performed.
