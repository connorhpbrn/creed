import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("shell preloads and MCP health reuse stable cached inputs", () => {
  const shell = source("../components/creed/shell.tsx");
  const health = source("../components/creed/mcp-health-preload.ts");
  assert.doesNotMatch(shell, /state\.sections,\s*state\.creedId/);
  assert.match(shell, /sections\.length/);
  assert.match(health, /if \(!force && entry\.value\)/);
});

test("Creed consumers can subscribe to state slices independently", () => {
  const provider = source("../components/creed/creed-provider.tsx");
  const panel = source("../components/creed/panel.tsx");
  assert.match(provider, /CreedStateStoreContext/);
  assert.match(provider, /export function useCreedStateSelector/);
  assert.match(provider, /export function useCreedActions/);
  assert.match(panel, /sameClosedPanelState/);
});

test("hidden and offscreen file surfaces avoid eager expensive work", () => {
  const file = source("../components/creed/file-screen.tsx");
  assert.match(file, /activityOpen \? \(/);
  assert.match(file, /editorNearViewport \|\| proposalDirty/);
  assert.match(file, /StaticSectionPreview/);
  assert.match(file, /activityDiffCache/);
  assert.match(file, /proposalsById/);
  assert.match(file, /new IntersectionObserver/);
});

test("active Creed resolution is passed through the app layout", () => {
  const layout = source("../app/(creed-app)/layout.tsx");
  const providers = source("../components/creed/authed-providers.tsx");
  assert.match(layout, /activeCreed=\{active\}/);
  assert.match(providers, /activeCreed === undefined/);
});
