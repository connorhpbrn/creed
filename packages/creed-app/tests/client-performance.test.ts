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
  assert.match(file, /active=\{active && fileViewMode === "nexus"\}/);
  assert.match(nexus, /animationAlphaRef\.current = Math\.max\(animationAlphaRef\.current, 0\.5\)/);
});

test("app routes are lazily mounted once and retained by the app shell", () => {
  const shellLayout = source("../components/creed/app-shell-layout.tsx");
  const surface = source("../components/creed/persistent-file-surface.tsx");
  const loader = source("../components/creed/file-screen-loader.ts");
  const page = source("../app/(creed-app)/file/page.tsx");

  assert.match(shellLayout, /<PersistentAppSurfaces>\{children\}<\/PersistentAppSurfaces>/);
  assert.match(surface, /const \[mountedSurfaces, setMountedSurfaces\] = useState/);
  assert.match(surface, /activeSurface === surface \|\| mountedSurfaces\.has\(surface\)/);
  assert.match(surface, /hidden: activeSurface !== surface/);
  assert.match(surface, /inert: activeSurface !== surface/);
  assert.match(surface, /<LazyFileScreen active=\{activeSurface === "file"\} \/>/);
  assert.match(surface, /<LazyConnectionsScreen active=\{activeSurface === "connections"\} \/>/);
  assert.match(surface, /<LazySettingsScreen active=\{activeSurface === "settings"\} \/>/);
  assert.match(surface, /<SurfaceFallback surface="file" \/>/);
  assert.match(surface, /<SurfaceFallback surface="connections" \/>/);
  assert.match(surface, /<SurfaceFallback surface="settings" \/>/);
  assert.match(surface, /import \{ FileLoading \} from/);
  assert.match(surface, /surface === "connections"/);
  assert.match(surface, /surface === "settings"/);
  assert.match(loader, /fileScreenPromise \?\?= import/);
  assert.match(loader, /fileScreenPromise = null/);
  assert.match(loader, /loadFileScreen\(\)\.catch\(\(\) => undefined\)/);
  assert.match(surface, /<SurfaceErrorBoundary name="The file">/);
  assert.match(page, /return null/);
  assert.doesNotMatch(page, /import .*FileScreen/);
});

test("hidden file surface pauses route-only work", () => {
  const file = source("../components/creed/file-screen.tsx");
  assert.match(file, /export function FileScreen\(\{ active = true \}/);
  assert.match(file, /if \(!active \|\| !qualityEnabled\) return/);
  assert.match(file, /if \(!active\) \{\s*setActiveShellSection\(null\)/);
  assert.match(file, /if \(!active \|\| typeof window === "undefined"\)/);
  assert.match(file, /active=\{active && fileViewMode === "nexus"\}/);
  assert.match(file, /key=\{`\$\{state\.creedId \?\? "unscoped"\}:\$\{section\.id\}`\}/);
});

test("active Creed resolution is passed through the app layout", () => {
  const layout = source("../../creed-cloud/app/(creed-app)/layout.tsx");
  const providers = source("../components/creed/authed-providers.tsx");
  assert.match(layout, /activeCreed=\{active\}/);
  assert.match(providers, /activeCreed === undefined/);
});

test("rich text transactions defer serialization and parent publication", () => {
  const editor = source("../components/creed/rich-text-editor.tsx");
  const onUpdate = editor.match(
    /onUpdate\(\{ editor \}\) \{([\s\S]*?)\n    \},\n    onSelectionUpdate/,
  )?.[1];
  assert.ok(onUpdate);
  assert.doesNotMatch(onUpdate, /getHTML|DOMParser|onChangeRef/);
  assert.match(onUpdate, /publishSchedulerRef\.current\.schedule\(\)/);
  assert.match(editor, /shouldRerenderOnTransaction: false/);
  assert.match(editor, /document\.visibilityState === "hidden"/);
});
