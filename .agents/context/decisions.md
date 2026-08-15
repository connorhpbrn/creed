# Decisions

Durable decisions future agents should not reopen casually.

## Product

- [`lucidity.md`](../../lucidity.md) is the frozen project backbone. Product
  decisions should not contradict it. Do not rewrite it casually.
- Creed is a curation product, not a notes app, journal, memory feed, dashboard, or generic AI wrapper.
- Creed Open is the public v1 product: free, MIT licensed, self-hosted, single-owner, and Personal-only.
- Cloud, Shared Creeds, and the CLI remain private development products until separate launches.
- The hosted Cloud development build uses a temporary server-only email allowlist. Private mode must fail closed for authenticated product and agent access, disable billing, and keep public marketing pointed at the roadmap.
- MCP is the preferred agent connection path. Scoped HTTP bearer APIs remain a fallback.
- GitHub version control is manual push and pull, not automatic sync.
- Open AI features are BYOK through OpenRouter. Open never silently spends a platform-owned key or managed credits.

## Architecture

- Open and Cloud are separate Next.js applications in the same monorepo.
- Common improvements belong in shared packages. Edition-specific routes and dependencies belong in `@creed/open` or `@creed/cloud`.
- Edition selection is compile-time composition through typed adapters, never a runtime environment flag.
- Shared packages and Open may not import Cloud.
- Stripe, hosted accounts, managed credits, feedback, and Shared collaboration are Cloud-only.
- Supabase remains the durable persistence layer for Open v1.
- Open and Cloud own separate migration histories in their respective `apps/*/supabase/migrations/` directories. Cloud deploys through the Supabase GitHub integration only after local verification. Open installations apply the Open-only history through setup or manual `db push`. Applied migrations are forward-only.
- `app/layout.tsx` stays static and does not load user state.
- Every `/api/app/*` route requires the edition auth adapter. Every `/api/creed/*` route verifies hashed bearer tokens. `/mcp` uses OAuth access tokens.
- Token columns store ciphertext only. Hash for lookup and decrypt only for authorised use.
- Open setup is a product surface owned by `@creed/open`. The guided installer and doctor remain hosting-platform neutral.
- Hosting presets may be added without forking shared application code. A generic persistence interface is deferred until a second real backend exists.

## Open owner access

- Open has no public login, signup, account menu, or recurring login screen.
- A private environment secret claims the installation once per browser.
- Owner cookies are signed, HTTP-only, and invalidated by secret rotation.
- A private singleton database record identifies the owner. Never discover the owner by scanning Auth users.
- Open fails closed when required environment values or schema migrations are missing.

## Interface

- Open keeps the New Creed dialog for name and picture but never shows a Personal/Shared selector.
- Open replaces the account menu button with a sidebar theme toggle.
- Open says `Saved locally` for drafts and `Saved to database` in green after database persistence.
- Open public calls to action say `View on GitHub`.
- Open and Cloud show a disabled CLI card with `View roadmap` until the CLI is rebuilt. Shared agent-card CLI attribution and status UI is retained for reuse.
- Documentation belongs to the standalone `apps/docs/` application. Open and Cloud do not duplicate or wrap its routes; shared packages retain only genuine interface primitives used by more than one surface.

## Release process

- `apps/open/package.json` is the canonical Open application version.
- Commits record work independently of releases. Open, Cloud, CLI, and Status advance SemVer only for deliberate product releases; landing on `main` does not itself trigger a version bump or Git tag.
- The clean public-history root is v1.0.0.
- Do not rewrite history, clear deployments, push, tag, or deploy without explicit authority for that final operation.
- One-off plans and audits belong in gitignored `disposable/`; durable truth belongs in this context pack.

## Design

- Calm, premium, editorial, document-first.
- No em dashes in product copy or context docs.
- Reuse shared components and local patterns before inventing new UI.
- Mobile web must be genuinely good.
