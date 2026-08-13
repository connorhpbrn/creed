"use client";

// Dev-only mount for preview shortcuts. Lives at the root layout so they work
// on any page in development - including /pricing and /home, where the real
// (creed-app) instances aren't mounted because the entitlement gate hasn't
// let you in. Renders nothing in production.
//
//   ⌘/Ctrl+D - open this catalog
//   ⌘/Ctrl+P - welcome tour preview
//   ⌘/Ctrl+G - "Get started" checklist card preview
//   ⌘/Ctrl+O - first-run onboarding (local only, no writes)
//   ⌘/Ctrl+V - "New version available" toast
//   ⌘/Ctrl+L - Creed first-load screen (any key or click dismisses)
//   ⌘/Ctrl+B - Billing dialog carrying every plan state at once
import { useEffect, useState } from "react";
import { CreedLoader } from "@/components/creed/creed-loader";
import {
  BillingDialog,
  type PlanCard,
} from "@creed/cloud/components/creed/billing-dialog";
import { cn } from "@creed/ui/utils";
import { WelcomeDialog } from "@/components/creed/welcome-dialog";
import { WelcomeVideoPreloader } from "@/components/creed/welcome-video-preloader";
import { showVersionUpdateToast } from "@/components/creed/app-version-notifier";
import {
  GettingStartedCardView,
  GettingStartedPresence,
  publishGettingStartedOffset,
  useCardPresence,
} from "@/components/creed/getting-started-card";
import { CreedProvider } from "@/components/creed/creed-provider";
import { OnboardingScreen } from "@/components/creed/onboarding-screen";
import { SharedOnboardingScreen } from "@creed/cloud/components/creed/shared-onboarding-screen";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";
import { ShortcutKey } from "@/components/creed/shortcut-key";
import {
  DEV_PREVIEW_ITEMS,
  onDevPreviewRequest,
  requestDevPreview,
  type DevPreviewId,
} from "@/lib/dev-preview";
import {
  GETTING_STARTED_STEPS,
  initialCreedState,
  type GettingStartedStepKey,
} from "@creed/core/creed-data";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

// Cmd/Ctrl + letter. Skips editable fields so chords like ⌘V still paste.
function isDevChord(event: KeyboardEvent, letter: string) {
  return (
    event.key.toLowerCase() === letter &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    !isEditableTarget(event.target)
  );
}

function ChordKeys({ letter }: { letter: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <ShortcutKey className="w-auto min-w-5 px-1">⌘</ShortcutKey>
      <ShortcutKey>{letter}</ShortcutKey>
    </span>
  );
}

function DevShortcutsPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.key !== "d" && event.key !== "D") ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.repeat
      ) {
        return;
      }
      event.preventDefault();
      setOpen((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const runPreview = (id: DevPreviewId) => {
    setOpen(false);
    // Let the dialog start closing before the preview opens so two modals
    // don't fight for focus.
    window.setTimeout(() => requestDevPreview(id), 0);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)] sm:max-w-sm"
        showCloseButton
      >
        <DialogHeader className="gap-1.5">
          <DialogTitle>Dev previews</DialogTitle>
          <DialogDescription>
            Letter shortcuts work outside text fields.
          </DialogDescription>
        </DialogHeader>
        <ul className="mt-1 flex flex-col">
          {DEV_PREVIEW_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => runPreview(item.id)}
                className="group flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-[var(--creed-surface-raised)] focus-visible:bg-[var(--creed-surface-raised)] focus-visible:outline-none"
              >
                <span className="min-w-0 text-sm font-medium text-[var(--creed-text)]">
                  {item.label}
                </span>
                <ChordKeys letter={item.key} />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function GettingStartedDevPreview() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [steps, setSteps] = useState<
    Partial<Record<GettingStartedStepKey, boolean>>
  >({ connect: true, review: true });

  const openPreview = () => {
    // Reset to a partial state each time it's opened so the G loop always
    // starts from something you can click toward completion.
    setSteps({ connect: true, review: true });
    setVisible(true);
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isDevChord(event, "g")) return;
      event.preventDefault();
      if (visible) {
        setVisible(false);
        return;
      }
      openPreview();
    }
    window.addEventListener("keydown", onKeyDown);
    const unsubscribe = onDevPreviewRequest((id) => {
      if (id === "getting-started") openPreview();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
  }, [visible]);

  const allDone = GETTING_STARTED_STEPS.every(({ key }) => steps[key]);

  // Mirror the real card's toast-offset contract (same shared publisher, so
  // the preview carries the same deferred-write behaviour as production ,
  // no per-frame writes to <html> during the reveal).
  useEffect(() => {
    if (!visible) publishGettingStartedOffset(null);
  }, [visible]);
  useEffect(() => () => publishGettingStartedOffset(null), []);

  const { render, settled } = useCardPresence(visible);

  if (!render) return null;

  return (
    <GettingStartedPresence settled={settled} id="getting-started-dev-preview">
      <GettingStartedCardView
        steps={steps}
        expanded={expanded}
        allDone={allDone}
        onDismiss={() => setVisible(false)}
        onToggleExpanded={() => setExpanded((current) => !current)}
        onStepClick={(step) =>
          setSteps((current) => ({ ...current, [step]: !current[step] }))
        }
        onTargetHeight={publishGettingStartedOffset}
      />
    </GettingStartedPresence>
  );
}

function OnboardingDevPreview() {
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState<"personal" | "shared">("personal");

  const close = () => {
    setOpen(false);
    setBranch("personal");
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isDevChord(event, "o")) {
        event.preventDefault();
        if (open) {
          close();
        } else {
          setBranch("personal");
          setOpen(true);
        }
        return;
      }
      if (open && event.key === "Escape" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    const unsubscribe = onDevPreviewRequest((id) => {
      if (id === "onboarding") {
        setBranch("personal");
        setOpen(true);
      }
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      {branch === "shared" ? (
        <SharedOnboardingScreen
          creedId={null}
          previewMode
          onPreviewClose={close}
          onPreviewBackToType={() => setBranch("personal")}
        />
      ) : (
        <CreedProvider
          initialState={initialCreedState}
          persistenceEnabled={false}
        >
          <OnboardingScreen
            paid
            previewMode
            onPreviewClose={close}
            onPreviewShared={() => setBranch("shared")}
          />
        </CreedProvider>
      )}
    </div>
  );
}

function VersionToastDevPreview() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isDevChord(event, "v")) return;
      event.preventDefault();
      showVersionUpdateToast();
    }
    window.addEventListener("keydown", onKeyDown);
    const unsubscribe = onDevPreviewRequest((id) => {
      if (id === "version") showVersionUpdateToast();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
  }, []);

  return null;
}

// Matches nothing in production - the real screen is removed by the router
// rather than faded - but dismissing the preview with a fade beats having it
// blink out from under you.
const PREVIEW_EXIT_MS = 380;

function CreedLoaderDevPreview() {
  const [phase, setPhase] = useState<"hidden" | "showing" | "leaving">(
    "hidden",
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || isEditableTarget(event.target)) return;
      // While it's up, any key dismisses it - the real screen has nothing to
      // interact with, so trapping the keyboard behind it would just be annoying.
      if (phase === "showing") {
        setPhase("leaving");
        return;
      }
      if (phase === "hidden" && isDevChord(event, "l")) {
        event.preventDefault();
        setPhase("showing");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    const unsubscribe = onDevPreviewRequest((id) => {
      if (id === "loader") setPhase("showing");
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
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

// One row per Cloud subscription state the dialog can render.
const BILLING_PREVIEW_PLANS: PlanCard[] = [
  {
    scope: "cloud",
    creedId: null,
    name: "Creed Cloud",
    paid: true,
    interval: "month",
    status: "active",
    currentPeriodEnd: "2026-09-03T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  },
  {
    scope: "cloud",
    creedId: "preview-cloud-cancelled",
    name: "Creed Cloud",
    paid: true,
    interval: "year",
    status: "active",
    currentPeriodEnd: "2027-03-12T00:00:00.000Z",
    // Cancelled but still running to the end of the period.
    cancelAtPeriodEnd: true,
  },
];

function BillingDevPreview() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isDevChord(event, "b")) return;
      event.preventDefault();
      setOpen((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    const unsubscribe = onDevPreviewRequest((id) => {
      if (id === "billing") setOpen(true);
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
  }, []);

  return (
    <BillingDialog
      open={open}
      onOpenChange={setOpen}
      previewPlans={BILLING_PREVIEW_PLANS}
    />
  );
}

export function WelcomeDevPreview() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <>
      <WelcomeVideoPreloader />
      <DevShortcutsPanel />
      <WelcomeDialog show={false} paidAt={null} previewHotkey />
      <GettingStartedDevPreview />
      <OnboardingDevPreview />
      <VersionToastDevPreview />
      <CreedLoaderDevPreview />
      <BillingDevPreview />
    </>
  );
}
