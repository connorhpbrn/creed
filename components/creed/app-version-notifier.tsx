"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const UPDATE_TOAST_ID = "creed-app-version-update";
const VERSION_CHECK_INTERVAL_MS = 60_000;

type AppVersionNotifierProps = {
  initialVersion: string;
};

type VersionPayload = {
  version?: string | null;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

export function AppVersionNotifier({
  initialVersion,
}: AppVersionNotifierProps) {
  const shownVersionRef = useRef<string | null>(null);

  const showVersionNotice = useCallback(
    (version: string) => {
      shownVersionRef.current = version;
      toast.info("New version available", {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        closeButton: true,
        action: {
          label: "Refresh",
          onClick: () => {
            window.location.reload();
          },
        },
        classNames: {
          toast: "!pr-24",
          actionButton:
            "!absolute !top-1/2 !right-10 !left-auto !-translate-y-1/2 !transform-none !h-7 !rounded-[8px] !bg-transparent !border-0 !px-2 !text-[12px] !font-medium !text-current !opacity-70 hover:!opacity-100 hover:!bg-current/[0.10] !transition-all",
        },
      });
    },
    [],
  );

  const checkForUpdate = useCallback(async () => {
    try {
      const response = await fetch(`/api/version?ts=${Date.now()}`, {
        cache: "no-store",
      });
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
    const timeoutId = window.setTimeout(
      checkForUpdate,
      VERSION_CHECK_INTERVAL_MS,
    );
    const intervalId = window.setInterval(
      checkForUpdate,
      VERSION_CHECK_INTERVAL_MS,
    );

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkForUpdate]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "r" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      showVersionNotice("dev-preview");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showVersionNotice]);

  return null;
}
