import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import test from "node:test";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string) => readFileSync(join(repo, path), "utf8");

function filesUnder(path: string): string[] {
  const absolute = join(repo, path);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && [".next", "node_modules", "dist"].includes(entry.name)) {
      return [];
    }
    const child = join(absolute, entry.name);
    return entry.isDirectory()
      ? filesUnder(relative(repo, child))
      : lstatSync(child).isFile()
        ? [relative(repo, child)]
        : [];
  });
}

function directoriesUnder(path: string): string[] {
  const absolute = join(repo, path);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || [".next", "node_modules", "dist"].includes(entry.name)) {
      return [];
    }
    const child = relative(repo, join(absolute, entry.name));
    return [child, ...directoriesUnder(child)];
  });
}

test("Open and Cloud are independent Next.js compositions", () => {
  for (const app of ["open", "cloud"]) {
    assert.ok(existsSync(join(repo, `apps/${app}/app`)));
    assert.ok(existsSync(join(repo, `apps/${app}/edition/config.ts`)));
    assert.ok(existsSync(join(repo, `apps/${app}/proxy.ts`)));
  }
  assert.ok(existsSync(join(repo, "packages/creed-open")));
  assert.ok(existsSync(join(repo, "packages/creed-cloud")));
  assert.equal(existsSync(join(repo, "apps/creed")), false);
  const conflictCopies = [
    ...filesUnder("apps"),
    ...filesUnder("packages"),
    ...directoriesUnder("apps"),
    ...directoriesUnder("packages"),
  ].filter((path) => /(?:^|\/)\S.* \d+(?:\.[^/]+)?$/.test(path));
  assert.deepEqual(conflictCopies, []);
});

test("shared Tailwind CSS scans every UI-bearing workspace", () => {
  const globals = read("packages/creed-app/app/globals.css");
  for (const source of [
    "./**/*.{js,jsx,ts,tsx,mdx}",
    "../components/**/*.{js,jsx,ts,tsx,mdx}",
    "../../creed-ui/**/*.{js,jsx,ts,tsx,mdx}",
    "../../creed-open/**/*.{js,jsx,ts,tsx,mdx}",
    "../../creed-cloud/**/*.{js,jsx,ts,tsx,mdx}",
    "../../../apps/open/**/*.{js,jsx,ts,tsx,mdx}",
    "../../../apps/cloud/**/*.{js,jsx,ts,tsx,mdx}",
  ]) {
    assert.ok(globals.includes(`@source "${source}";`), source);
  }
});

test("Open has no Cloud-only routes or package dependency", () => {
  const openFiles = filesUnder("apps/open");
  const forbiddenRoutes = [
    "app/login/page.tsx",
    "app/signup/page.tsx",
    "app/reset-password/page.tsx",
    "app/onboarding/shared/page.tsx",
    "app/api/app/account/route.ts",
    "app/api/app/credits/route.ts",
    "app/api/feedback/route.ts",
    "app/api/stripe/webhook/route.ts",
  ];
  for (const route of forbiddenRoutes) {
    assert.equal(openFiles.includes(`apps/open/${route}`), false, route);
  }
  assert.doesNotMatch(read("apps/open/package.json"), /@creed\/cloud|stripe/i);
  for (const file of [
    ...openFiles,
    ...filesUnder("packages/creed-open"),
    ...filesUnder("packages/creed-app"),
    ...filesUnder("packages/creed-core"),
    ...filesUnder("packages/creed-ui"),
    ...filesUnder("packages/persistence"),
    ...filesUnder("packages/integrations"),
  ].filter(
    (path) => /\.(?:ts|tsx|mjs|json)$/.test(path) && !path.includes("/tests/"),
  )) {
    assert.doesNotMatch(read(file), /@creed\/cloud/, file);
  }
});

test("edition behavior is compile-time composition, not an environment mode", () => {
  for (const file of [
    ...filesUnder("apps"),
    ...filesUnder("packages"),
  ].filter(
    (path) => /\.(?:ts|tsx|mjs)$/.test(path) && !path.includes("/tests/"),
  )) {
    const source = read(file);
    assert.doesNotMatch(source, /CREED_DEPLOYMENT|isCreedCloud|useIsCreedCloud/, file);
  }
  assert.match(read("apps/open/edition/config.ts"), /hostedAccounts: false/);
  assert.match(read("apps/open/edition/config.ts"), /sharedCreeds: false/);
  assert.match(read("apps/open/edition/config.ts"), /cli: false/);
  assert.match(read("apps/cloud/edition/config.ts"), /hostedAccounts: true/);
  assert.match(read("apps/cloud/edition/config.ts"), /cli: false/);
});

test("Open owner access is cryptographically checked and gates pages and APIs", () => {
  const owner = read("packages/creed-open/lib/open-owner.ts");
  const ownerCore = read("packages/creed-open/lib/open-owner-core.ts");
  assert.match(ownerCore, /timingSafeEqual/);
  assert.match(owner, /httpOnly: true/);
  assert.match(owner, /sameSite: "strict"/);
  assert.match(owner, /CREED_OWNER_SECRET/);
  assert.match(read("packages/creed-app/lib/api-auth.ts"), /@creed\/edition\/auth/);
  assert.match(read("packages/creed-app/lib/request-auth.ts"), /@creed\/edition\/auth/);
  assert.match(read("packages/creed-open/app/onboarding/page.tsx"), /getRequestAuth/);
  assert.match(read("packages/creed-open/app/authorize/page.tsx"), /getRequestAuth/);
  assert.match(read("packages/creed-open/app/authorize/decision/route.ts"), /getRequestAuth/);
});

test("Open GitHub OAuth cannot enter the Cloud-only Shared flow", () => {
  const authorize = read("packages/creed-open/app/api/app/github/authorize/route.ts");
  const callback = read("packages/creed-open/app/auth/github/callback/route.ts");
  assert.doesNotMatch(authorize, /getCreedRole|teamGithub|mode === "shared"/);
  assert.doesNotMatch(callback, /shared-github|teamGithub|upsertSharedGitHubIntegration/);
  assert.match(authorize, /mode: "personal"/);
  assert.match(callback, /mode !== "personal"/);
});

test("Open GitHub routes resolve Shared services only through the edition boundary", () => {
  const openAdapter = read("apps/open/edition/github.ts");
  assert.doesNotMatch(openAdapter, /shared-github|creed-version-control|creed-context/);
  for (const route of ["branches", "repos", "status", "push"]) {
    const source = read(`packages/creed-app/app/api/app/github/${route}/route.ts`);
    assert.match(source, /@creed\/edition\/github/);
    assert.doesNotMatch(source, /@\/lib\/shared-github/);
  }
  assert.match(read("packages/creed-app/lib/creed-backend.ts"), /@creed\/edition\/github/);
});

test("Open setup uses a versioned readiness RPC and deterministic owner record", () => {
  const setup = read("packages/creed-open/lib/open-setup.ts");
  const claim = read("packages/creed-open/app/api/open/claim/route.ts");
  const migration = read(
    "apps/open/supabase/migrations/20260815162526_open_baseline.sql",
  ).replaceAll('"', "").toLowerCase();
  const personalClaim = read(
    "apps/open/supabase/migrations/20260817213100_personal_onboarding_replace_placeholder.sql",
  ).toLowerCase();
  assert.match(setup, /creed_schema_version/);
  assert.match(setup, /REQUIRED_OPEN_SCHEMA_VERSION = "20260818034113"/);
  assert.match(claim, /creed_installation/);
  assert.doesNotMatch(claim, /listUsers/);
  assert.match(migration, /create table if not exists public\.creed_installation/);
  assert.match(migration, /revoke all on table public\.creed_installation/);
  assert.match(migration, /grant select,insert,[^\n]*update on table public\.creed_installation to service_role/);
  assert.doesNotMatch(migration, /owner@creed\.open\.invalid/);
  assert.match(migration, /revoke all on function public\.creed_schema_version\(\) from public/);
  assert.match(migration, /grant all on function public\.creed_schema_version\(\) to service_role/);
  assert.match(personalClaim, /p_action = 'replace-placeholder'/);
  assert.doesNotMatch(personalClaim, /seed-shared/);
});

test("Open members can read the content they update", () => {
  const migration = read(
    "apps/open/supabase/migrations/20260818034113_allow_member_content_reads.sql",
  ).toLowerCase();

  for (const table of ["creed_sections", "creed_proposals", "creed_activity"]) {
    assert.match(
      migration,
      new RegExp(
        `create policy "members read [^"]+"\\s+on public\\.${table}\\s+for select\\s+to authenticated\\s+using \\(private\\.creed_role\\(creed_id\\) is not null\\)`,
      ),
      `${table} needs a member SELECT policy so its UPDATE and UPSERT policies work`,
    );
  }
});

test("claimed Open owners stay on /claim until schema is ready", () => {
  const claimPage = read("packages/creed-open/app/claim/page.tsx");
  const appLayout = read("packages/creed-open/app/(creed-app)/layout.tsx");
  const onboarding = read("packages/creed-open/app/onboarding/page.tsx");
  assert.match(claimPage, /databaseReadiness\.ready &&/);
  assert.match(claimPage, /redirect\("\/"\)/);
  assert.match(appLayout, /getOpenDatabaseReadiness\(\)/);
  assert.match(appLayout, /redirect\("\/claim"\)/);
  assert.match(onboarding, /getOpenDatabaseReadiness\(\)/);
  assert.match(onboarding, /redirect\("\/claim\?next=\/onboarding"\)/);
  assert.match(onboarding, /result\.state\.sections\.length === 0/);
});

test("Open skips Cloud-only credits preload and welcome persistence", () => {
  const preload = read("packages/creed-app/components/creed/settings-preload.ts");
  const shell = read("packages/creed-app/components/creed/shell.tsx");
  const welcome = read("packages/creed-app/components/creed/welcome-dialog.tsx");
  assert.match(preload, /loadCredits = true/);
  assert.match(preload, /if \(loadCredits\)/);
  assert.match(shell, /loadCredits: hasManagedCredits/);
  assert.match(welcome, /hostedAccounts/);
  assert.match(welcome, /if \(!persistWelcomeOnServer\) return/);
});

test("Cloud retains managed billing and Shared without leaking them into Open", () => {
  assert.ok(existsSync(join(repo, "packages/creed-cloud/app/api/stripe/webhook/route.ts")));
  assert.ok(existsSync(join(repo, "packages/creed-cloud/app/onboarding/shared/page.tsx")));
  assert.match(read("packages/creed-cloud/package.json"), /"stripe"/);
  assert.doesNotMatch(read("packages/creed-app/package.json"), /"stripe"/);
  assert.doesNotMatch(read("packages/creed-open/package.json"), /"stripe"/);
});
