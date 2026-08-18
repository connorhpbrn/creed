# Changelog

Creed products follow [Semantic Versioning](https://semver.org/). Commits record work; versions and Git tags mark deliberate product releases. A commit landing on `main` does not automatically advance Open, Cloud, CLI, or Bench. The status site, docs site, and marketing pages are not versioned products.

- Major: an incompatible product, data, API, or setup contract change.
- Minor: a backwards-compatible feature or meaningful new capability.
- Patch: a fix, polish, copy, documentation, dependency, refactor, or operational improvement.

Creed Open's public release history lives in [`packages/creed-app/lib/marketing/changelog.ts`](./packages/creed-app/lib/marketing/changelog.ts) and renders at `/changelog`. Entries are written for users, newest first, and must match `apps/open/package.json`. Creed Bench's version is `BENCHMARK_VERSION` in `packages/creed-app/bench/types.ts`. Cloud and CLI keep independent versions and release records.

Use the repository `semver` skill only for an intentional product release. Use the `commit` skill for every commit; it distinguishes ordinary work from a release commit before staging.
