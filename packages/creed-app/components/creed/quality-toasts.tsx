"use client";

// Shell-level subscriber that toasts when a user-initiated full analysis
// finishes, no matter which app page is mounted. The quality runner is a
// module-level singleton, so a run started on /file still resolves here when
// the user has navigated to /connections or /settings.

import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  getQualityRunnerServerSnapshot,
  getQualityRunnerSnapshot,
  subscribeQualityRunner,
} from "@/lib/ai/quality-runner";
import {
  clearSettingsCreditsCache,
  clearSettingsUsageCache,
} from "@/components/creed/settings-preload";

export function QualityToasts() {
  const snapshot = useSyncExternalStore(
    subscribeQualityRunner,
    getQualityRunnerSnapshot,
    getQualityRunnerServerSnapshot
  );
  const outcome = snapshot.lastOutcome;
  // Tracks the last outcome we've toasted. Starts null so we can adopt whatever
  // already happened before mount without re-toasting it.
  const lastSeenId = useRef<number | null>(null);

  useEffect(() => {
    const id = outcome?.id ?? 0;
    if (lastSeenId.current === null) {
      lastSeenId.current = id;
      return;
    }
    if (!outcome || id === lastSeenId.current) {
      return;
    }
    lastSeenId.current = id;

    if (!outcome.ok) {
      toast.error(outcome.message || "Analysis failed");
      return;
    }
    // A completed analysis recorded usage and (in credits mode) a debit. Drop
    // the cached settings data so the balance and spend chart refetch fresh the
    // next time Settings is opened, instead of showing stale figures.
    clearSettingsCreditsCache();
    clearSettingsUsageCache();
    toast.success("Analysis complete");
    if (outcome.lowCredits) {
      toast.warning("Running low on credits");
    }
  }, [outcome]);

  return null;
}
