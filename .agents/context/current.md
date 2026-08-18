# Current State

Last updated: 2026-08-16.

## Release focus

Creed Open v1.0.0 is the public product. It is free, MIT licensed, single-owner, Personal-only, straightforward to self-host, and usable without any Creed-managed service. The public Git history is a single root commit tagged `open-v1.0.0`.

Creed Cloud continues in `apps/cloud/` for private development and testing. Hosted accounts, payments, managed credits, Shared Creeds, and feedback are not part of Open v1. The standalone CLI has been removed for a clean rebuild.

The hosted Cloud deployment can be kept private with `CREED_CLOUD_ACCESS=private` and a server-only `CREED_CLOUD_TESTER_EMAILS` allowlist. In that mode public acquisition points to the roadmap, billing is disabled, and only approved accounts can use Cloud pages, APIs, HTTP tokens, or MCP.

## Implemented release shape

- Open and Cloud are independent Next.js build targets.
- Improvements common to both live in shared packages.
- Edition-specific behavior is selected at compile time through typed adapters.
- Open has no login, signup, account menu, billing, Stripe, feedback, Shared, or invitation routes.
- Open claims one installation owner with a private setup secret and long-lived owner cookie.
- Open uses Supabase for durable storage and RLS, with a versioned readiness check.
- Open onboarding is the Personal flow only. The New Creed dialog remains and still supports a custom name and picture, without a type selector.
- Open uses a sidebar theme button in place of the Cloud account button.
- Save-state behavior is shared. Open says `Saved locally` for drafts and `Saved to database` in green after persistence.
- Public Open calls to action say `View on GitHub`.
- The CLI card is visibly disabled in Open and Cloud and links to `creed.md/roadmap`.
- The standalone documentation site lives in `apps/docs/` and owns its content, navigation, and purple brand treatment. Open and Cloud no longer ship a `/docs` route; product links and agent contracts point to `docs.creed.md`.
- Cloud owns the public sponsor wall and one-time Stripe contributions. Sponsor data stays isolated behind server-only persistence and bounded public read routes.

## Supported Open setup

- Local development
- Vercel deployment
- Platform-neutral Node.js hosting contract
- Supabase database and Auth infrastructure
- Optional OpenRouter BYOK features
- Optional GitHub OAuth version control

`npm run setup` is the canonical interactive installer. It validates prerequisites and configuration, preserves existing environment values, links Supabase, previews migrations, asks before applying them, and verifies readiness. `npm run doctor` performs the same readiness checks without mutating local or remote state. `SETUP.md` is the complete manual and deployment reference.

Email delivery, public account registration, Stripe, and Creed-managed credits are not required.

A pre-release Git bundle of the former history is kept outside the repository as a recovery point.
