---
name: comment
description: Keep Creed source-code comments essential, durable, and useful to maintainers. Apply whenever adding, rewriting, reviewing, or auditing comments in code, stylesheets, scripts, tests, or migrations.
---

# Comment

Write comments only when the code cannot cleanly communicate an important fact by itself. A useful comment reduces the chance that a maintainer will break a non-obvious contract.

## Keep

Keep or add a comment when it explains:

- why a surprising implementation is necessary;
- a security, privacy, data-integrity, compatibility, or performance invariant;
- a browser, framework, provider, protocol, or database constraint not evident from the code;
- the tradeoff behind a deliberate workaround;
- a public API contract or a complex type whose meaning is not clear from its name;
- migration intent, especially destructive ordering, backfills, RLS, grants, or rollback limitations;
- an intentional failure mode, no-op, or fallback that otherwise looks accidental;
- a lint or type suppression, with the reason when the directive alone is insufficient.

## Remove or rewrite

Remove comments that:

- narrate the next line, JSX region, route method, variable, loop, or control flow;
- act as decorative section dividers;
- repeat a function, type, or identifier name without adding a contract;
- preserve development history such as "previously", "changed from", "new", or "temporary fix" instead of explaining the current constraint;
- describe visual values already explicit in classes or styles;
- contain stale plans, resolved TODOs, conversational notes, or agent instructions;
- compensate for unclear naming when a small rename would make the code self-explanatory.

Rewrite historical comments in present tense around the durable reason. Do not mention an old implementation unless compatibility with it is still an active product requirement.

## Style

- Lead with the reason or invariant, not a label.
- Keep the comment next to the smallest code unit it governs.
- Prefer one precise sentence. Use a short block only when the contract genuinely has several parts.
- Use complete sentences for prose comments.
- Do not use em dashes.
- Do not include issue archaeology, commit references, personal notes, or claims that cannot be verified from the repository.
- Use JSDoc only when callers benefit from an exported contract. Do not add JSDoc to restate a signature.

## Audit

1. Limit the scan to live, authored source. Exclude generated output, dependencies, lockfiles, vendored code, and intentionally deleted legacy trees.
2. Read every comment in scope with enough surrounding code to judge whether it explains a durable non-obvious fact.
3. Remove obvious narration and decorative headings mechanically only when doing so cannot change code.
4. Review security, auth, persistence, migrations, protocol adapters, compatibility paths, and suppressions manually. Prefer clarity over reducing the raw count.
5. Search for historical language, TODO markers, section dividers, JSX labels, route narration, and comments that merely restate identifiers.
6. Inspect the final diff for accidental code removal, malformed JSX, broken directives, and comments separated from the code they govern.
7. Run formatting or syntax checks for every language touched, then the repository checks proportionate to the change.

## Report

State the audited scope, the kinds of comments removed or rewritten, the comments deliberately retained, and the verification performed. Never claim every comment was reviewed when generated or excluded paths were not part of the audit.
