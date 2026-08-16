---
name: roadmap
description: Add a public Creed roadmap card on the Median.sh board. Load only when the user invokes /roadmap or $roadmap. If they invoke it with no idea, ask what to add and wait. If they invoke it with an idea, draft the public card and create it. Do not load from a passing product idea in conversation. Do not use for bugs, refactors, chores, secrets, or parked-not-now bets in .agents/context/roadmap.md.
---

# Roadmap

Publish one public Median card that matches the existing `/roadmap` voice. Cards are public within about a minute. Creating is the consequential step; drafting is not.

This skill is discoverable, not pre-installed. Load only on `/roadmap` or `$roadmap`. Do not add it to standing agent routing.

## Activation

**Manual only.** Load when the user invokes `/roadmap` or `$roadmap`. Treat `$roadmap` as the portable fallback if the client has no slash command. Do not load because an idea came up in chat. Do not offer to add a card unprompted.

Invocation loads this workflow. It does not waive copy rules, dedupe, or auth gates.

**If the invocation has no idea** (`/roadmap` alone): ask what they want on the public roadmap. Wait. Do not invent a card.

**If the invocation includes an idea** (`/roadmap Any-Provider BYOK`, or `/roadmap` then the idea in the next message): draft the card from that idea and create it. Do not ask a second time whether to publish. If the idea is too vague to write a public title and one-sentence description, ask one clarifying question, then create.

## Auth

Create with the Median CLI, not `MEDIAN_API_KEY`.

- App key (`apps/cloud/.env.local` `MEDIAN_API_KEY`, endpoint `api.median.sh`): list the public board and in-app feedback only.
- CLI key (profile `hpb` in `~/.config/mdn/`, endpoint `api.cloud.median.sh`): `mdn create`. Bound to this repo by `.median/config.json`.

If `mdn` says it is not configured, stop and ask the user to run `mdn setup --local` with the **cloud** key, overwrite profile `hpb`, and decline appending to `CLAUDE.md` / `AGENTS.md`. Do not paste keys into chat. Do not use the `.env.local` HTTP key for setup. Do not mint disposable keys.

## Do not

- Write to `.agents/context/roadmap.md`. That file is parked internal bets, not the public board.
- POST `https://api.median.sh/api/feedback`. That is in-app intake and lands in `requests`, which the public page hides.
- Invent a `POST /api/tasks` call.
- Print, commit, or log either Median key.
- Create duplicates, empty descriptions, ticket titles, hype, emoji, em dashes, dates, or internal jargon.

## Card shape

Public UI shows `title`, `description`, and `labels` verbatim. Phase maps as: `todo` and `ready` → Next; `in_progress` → In Progress; `shipped` → Shipped. `requests` and `archive` never appear.

- **Title:** the product object, 2–5 words. `Creed CLI`, not `Add a CLI` or `MED-12`. Put Open vs Cloud in the title when the same capability has two surfaces.
- **Description:** one outcome sentence that does not repeat the title. Canonical terms only (Creed, Open, Cloud, Shared Creeds, Nexus, Bench). Comma then `and` in lists. Two paragraphs only for a product-line positioning card.
- **Label:** exactly one of `feature` or `improvement`.
- **Status:** `todo` unless the user says it is already in progress or shipped.

Apply `.agents/skills/tasks/copy/SKILL.md` to the title and description.

Good:

```
Title: Creed Skills
Description: Structured capabilities that help agents retrieve and use the right Creed context more intelligently.
Label: feature
Status: todo
```

Bad: `Implement skills system`, empty description, `refactor`, `p0`, or a how-we-will-build paragraph.

## Workflow

1. If there is no idea yet, ask what to add and stop until they answer.
2. Decide fit. Stop if the idea is a bug, refactor, chore, secret, or a parked-not-now bet.
3. Draft title, description, label, and status.
4. Deduplicate against `GET https://creed.md/api/roadmap` (public columns only). Stop if the same object already exists.
5. Create from the repo root:

```bash
mdn create --title "Creed Skills" --description "Structured capabilities that help agents retrieve and use the right Creed context more intelligently." --status todo --label feature --agent cursor
```

6. Report the exact card (title, description, label, status), the task code, the public column (`todo` → Next), and that `/roadmap` may take up to about 60 seconds to refresh.

## Report

One card: title, label, status, and task code if created.
