---
name: commit
description: Create a clean, focused Git commit for completed repository work. Use when the user asks to commit, make a commit, save the work as a commit, or invokes /commit or $commit.
---

# Commit

Create one intentional commit containing only the completed work in scope.

## Hard Rules

- Commit authorship belongs solely to the repository user's existing Git
  identity. Never attribute a commit to an agent, assistant, model, or AI.
- Never add `Co-Authored-By`, `Generated-By`, or any equivalent trailer or message.
- Never change Git author identity to an agent identity. If author identity is missing, stop and report it.
- Never attribute branch ownership to an agent, assistant, model, AI, or tool.
  Use a neutral, purpose-based branch name with no automated-author prefix or suffix.
- Never stage unrelated user changes, secrets, generated artifacts, or temporary files.
- Never push, amend, rebase, force-push, or alter earlier commits unless the user explicitly requests it.
- Never bypass a failed commit hook.

## Workflow

1. Read the repository instructions that govern commits and verification.
2. Inspect `git status --short`, the current branch, the configured Git author
   identity, unstaged and staged diffs, and recent commit titles.
3. Determine the exact files belonging to the completed task. Preserve every unrelated user change.
4. Confirm the relevant verification has passed. Run missing checks when repository instructions require them and their cost is proportionate to the change.
5. Stage only the intended paths. Do not use a broad staging command without first proving every affected path belongs to the commit.
6. Review the staged diff with `git diff --cached` and check it for accidental files, secrets, debugging residue, and whitespace errors.
7. Write the commit message using the format below and create the commit non-interactively.
8. Verify the result with `git status --short` and inspect the new commit summary.

## Commit Message

Use a concise, imperative title that:

- is entirely lowercase, including acronyms
- describes one coherent change
- is preferably 72 characters or fewer
- has no trailing period
- avoids vague titles such as `updates`, `fixes`, or `changes`
- follows an established repository prefix only when the repository requires one

Add a body only when it communicates useful behavior, reasoning, or tradeoffs that the title cannot. Separate it from the title with a blank line. Use clean `-` bullets for multiple points. Do not write a file-by-file inventory.

```text
add commit workflow

- enforce lowercase, focused commit titles
- prevent agent attribution and unrelated staging
```

## Stop Conditions

Stop without committing and report the blocker when:

- the intended scope cannot be determined safely
- unresolved merge conflicts exist
- the staged diff contains likely credentials or secrets
- Git author identity is missing
- there is nothing meaningful to commit
- a required check or commit hook fails because of the proposed change

If a check fails for an unrelated pre-existing reason, identify that clearly and follow the repository's stated policy rather than silently claiming success.

## Anti-Patterns

- Do not stage everything merely because it is convenient.
- Do not mix separate tasks into one commit.
- Do not add a body that repeats the title.
- Do not claim checks passed unless they were actually run.
- Do not expose unrelated working-tree details in the final response.

## Report

After a successful commit, report the commit hash and exact title, summarize its scope in one sentence, and state the verification performed.
