# Current State

Last updated: 2026-08-10.

## Release focus

Creed is preparing its first stable Open release, v1.0.0. Open is the only public product for this release. It must be free, MIT licensed, single-owner, Personal-only, straightforward to self-host, and enjoyable without any Creed-managed service.

Creed Cloud continues in `apps/cloud/` for private development and testing. Hosted accounts, payments, managed credits, Shared Creeds, and feedback are not part of Open v1. The standalone CLI has been removed for a clean rebuild.

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
- `/docs` remains in the main applications for this release. A separate docs site is the next project, not part of this release pass.

## Supported Open setup

- Local development
- Vercel deployment
- Platform-neutral Node.js hosting contract
- Supabase database and Auth infrastructure
- Optional OpenRouter BYOK features
- Optional GitHub OAuth version control

`npm run setup` is the canonical interactive installer. It validates prerequisites and configuration, preserves existing environment values, links Supabase, previews migrations, asks before applying them, and verifies readiness. `npm run doctor` performs the same readiness checks without mutating local or remote state. `SETUP.md` is the complete manual and deployment reference.

Email delivery, public account registration, Stripe, and Creed-managed credits are not required.

## Release boundary

Do not rewrite Git history, delete GitHub deployments, create the clean initial commit, push, tag, or deploy until the user explicitly approves that final release operation. A verified pre-release Git bundle exists outside the repository as a recovery point.
