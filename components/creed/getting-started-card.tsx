"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useCreed } from "@/components/creed/creed-provider";
import {
  GETTING_STARTED_STEPS,
  type GettingStartedStepKey,
} from "@/lib/creed-data";
import { cn } from "@/lib/utils";

// Post-onboarding "Get started" checklist. Lives in the bottom-right corner
// where toasts spawn, shaped exactly like a toast: same width, radius,
// shadow, and collapsed height, but surfaced as the app canvas colour
// (--creed-surface) with a plain border. The chevron sits where a toast's
// close button sits and expands the five steps; each checks itself off the
// first time the user does the thing (see markGettingStartedStep call
// sites). Once all five are done the card turns into a toast-like
// confirmation (the chevron becomes an X) that auto-dismisses on the toast
// timer, or the X closes it early; either way it never renders again.
//
// The card publishes its rendered height as --getting-started-offset on the
// root element; the shared <Toaster> offsets by it, so toasts always stack
// just above the card and track its expansion in real time.

const COLLAPSE_PREF_KEY = "creed:getting-started-collapsed";
const OFFSET_VAR = "--getting-started-offset";
// Matches the Toaster's duration={4000} so the completed card behaves like
// any other toast: auto-dismisses after four seconds unless closed sooner.
const COMPLETION_DISMISS_MS = 4_000;

function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const fraction = total === 0 ? 0 : done / total;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="var(--creed-border)"
        strokeWidth="2"
      />
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="#2563EB"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        transform="rotate(-90 9 9)"
        className="transition-[stroke-dashoffset] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
      />
    </svg>
  );
}

// Presentational card. The connected wrapper below feeds it real progress;
// the dev O-preview feeds it local mock state.
export function GettingStartedCardView({
  steps,
  expanded,
  onToggleExpanded,
  allDone = false,
  onDismiss,
  onStepClick,
}: {
  steps: Partial<Record<GettingStartedStepKey, boolean>>;
  expanded: boolean;
  onToggleExpanded: () => void;
  allDone?: boolean;
  onDismiss?: () => void;
  onStepClick?: (step: GettingStartedStepKey) => void;
}) {
  const doneCount = GETTING_STARTED_STEPS.filter(({ key }) => steps[key]).length;
  const total = GETTING_STARTED_STEPS.length;

  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_10px_30px_rgba(28,28,26,0.10)]">
      {allDone ? (
        // Completion: a toast-shaped confirmation. The X sits in the same
        // slot the chevron occupied, styled like a toast close button.
        <div className="relative flex items-center gap-3 p-3.5 pr-14">
          <ProgressRing done={total} total={total} />
          <div className="flex-1 truncate text-[13px] font-medium leading-5 text-[var(--creed-text-primary)]">
            You&apos;re all set.
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          {/* Same box as a title-only toast: p-3.5 around one 20px line,
              with the chevron absolutely positioned like the toast's close
              button so it adds no height. */}
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            className="relative flex w-full items-center gap-3 p-3.5 pr-20 text-left"
          >
            <ProgressRing done={doneCount} total={total} />
            <span className="flex-1 truncate text-[13px] font-medium leading-5 text-[var(--creed-text-primary)]">
              Get started
            </span>
            {/* right-12 lines the counter's right edge up with the version
                toast's Refresh label (action button at right-10 + px-2). */}
            <span className="absolute right-12 top-1/2 -translate-y-1/2 text-[12px] tabular-nums text-[var(--creed-text-tertiary)]">
              {doneCount}/{total}
            </span>
            <span className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]">
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-300",
                  expanded && "rotate-180",
                )}
              />
            </span>
          </button>
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              expanded
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <ul className="px-3.5 pb-3 pt-0.5">
                {GETTING_STARTED_STEPS.map(({ key, label }) => (
                  <StepRow
                    key={key}
                    stepKey={key}
                    label={label}
                    done={Boolean(steps[key])}
                    onClick={onStepClick ? () => onStepClick(key) : undefined}
                  />
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function GettingStartedCard() {
  const { state } = useCreed();
  const gettingStarted = state.gettingStarted;

  const [expanded, setExpanded] = useState(false);
  // The completion confirmation shows once the last step lands on screen and
  // stays until dismissed (auto after the toast timer, or via the X).
  const [showingCompletion, setShowingCompletion] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sawIncompleteRef = useRef(false);
  const completionHandledRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);

  const steps = gettingStarted?.steps ?? {};
  const doneCount = GETTING_STARTED_STEPS.filter(({ key }) => steps[key]).length;
  const allDone =
    doneCount === GETTING_STARTED_STEPS.length ||
    Boolean(gettingStarted?.completedAt);

  // Expanded by default the very first time; collapse choice remembered.
  useEffect(() => {
    try {
      setExpanded(localStorage.getItem(COLLAPSE_PREF_KEY) !== "1");
    } catch {
      setExpanded(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setDismissed(true);
  }, []);

  // Completing the last step while the card is on screen shows the
  // confirmation and starts the auto-dismiss timer; arriving already-complete
  // (a page load after the fact) shows nothing. Handled exactly once, and the
  // timer is NOT tied to this effect's lifecycle so a re-run (e.g. a sync
  // giving `gettingStarted` a new identity) can't cancel or restart it.
  useEffect(() => {
    if (!gettingStarted) return;
    if (!allDone) {
      sawIncompleteRef.current = true;
      return;
    }
    if (sawIncompleteRef.current && !completionHandledRef.current) {
      completionHandledRef.current = true;
      setShowingCompletion(true);
      dismissTimerRef.current = window.setTimeout(
        dismiss,
        COMPLETION_DISMISS_MS,
      );
    }
  }, [gettingStarted, allDone, dismiss]);

  // Clear a pending timer if the card unmounts first.
  useEffect(
    () => () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    },
    [],
  );

  const visible =
    Boolean(gettingStarted) &&
    !dismissed &&
    (!allDone || showingCompletion);

  // Publish the card's live height so the toast stack sits above it. The
  // observer tracks the expand/collapse animation frame by frame.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.removeProperty(OFFSET_VAR);
      return;
    }
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      root.style.setProperty(
        OFFSET_VAR,
        `${Math.ceil(node.getBoundingClientRect().height) + 12}px`,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty(OFFSET_VAR);
    };
  }, [visible]);

  if (!visible) return null;

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_PREF_KEY, next ? "0" : "1");
      } catch {
        // Preference only; losing it just means the default next load.
      }
      return next;
    });
  }

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 z-40 hidden w-[356px] sm:block"
    >
      <GettingStartedCardView
        steps={steps}
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        allDone={showingCompletion && allDone}
        onDismiss={dismiss}
      />
    </div>
  );
}

function StepRow({
  stepKey,
  label,
  done,
  onClick,
}: {
  stepKey: GettingStartedStepKey;
  label: string;
  done: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          done
            ? "scale-100 border-transparent bg-[#2563EB]"
            : "border-[var(--creed-border-strong)] bg-transparent",
        )}
      >
        <Check
          strokeWidth={3}
          className={cn(
            "h-2.5 w-2.5 text-white transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            done ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
        />
      </span>
      <span
        className={cn(
          "text-[13px] leading-5 transition-colors duration-300",
          done
            ? "text-[var(--creed-text-tertiary)]"
            : "text-[var(--creed-text-secondary)]",
        )}
      >
        {label}
      </span>
    </>
  );

  if (onClick) {
    return (
      <li data-step={stepKey}>
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-2.5 py-[7px] text-left"
        >
          {content}
        </button>
      </li>
    );
  }

  return (
    <li data-step={stepKey} className="flex items-center gap-2.5 py-[7px]">
      {content}
    </li>
  );
}
