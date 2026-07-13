"use client";

// Dev-only mount for preview shortcuts. Lives at the root layout so they work
// on any page in development - including /pricing and /home, where the real
// (creed-app) instances aren't mounted because the entitlement gate hasn't
// let you in. Renders nothing in production.
//
//   P - welcome tour preview
//   O - "Get started" checklist card preview (click rows to toggle checks)
//   V - "New version available" toast
import { useEffect, useState } from "react";
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

export function WelcomeDevPreview() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <>
      {/* Preload the clips so the P preview never lands on an unloaded slide. */}
      <WelcomeVideoPreloader />
      <WelcomeDialog show={false} paidAt={null} previewHotkey />
      <GettingStartedDevPreview />
      <VersionToastDevPreview />
    </>
  );
}
