import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("each app surface Suspense fallback uses the route loading component", () => {
  const surface = source("../components/creed/persistent-file-surface.tsx");
  const fileLoading = source("../app/(creed-app)/file/loading.tsx");
  const connectionsLoading = source("../app/(creed-app)/connections/loading.tsx");
  const settingsLoading = source("../app/(creed-app)/settings/loading.tsx");

  assert.match(surface, /import \{ FileLoading \} from "@\/app\/\(creed-app\)\/file\/loading"/);
  assert.match(
    surface,
    /import \{ ConnectionsLoading \} from "@\/app\/\(creed-app\)\/connections\/loading"/,
  );
  assert.match(
    surface,
    /import \{ SettingsLoading \} from "@\/app\/\(creed-app\)\/settings\/loading"/,
  );
  assert.match(surface, /return <FileLoading \/>/);
  assert.match(surface, /return <ConnectionsLoading \/>/);
  assert.match(surface, /return <SettingsLoading \/>/);
  assert.doesNotMatch(surface, /function FileLoading/);

  assert.match(fileLoading, /export function FileLoading/);
  assert.match(fileLoading, /max-w-\[920px\]/);
  assert.match(fileLoading, /preset="fileTitle"/);
  assert.match(fileLoading, /SkeletonRing size=\{17\}/);

  assert.match(connectionsLoading, /export function ConnectionsLoading/);
  assert.match(connectionsLoading, /max-w-\[960px\]/);
  assert.match(connectionsLoading, /h-8 w-\[68px\] shrink-0 rounded-md/);

  assert.match(settingsLoading, /export function SettingsLoading/);
  assert.match(
    settingsLoading,
    /grid-cols-\[4\.5rem_minmax\(0,1fr\)\]/,
  );
  assert.doesNotMatch(settingsLoading, /col-span-2/);
  assert.match(settingsLoading, /md:grid-cols-\[1\.1fr_0\.9fr\]/);
});

test("late-data health and usage use measured section skeletons", () => {
  const health = source("../components/creed/mcp-health-dashboard.tsx");
  const settings = source("../components/creed/settings-screen.tsx");

  assert.match(health, /SkeletonText preset="fig28"/);
  assert.match(health, /SkeletonBar className="h-\[240px\]/);
  assert.match(health, /SkeletonRing size=\{168\}/);
  assert.doesNotMatch(health, /Loading…/);

  assert.match(settings, /credits == null \? \(/);
  assert.match(settings, /usage == null \? \(/);
  assert.match(settings, /SkeletonBar className="h-\[120px\] w-full rounded-lg"/);
});
