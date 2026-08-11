---
name: create
description: Recognize and create valuable repository agent skills from concrete repeated workflows. Use automatically after meaningful work when a reusable workflow could prevent future errors or repetition, and when the user asks to add, create, build, or encode a skill.
---

# Create

Create the smallest durable skill that makes a repeated workflow reliable across future agents.

## Creation Bar

Create a skill when:

- the user explicitly requests one
- a workflow repeats and requires non-obvious judgment or sequencing
- repository-specific rules are too detailed or conditional for `AGENTS.md`
- deterministic scripts, references, or assets would prevent repeated reinvention

Do not create a skill for a one-off task, ordinary model knowledge, transient project state, personal memory, or a rule small enough to live clearly in `AGENTS.md`.

When the opportunity is inferred rather than requested, do not create files yet. Briefly explain the repeated workflow, why a skill would improve future work, and ask whether the user wants it created. Create it after approval. When the user explicitly requests a skill, proceed without an extra confirmation.

## Structure

Place skills under one of these categories:

- `.agents/skills/tasks/<skill-name>/` for skills that perform repository work
- `.agents/skills/authoring/<skill-name>/` only for skills that create or maintain skills

Every skill requires `SKILL.md`. Add `references/`, `scripts/`, `assets/`, or product-specific metadata only when they materially improve execution. Do not add a README, changelog, installation guide, or duplicate documentation.

Every skill name must be exactly one lowercase word using letters or digits only. The folder name and frontmatter `name` must match exactly. Do not use spaces, hyphens, underscores, prefixes, suffixes, or namespaces. Find a sharper single-word verb or noun instead.

## Activation

Choose one activation mode before writing the skill:

- **Automatic:** Load and apply the skill whenever a matching task occurs. Use for frequent, low-risk guidance that should consistently shape execution.
- **Suggested:** Let the agent recognize a relevant opportunity, explain the concrete benefit, and ask permission before the skill creates files or expands the task. Use for optional improvements such as creating or updating skills.
- **Manual:** Load the skill only after explicit invocation or an unmistakably direct request. Use for rare, expensive, destructive, externally visible, or high-false-trigger workflows.

Choose based on task frequency, consequence of a false trigger, side effects, execution cost, reversibility, and whether the user has already authorized the action. Default to automatic for safe task guidance, suggested for optional scope expansion, and manual for consequential operations.

Manual invocation is an intent convention, not a portable slash-command implementation. Treat any of these as explicit invocation when the client delivers them to the agent:

- `/name`, such as `/release`
- `$name`, such as `$release`
- a direct natural-language request that unmistakably names the operation

Do not assume every client supports custom slash commands. The `$name` form and direct natural language are portable fallbacks. Never require punctuation as the only way to invoke a skill.

Invoking a manual skill authorizes loading and following its workflow. It does not waive confirmations, permission gates, scope checks, or destructive-action safeguards. A skill such as `nuke` must still resolve exact targets, explain irreversible effects, and obtain any confirmation required by the agent environment before mutation.

Encode the choice clearly:

- Put the activation situations and trigger language in the frontmatter description.
- For suggested skills, require a concise evidence-based offer before unrequested changes.
- For manual skills, state that explicit invocation or an unmistakably direct request is required. Include `/name`, `$name`, and natural-language examples where useful, and add agent-specific implicit-invocation controls where supported.
- Add an `AGENTS.md` routing rule only when every agent must honor the mode or a cross-agent fallback is necessary.

## Workflow

1. Read `AGENTS.md`, `.agents/context/index.md`, and existing skill names and descriptions.
2. Confirm no existing skill already owns the workflow. Update the existing skill instead of creating an overlap.
3. Define concrete trigger examples, desired outcome, hard constraints, decision points, failure modes, verification, and report shape.
4. Choose automatic, suggested, or manual activation and justify it from frequency, risk, side effects, cost, and false-trigger impact.
5. For a manual skill, separate invocation from authorization and preserve every safety or confirmation gate required by the operation.
6. Choose one short lowercase word that describes the capability. Confirm no existing skill uses it.
7. Initialize the skill with the available skill scaffold when one exists.
8. Write concise imperative instructions. Assume the agent is capable and include only non-obvious, reusable guidance.
9. Put all activation language in the frontmatter description. State both what the skill does and when it should load.
10. Use progressive disclosure. Keep the core workflow in `SKILL.md` and link directly to optional resources only when needed.
11. Update `AGENTS.md` only when every agent must apply the skill or when a cross-agent discovery fallback is required.
12. Validate the finished skill and inspect it for placeholders, duplication, stale paths, and unnecessary files.

## Quality Standard

A finished skill must be:

- focused on one coherent capability
- specific enough to change agent behavior
- concise enough to load without wasting context
- explicit about destructive actions, permission gates, and stop conditions
- portable across agents wherever practical
- verifiable through realistic use

For complex or high-risk skills, forward-test with a realistic task and raw artifacts. Do not leak the intended answer into the test prompt.

## Report

State the skill name, trigger behavior, files created, validation performed, and any agent-specific limitation.
