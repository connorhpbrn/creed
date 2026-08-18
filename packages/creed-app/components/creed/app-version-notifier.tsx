"use client";

import { useCallback, useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

const UPDATE_TOAST_ID = "creed-app-version-update";
// The version only changes on deploy, and /api/version is CDN-cached for
// 5 minutes - polling faster than that just re-reads the same cached body.
const VERSION_CHECK_INTERVAL_MS = 300_000;

type AppVersionNotifierProps = {
  initialVersion: string;
};

type VersionPayload = {
  version?: string | null;
};

// Shared with the dev ⌘V preview / Cmd+D panel (welcome-dev-preview.tsx)
// so the preview renders the exact production toast.
export function showVersionUpdateToast() {
  toast.info("New version available", {
    id: UPDATE_TOAST_ID,
    duration: Infinity,
    closeButton: false,
    action: {
      label: (
        <>
          <RefreshCw aria-hidden="true" />
          <span className="sr-only">Refresh</span>
        </>
      ),
      onClick: () => {
        window.location.reload();
      },
    },
    classNames: {
      toast: "!pr-10",
      actionButton:
        "!absolute !top-1/2 !right-2.5 !left-auto !m-0 !flex !h-7 !w-7 !min-w-0 !-translate-y-1/2 !transform-none !items-center !justify-center !rounded-[8px] !border-0 !bg-transparent !p-0 !text-current !opacity-70 hover:!bg-current/[0.10] hover:!opacity-100 !transition-all [&_svg]:!h-4 [&_svg]:!w-4",
    },
  });
}

export function AppVersionNotifier({
  initialVersion,
}: AppVersionNotifierProps) {
  const shownVersionRef = useRef<string | null>(null);

  const showVersionNotice = useCallback((version: string) => {
    shownVersionRef.current = version;
    showVersionUpdateToast();
  }, []);

  const checkForUpdate = useCallback(async () => {
    try {
      const response = await fetch("/api/version");
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as VersionPayload;
      const latestVersion = payload.version?.trim();
      if (!latestVersion || latestVersion === initialVersion) {
        return;
      }
      if (latestVersion === shownVersionRef.current) {
        return;
      }

      showVersionNotice(latestVersion);
    } catch {
      // Version checks should never interrupt normal app use.
    }
  }, [initialVersion, showVersionNotice]);

  useEffect(() => {
    // Poll only while the tab is visible. Hidden/backgrounded tabs stop
    // entirely; a visibility-gain checks once and restarts the interval,
    // so a stale tab still learns about a new deploy the moment it's seen.
    let intervalId: number | null = null;

    function stopPolling() {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }

    function startPolling() {
      stopPolling();
      intervalId = window.setInterval(
        checkForUpdate,
        VERSION_CHECK_INTERVAL_MS,
      );
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
        startPolling();
      } else {
        stopPolling();
      }
    }

    if (document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkForUpdate]);

  return null;
}
