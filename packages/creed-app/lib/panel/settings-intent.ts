// Panel → Settings handoff. Same pattern as the shell's file-nav intent: the
// sender stashes an intent in sessionStorage and navigates; the settings
// screen consumes it on mount. When the user is ALREADY on /settings the
// navigation is a no-op and no remount happens, so the sender also fires a
// window event the settings screen listens for.

import type { SettingsSectionKey, UsageRangeValue } from "@/lib/panel/actions";

export type SettingsPanelIntent = {
  scrollTo?: SettingsSectionKey;
  usageRange?: UsageRangeValue;
  aiMode?: "credits" | "byok";
  openDialog?: "add-credits" | "credits-history";
};

const KEY = "creed:panel-settings-intent";

// Intents left behind by an interrupted navigation shouldn't fire on a page
// load minutes later.
const MAX_AGE_MS = 60_000;

export const SETTINGS_PANEL_INTENT_EVENT = "creed:panel-settings-intent";

export function setSettingsPanelIntent(intent: SettingsPanelIntent) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify({ ...intent, ts: Date.now() }));
}

export function dispatchSettingsPanelIntent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SETTINGS_PANEL_INTENT_EVENT));
}

export function consumeSettingsPanelIntent(): SettingsPanelIntent | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(KEY);
  try {
    const parsed = JSON.parse(raw) as SettingsPanelIntent & { ts?: number };
    if (typeof parsed.ts === "number" && Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
