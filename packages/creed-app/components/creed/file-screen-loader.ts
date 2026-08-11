import type { ComponentType } from "react";

type FileScreenComponent = ComponentType<{ active?: boolean }>;
type ConnectionsScreenComponent = ComponentType<{ active?: boolean }>;
type SettingsScreenComponent = ComponentType<{ active?: boolean }>;

let fileScreenPromise: Promise<{ default: FileScreenComponent }> | null = null;
let connectionsScreenPromise: Promise<{
  default: ConnectionsScreenComponent;
}> | null = null;
let settingsScreenPromise: Promise<{
  default: SettingsScreenComponent;
}> | null = null;

export function loadFileScreen() {
  fileScreenPromise ??= import("@/components/creed/file-screen")
    .then((module) => ({ default: module.FileScreen }))
    .catch((error: unknown) => {
      // A transient chunk failure must not poison later hover, idle, or route
      // attempts with the same rejected promise.
      fileScreenPromise = null;
      throw error;
    });
  return fileScreenPromise;
}

export function preloadFileScreen() {
  // Preloading is speculative. Navigation will retry through loadFileScreen,
  // so a network failure here should never become an unhandled rejection.
  void loadFileScreen().catch(() => undefined);
}

export function loadConnectionsScreen() {
  connectionsScreenPromise ??= import("@/components/creed/connections-screen")
    .then((module) => ({ default: module.ConnectionsScreen }))
    .catch((error: unknown) => {
      connectionsScreenPromise = null;
      throw error;
    });
  return connectionsScreenPromise;
}

export function preloadConnectionsScreen() {
  void loadConnectionsScreen().catch(() => undefined);
}

export function loadSettingsScreen() {
  settingsScreenPromise ??= import("@/components/creed/settings-screen")
    .then((module) => ({ default: module.SettingsScreen }))
    .catch((error: unknown) => {
      settingsScreenPromise = null;
      throw error;
    });
  return settingsScreenPromise;
}

export function preloadSettingsScreen() {
  void loadSettingsScreen().catch(() => undefined);
}
