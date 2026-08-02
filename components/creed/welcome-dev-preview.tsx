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
//   B - Billing dialog carrying every plan state at once
import { useEffect, useState } from "react";
import { CreedLoader } from "@/components/creed/creed-loader";
import {
  BillingDialog,
  type PlanCard,
} from "@/components/creed/billing-dialog";
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


// Every shape the billing dialog can be handed, in one list: the two personal
// billing modes, a healthy company plan, one past due, one with no credits at
// all, and the unpaid row. Deliberately impossible as real data - nobody owns
// two personal plans - because the point is to see the states together.
const BILLING_PREVIEW_PLANS: PlanCard[] = [
  {
    scope: "personal",
    creedId: null,
    name: "Personal",
    paid: true,
    billingMode: "subscription",
    interval: "month",
    status: "active",
    currentPeriodEnd: "2026-09-03T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    // Part spent, and topped up: the case where balance exceeds the allowance.
    credits: {
      balanceUsd: 32.4,
      allowanceUsd: 20,
      allowanceResets: true,
      purchasedUsd: 20,
    },
  },
  {
    scope: "personal",
    creedId: "preview-personal-annual",
    name: "Personal",
    paid: true,
    billingMode: "subscription",
    interval: "year",
    status: "active",
    currentPeriodEnd: "2027-03-12T00:00:00.000Z",
    // Cancelled but still running: the row reads "Ends" rather than "Renews".
    cancelAtPeriodEnd: true,
    credits: {
      balanceUsd: 4.15,
      allowanceUsd: 20,
      allowanceResets: true,
      purchasedUsd: 0,
    },
  },
  {
    scope: "personal",
    creedId: "preview-personal-lifetime",
    name: "Personal",
    paid: true,
    billingMode: "lifetime",
    interval: null,
    status: "active",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    // One-time credits: no reset, no Manage link.
    credits: {
      balanceUsd: 180,
      allowanceUsd: 200,
      allowanceResets: false,
      purchasedUsd: 0,
    },
  },
  {
    scope: "company",
    creedId: "preview-company-annual",
    name: "Northwind Labs",
    paid: true,
    billingMode: "subscription",
    interval: "year",
    status: "active",
    currentPeriodEnd: "2027-01-08T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    credits: {
      balanceUsd: 42,
      allowanceUsd: 50,
      allowanceResets: true,
      purchasedUsd: 0,
    },
  },
  {
    scope: "company",
    creedId: "preview-company-past-due",
    name: "A company with a name long enough to truncate",
    paid: true,
    billingMode: "subscription",
    interval: "month",
    status: "past_due",
    currentPeriodEnd: "2026-08-19T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    // Allowance exhausted, top-ups keeping it alive.
    credits: {
      balanceUsd: 6.5,
      allowanceUsd: 50,
      allowanceResets: true,
      purchasedUsd: 6.5,
    },
  },
  {
    scope: "company",
    creedId: "preview-company-lifetime",
    name: "Halcyon",
    paid: true,
    billingMode: "lifetime",
    interval: null,
    status: "active",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    // Credits failed to load: the row must not claim a zero balance.
    credits: null,
  },
  {
    scope: "personal",
    creedId: "preview-personal-free",
    name: "Personal",
    paid: false,
    billingMode: null,
    interval: null,
    status: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    credits: null,
  },
];

function BillingDevPreview() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "b" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      setOpen((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
      {/* Preload the clips so the P preview never lands on an unloaded slide. */}
      <WelcomeVideoPreloader />
      <WelcomeDialog show={false} paidAt={null} previewHotkey />
      <GettingStartedDevPreview />
      <VersionToastDevPreview />
      <CreedLoaderDevPreview />
      <BillingDevPreview />
    </>
  );
}
