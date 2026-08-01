"use client";

// Dev-only mount for preview shortcuts. Lives at the root layout so they work
// on any page in development - including /pricing and /home, where the real
// (creed-app) instances aren't mounted because the entitlement gate hasn't
// let you in. Renders nothing in production.
//
//   P - welcome tour preview
//   O - "Get started" checklist card preview (click rows to toggle checks)
//   V - "New version available" toast
//   L - Creed first-load screen (any key or click dismisses)
import { useEffect, useState } from "react";
import { CreedLoader } from "@/components/creed/creed-loader";
import { cn } from "@/lib/utils";
import { WelcomeDialog } from "@/components/creed/welcome-dialog";
import { WelcomeVideoPreloader } from "@/components/creed/welcome-video-preloader";
import { showVersionUpdateToast } from "@/components/creed/app-version-notifier";
import { GettingStartedCardView } from "@/components/creed/getting-started-card";
import {
  GETTING_STARTED_STEPS,
  type GettingStartedStepKey,
} from "@/lib/creed-data";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

function GettingStartedDevPreview() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [steps, setSteps] = useState<
    Partial<Record<GettingStartedStepKey, boolean>>
  >({ connect: true, review: true });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "o" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      // Reset to a partial state each time it's opened so the O loop always
      // starts from something you can click toward completion.
      setSteps({ connect: true, review: true });
      setVisible((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const allDone = GETTING_STARTED_STEPS.every(({ key }) => steps[key]);

  // Mirror the real card's toast-offset contract so the V toast stacks
  // above the preview exactly like production.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.removeProperty("--getting-started-offset");
      return;
    }
    const node = document.getElementById("getting-started-dev-preview");
    if (!node) return;
    const update = () => {
      root.style.setProperty(
        "--getting-started-offset",
        `${Math.ceil(node.getBoundingClientRect().height) + 12}px`,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--getting-started-offset");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      id="getting-started-dev-preview"
      className="fixed bottom-5 right-5 z-40 hidden w-[356px] sm:block"
    >
      <GettingStartedCardView
        steps={steps}
        expanded={expanded}
        allDone={allDone}
        onDismiss={() => setVisible(false)}
        onToggleExpanded={() => setExpanded((current) => !current)}
        onStepClick={(step) =>
          setSteps((current) => ({ ...current, [step]: !current[step] }))
        }
      />
    </div>
  );
}

function VersionToastDevPreview() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "v" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      showVersionUpdateToast();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}

// Matches nothing in production - the real screen is removed by the router
// rather than faded - but dismissing the preview with a fade beats having it
// blink out from under you.
const PREVIEW_EXIT_MS = 380;

function CreedLoaderDevPreview() {
  const [phase, setPhase] = useState<"hidden" | "showing" | "leaving">("hidden");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      // While it's up, any key dismisses it - the real screen has nothing to
      // interact with, so trapping the keyboard behind it would just be annoying.
      if (phase === "showing") {
        setPhase("leaving");
        return;
      }
      if (phase === "hidden" && event.key.toLowerCase() === "l") {
        setPhase("showing");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timeoutId = window.setTimeout(
      () => setPhase("hidden"),
      PREVIEW_EXIT_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] cursor-pointer transition-opacity ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${PREVIEW_EXIT_MS}ms` }}
      onClick={() => setPhase("leaving")}
    >
      <CreedLoader />
    </div>
  );
}

export function WelcomeDevPreview() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <>
      {/* Preload the clips so the P preview never lands on an unloaded slide. */}
      <WelcomeVideoPreloader />
      <WelcomeDialog show={false} paidAt={null} previewHotkey />
      <GettingStartedDevPreview />
      <VersionToastDevPreview />
      <CreedLoaderDevPreview />
    </>
  );
}
