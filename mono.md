# Creed monorepo migration plan

Goal: turn this repo into a monorepo hosting two separately deployed Vercel
apps and the existing CLI package, with **zero UI or behavior change**. This is
a pure restructuring.

```
creed/                         (this repo, github.com/connorhpbrn/creed)
├─ package.json                root: workspaces only, no deps
├─ package-lock.json           single lockfile at root
├─ apps/
│  ├─ creed/                   the current app, unchanged → creed.md
│  └─ status/                  imported from creed-status repo → status.creed.md
├─ packages/
│  └─ creed-cli/               existing published CLI package, unchanged
└─ (root docs: README.md, LICENSE, CHANGELOG.md, AGENTS.md, SECURITY.md,
   CONTRIBUTING.md, AUDIT.md, and video/ stay at root)
```

Decisions already made (do not relitigate):

- Main app folder is `apps/creed` (eponymous package pattern, like vitejs/vite
  → packages/vite). Repo name matching the app folder is fine.
- The live `/docs` page **stays inside `apps/creed`** untouched. A separate
  docs app can be added later. No redirects yet.
- No `packages/` extraction in this pass. Shared `packages/ui` / config can
  come later once the shape settles. Keep this migration mechanical.
- No Turborepo. Two apps don't need it; npm workspaces suffice.

## Step 0 - Safety

1. Work on a branch: `git checkout -b codex/monorepo`.
2. Tag the pre-migration state: `git tag pre-monorepo main`.
3. Confirm working tree is clean before starting.

## Step 1 - Move the current app into `apps/creed`

Use `git mv` for everything so history follows renames.

Move into `apps/creed/`:

- `app/`, `components/`, `lib/`, `public/`, `supabase/`, `tests/`, `bench/`,
  `scripts/`, `proxy.ts`
- `next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`, `eslint.config.mjs`,
  `components.json`, `tsconfig.json`, `vercel.json`
- `package.json` (becomes the app's manifest; keep `"name": "creed"`)

Keep at repo root: `README.md`, `LICENSE`, `CHANGELOG.md`, `AGENTS.md`,
`SECURITY.md`, `CONTRIBUTING.md`, `AUDIT.md`, `video/`, `.gitignore`,
`.claude/` if present.

Delete stale build artifacts rather than moving them: `tsconfig.tsbuildinfo`,
any `.next*` dirs, `node_modules` (will be reinstalled at root).

Then create the new root `package.json`:

```json
{
  "name": "creed-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev --workspace apps/creed",
    "dev:status": "npm run dev --workspace apps/status",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

Fixups to expect inside `apps/creed`:

- `tsconfig.json` path aliases (`@/*`) are relative, so they should survive the move,
  but verify.
- `package.json` scripts that reference paths (`tests/**/*.test.ts`,
  `bench/cli.ts`, `scripts/indexnow-ping.ts`) still resolve because they're
  relative to the app dir. Verify them.
- `next.config.ts` has a `CREED_DIST_DIR` / `.next-runtime.nosync` dev distDir
  (keeps Turbopack writes out of iCloud on this Desktop checkout). Keep it
  exactly as is; it's now relative to `apps/creed`.
- Root `.gitignore` must cover `apps/*/.next*`, `apps/*/node_modules`,
  `apps/*/tsconfig.tsbuildinfo`, `.next-runtime.nosync`.

Verify: from repo root, `npm install`, then `npm run build` and `npm test`.
Both must pass before continuing. Commit as one commit:
`move app into apps/creed for monorepo layout`.

## Step 2 - Import the status page with history

The status repo is `https://github.com/connorhpbrn/creed-status.git`, branch
`main`, HEAD `5cc37c7`. Its working copy on the Desktop has untracked
`"* 2.*"` duplicate files (iCloud copy collisions). Pulling from the **remote**
skips them automatically. Do NOT copy files from `~/Desktop/creed-status`.

```bash
git subtree add --prefix=apps/status https://github.com/connorhpbrn/creed-status.git main
```

This lands the full commit history under `apps/status/`. Then clean up in a
follow-up commit:

- Delete `apps/status/package-lock.json` (root lockfile owns resolution now).
- Delete any committed `.next/`, `.vercel/`, `tsconfig.tsbuildinfo`.
- In `apps/status/package.json`, keep `"name": "creed-status"`.
- Its `.env.local` is gitignored and won't come over. Env vars live in the
  Vercel status project (Step 4).
- Align dependency versions with `apps/creed` where they overlap
  (next/react/tailwind/motion) so the root lockfile dedupes, but only if the
  versions are compatible; do not upgrade anything as part of this migration.

Verify: `npm install` at root, then
`npm run build --workspace apps/status`. Also boot it:
`npm run dev:status` and check the page renders (dev mode seeds fake history,
so it should show bars immediately).

## Step 3 - Vercel (human, in the dashboard)

Two projects, both pointing at the `creed` repo:

| Project | Root Directory | Domain | Notes |
| --- | --- | --- | --- |
| creed (existing) | `apps/creed` | creed.md | just change Root Directory |
| creed-status (existing) | `apps/status` | status.creed.md | repoint Git repo from creed-status → creed, set Root Directory |

For each project:

1. Settings → General → Root Directory as above. Leave **"Include files
   outside Root Directory" ON** (required for the root lockfile/workspaces).
2. Settings → Git → **Ignored Build Step**, command:
   `git diff --quiet HEAD^ HEAD -- .`
   (exit 0 skips the build, so a creed-only push doesn't rebuild status.
   If shared `packages/` are added later, extend to
   `git diff --quiet HEAD^ HEAD -- . ../../packages`.)
3. Env vars: status secrets (`BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`,
   `STATUS_PROBE_SECRET`, KV vars) live only on the status project. The main
   app's env stays on the creed project. Docs needs nothing yet.
4. The status project's cron/pinger hitting `/api/probe` keeps working
   unchanged: same domain, same route.

Order matters: change the Root Directory settings **before** merging the
branch, or the first post-merge deploy of each project will fail to find its
app.

## Step 4 - Cut over and verify

1. Merge the migration branch into `main`, then watch both deploys.
2. Verify creed.md and status.creed.md are visually and functionally identical
   to pre-migration (compare against the pre-merge production deployments).
3. Verify the status probe keeps recording (check a new snapshot lands within
   ~10 minutes).
4. Archive `~/Desktop/creed-status` (rename to `creed-status-old`, delete
   after a week). Archive the GitHub `creed-status` repo once the subtree
   import is confirmed good.

## Rollback

Any point before merge: `git checkout main`. After merge:
`git revert` the merge commit, or redeploy the `pre-monorepo` tag; flip the
Vercel Root Directories back to `/` (creed) and re-point creed-status at its
old repo.

## Explicit non-goals

- No UI, copy, routing, or dependency-version changes.
- No `packages/ui` extraction, no Turborepo, no docs design.
- No separate docs app and no changes to the live `/docs` page or redirects.
