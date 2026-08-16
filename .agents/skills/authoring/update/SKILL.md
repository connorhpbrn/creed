---
name: update
description: Recognize and maintain repository agent skills from concrete usage evidence. Use automatically after meaningful work when a skill proves incomplete, incorrect, noisy, unsafe, or stale, and when the user asks to edit, fix, refine, reorganize, or update a skill.
---

# Update

Keep repository skills accurate, concise, discoverable, and effective without creating maintenance churn.

## Update Triggers

Update a skill when:

- the user explicitly changes its expected behavior
- real usage reveals a missing step, bad decision, unsafe action, or unclear output
- its description triggers too broadly, too narrowly, or not at all
- repository paths, commands, interfaces, or invariants referenced by the skill change
- instructions duplicate, conflict with, or lag behind canonical repository guidance

Do not update a skill for stylistic preference alone, a one-off exception, speculative future needs, or context that belongs in `.agents/context/`. A correction should be narrow and durable.

When the need is inferred rather than requested, do not edit the skill yet. Briefly name the skill, cite the concrete evidence, describe the narrow correction, and ask whether the user wants it updated. Apply it after approval. When the user explicitly requests the update, proceed without another confirmation.

## Workflow

1. Read the complete target `SKILL.md` and every resource required for the affected behavior.
2. Inspect `AGENTS.md`, relevant repository context, code, and concrete usage evidence.
3. Identify the smallest root cause: activation, instruction, decision rule, resource, tooling, verification, or reporting.
4. Preserve the skill name and public intent unless the user explicitly requests a rename or replacement.
5. Make the narrowest change that fixes the behavior. Remove stale or duplicated material instead of only appending more instructions.
6. Keep activation language in the frontmatter description and operational guidance in the body.
7. Recheck every linked resource, script, path, command, example, and agent-specific metadata affected by the change.
8. Run bundled scripts when they change and test representative behavior.
9. Validate the complete skill folder and inspect for placeholders, unnecessary files, contradictions, and context bloat.
10. Update `AGENTS.md` when the skill path, mandatory routing, or cross-agent fallback changes.

## Self-Maintenance

This skill may update itself when concrete usage proves one of its instructions stale or ineffective. Make one bounded correction, validate once, and stop. Do not enter recursive review or rewrite every skill merely because one changed.

When a workflow no longer deserves a skill, recommend merging or deleting it. Do not preserve obsolete skills only because they already exist.

## Safety

- Preserve unrelated user changes.
- Do not silently broaden a skill's authority or destructive capabilities.
- Do not weaken approval, security, attribution, or data-loss protections without explicit user direction.
- Do not replace repository-specific truth with generic best practices.
- Do not claim a skill works across an agent runtime that was not verified or supported by its format.

## Report

State what evidence triggered the update, what behavior changed, which files changed, and how the skill was validated.
