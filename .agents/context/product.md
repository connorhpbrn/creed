# Creed Product

## One line

Creed is one personal context profile every AI reads before answering, written by you and kept polished by your agents.

## Product thesis

People who use several AI tools repeatedly explain the same identity, goals, work, preferences, and constraints. Creed replaces that repetition with one concise Markdown profile the user owns.

Creed is a curation product. It is not a notes app, journal, chat history, memory feed, or generic AI wrapper. The file should stay small, current, specific, portable, and worth reading.

## Public v1 product

Creed Open v1 is:

- open source and MIT licensed;
- self-hosted with Supabase;
- private to one installation owner;
- Personal Creed only;
- accountless from the owner's point of view;
- usable without a payment provider, email provider, or Creed-managed AI key.

The public release should make cloning, configuration, migration, claiming, onboarding, and first use feel obvious.

## Core loops

### Onboarding

The first owner claims the installation, completes the Personal onboarding questions, uses the deterministic starter profile and optional compose prompt, previews the result, then enters the file. The Personal welcome and Get Started experiences still appear after onboarding.

There is no Personal/Shared choice in Open. Cloud retains that branch privately.

### Connect

The owner connects an agent through MCP OAuth or the scoped HTTP fallback. Connected agents read the active Creed before meaningful work.

### Propose

Agents propose narrow durable changes. The owner reviews and accepts or rejects them. Direct-edit mode is available when explicitly trusted.

### Curate

The owner revisits the file, sharpens vague content, removes stale content, and uses revisions, activity, quality guidance, and Nexus to keep it useful.

### Version

Optional GitHub integration gives the owner manual push and pull for portable Markdown version control.

## The file

Five sections are always present: Identity, Goals, Work, Preferences, and Routines. Beliefs, Constraints, People, Health, and Context are optional and grow only when useful.

## Edition boundary

Open is the product being released now. Cloud, Shared Creeds, and the CLI are deliberate future launches on the roadmap. They should be developed carefully and announced separately rather than partially exposed in Open.

Common editor, agent, Personal Creed, marketing, and infrastructure improvements should benefit both editions. Hosted accounts, billing, managed credits, Shared collaboration, and feedback stay Cloud-specific.

## Interface commitments for Open

- Landing-page acquisition actions say `View on GitHub`.
- No signup or login actions are visible.
- New Creed opens a dialog for name and picture, with no type selector.
- The sidebar uses a theme toggle instead of an account menu.
- Draft persistence says `Saved locally`.
- durable persistence says `Saved to database` in the standard connection green.
- The file header presents the active Creed as `<name>.md`, and Markdown export uses the same Creed name as its filename.
- The CLI card is disabled in both editions and links to `View roadmap` while the standalone CLI is rebuilt.

## Voice

Calm, precise, editorial, and direct. Avoid hype, filler, internal terminology, and em dashes in user-facing copy.
