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

test("file performance work preserves section and rail animation lifecycles", () => {
  const file = source("../components/creed/file-screen.tsx");
  const nexus = source("../components/creed/nexus-view.tsx");
  assert.match(file, /<ActivityRail[\s\S]*open=\{activityOpen\}/);
  assert.match(file, /Keep Tiptap mounted/);
  assert.match(file, /stiffness: 340,[\s\S]*damping: 32,[\s\S]*mass: 0\.85/);
  assert.match(file, /height: \{ duration: 0\.44, ease:/);
  assert.doesNotMatch(file, /StaticSectionPreview/);
  assert.doesNotMatch(file, /editorNearViewport/);
  assert.match(file, /activityDiffCache/);
  assert.match(file, /proposalsById/);
  assert.match(file, /new IntersectionObserver/);
  assert.doesNotMatch(file, /requestIdleCallback\(mountNexus/);
  assert.match(file, /active=\{fileViewMode === "nexus"\}/);
  assert.match(nexus, /animationAlphaRef\.current = Math\.max\(animationAlphaRef\.current, 0\.5\)/);
});

test("active Creed resolution is passed through the app layout", () => {
  const layout = source("../app/(creed-app)/layout.tsx");
  const providers = source("../components/creed/authed-providers.tsx");
  assert.match(layout, /activeCreed=\{active\}/);
  assert.match(providers, /activeCreed === undefined/);
});
