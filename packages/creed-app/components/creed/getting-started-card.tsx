"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, X } from "lucide-react";
import {
  useCreedActions,
  useCreedStateSelector,
} from "@/components/creed/creed-provider";
import {
  GETTING_STARTED_STEPS,
  type GettingStartedStepKey,
} from "@creed/core/creed-data";
import { cn } from "@creed/ui/utils";

// Post-onboarding "Get started" checklist. Lives in the bottom-right corner
// where toasts spawn, shaped exactly like a toast: same width, radius,
// shadow, and collapsed height, but surfaced as the app canvas colour
// (--creed-surface) with a plain border. Progress is per Creed, so a new Creed
// always gets a fresh card. The header carries a chevron to expand the five
// steps and an X (furthest right) to dismiss; each checks itself off the first
// time the user does the thing (see markGettingStartedStep call sites). Once
// all five are done the card turns into a toast-like confirmation that
// auto-dismisses on the toast timer, or the X closes it early.
//
// The card publishes its rendered height as --getting-started-offset on the
// root element; the shared <Toaster> offsets by it, so toasts always stack
// just above the card and track its expansion in real time.

const COLLAPSE_PREF_KEY = "creed:getting-started-collapsed";
// Mirrors shell.tsx / file-screen.tsx: a queued intent the file screen picks
// up on mount, so "Check activity" can open the rail from another route.
const FILE_NAV_INTENT_KEY = "creed:file-nav-intent";

// Where each step is actually done. Steps that happen inside the file screen
// all land on /file; only activity needs an intent to open its rail.
const STEP_ACTIONS: Record<
  GettingStartedStepKey,
  { href: string; label: string; intent?: string }
> = {
  edit: { href: "/file", label: "Open file" },
  connect: { href: "/connections", label: "Connect" },
  review: { href: "/file", label: "Review" },
  analysis: { href: "/file", label: "Analyse" },
  activity: {
    href: "/file",
    label: "Open",
    intent: JSON.stringify({ type: "activity", open: true }),
  },
};
const OFFSET_VAR = "--getting-started-offset";
// Reveal transition length; the toast-offset write is deferred just past it.
const REVEAL_MS = 260;

// Single deferred publisher for the toast offset, shared with the dev O
// preview so both paths carry the same performance contract. Writing a custom
// property on <html> invalidates style for the ENTIRE document (~15ms on a
// mid-sized page, worse on /file), so the write waits until the reveal
// transition has finished and is skipped when the value hasn't changed.
// Module-level state is fine: only one card exists at a time.
let offsetTimer: number | null = null;
// Deduped on the last REQUESTED value (not the last root write) , otherwise
// collapsing back to an already-published value would skip the scoped writes
// and leave a mounted toast stack stranded at the expanded offset.
let requestedOffset: string | null = null;
export function publishGettingStartedOffset(height: number | null) {
  if (offsetTimer !== null) {
    window.clearTimeout(offsetTimer);
    offsetTimer = null;
  }
  if (height === null) {
    requestedOffset = null;
    document.documentElement.style.removeProperty(OFFSET_VAR);
    for (const stack of document.querySelectorAll<HTMLElement>(
      "[data-sonner-toaster]",
    )) {
      stack.style.removeProperty(OFFSET_VAR);
    }
    return;
  }
  const next = `${Math.ceil(height) + 12}px`;
  if (next === requestedOffset) return;
  requestedOffset = next;
  // Mounted toast stacks get the value immediately, scoped to their own
  // subtree (cheap), and glide to it on the transition the Toaster declares ,
  // so visible toasts move WITH the card instead of jumping after it.
  for (const stack of document.querySelectorAll<HTMLElement>(
    "[data-sonner-toaster]",
  )) {
    stack.style.setProperty(OFFSET_VAR, next);
  }
  offsetTimer = window.setTimeout(() => {
    offsetTimer = null;
    document.documentElement.style.setProperty(OFFSET_VAR, next);
  }, REVEAL_MS + 40);
}
// Matches the Toaster's duration={4000} so the completed card behaves like
// any other toast: auto-dismisses after four seconds unless closed sooner.
const COMPLETION_DISMISS_MS = 4_000;
// Enter/exit of the card itself. Copied from sonner's own toast motion so the
// card and the stack above it move identically:
//   [data-sonner-toast]               { --y: translateY(100%); opacity: 0;
//                                       transition: transform .4s, opacity .4s }
//   [data-sonner-toast][data-mounted] { --y: translateY(0); opacity: 1 }
//   [data-sonner-toast][data-removed] { --y: translateY(...); opacity: 0 }
// Same duration, same default `ease` curve, same full-height slide, no scale.
const PRESENCE_MS = 400;
const PRESENCE_TRANSITION = "transform 0.4s ease, opacity 0.4s ease";

// Keeps the card mounted through its exit transition. Returns whether to
// render at all, and whether it should currently sit in its resting position.
export function useCardPresence(visible: boolean) {
  const [render, setRender] = useState(visible);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (visible) {
      setRender(true);
      // One tick after mount so the browser has a start value to animate FROM.
      const timer = window.setTimeout(() => setSettled(true), 20);
      return () => window.clearTimeout(timer);
    }
    setSettled(false);
    const timer = window.setTimeout(() => setRender(false), PRESENCE_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  return { render, settled };
}

// Wrapper for the card's fixed corner slot: owns the enter/exit motion and
// the compositor layer the reveal animation needs.
export function GettingStartedPresence({
  settled,
  id,
  children,
}: {
  settled: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      style={{
        transform: settled ? "translateY(0)" : "translateY(100%)",
        opacity: settled ? 1 : 0,
        transition: PRESENCE_TRANSITION,
      }}
      className={cn(
        "fixed bottom-5 right-5 z-40 hidden w-[356px] sm:block",
        "[will-change:transform,opacity]",
      )}
    >
      {children}
    </div>
  );
}

// The one tick in the card: same geometry and weight everywhere, drawn in
// with a stroke-dashoffset sweep rather than popped in.
const TICK_PATH = "M5.5 9.25 8 11.75 12.5 6.75";
const TICK_LENGTH = 16;

function Tick({
  shown,
  className,
  delayMs = 0,
}: {
  shown: boolean;
  className?: string;
  delayMs?: number;
}) {
  return (
    <path
      d={TICK_PATH}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={TICK_LENGTH}
      strokeDashoffset={shown ? 0 : TICK_LENGTH}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={cn(
        "transition-[stroke-dashoffset] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        className,
      )}
    />
  );
}

function ProgressRing({
  done,
  total,
  complete = false,
}: {
  done: number;
  total: number;
  complete?: boolean;
}) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const fraction = total === 0 ? 0 : done / total;
  // Armed a frame after the completion state mounts so the disc and tick
  // animate IN from the ring, rather than appearing already finished.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!complete) {
      setArmed(false);
      return;
    }
    // A timer rather than rAF: rAF is suspended while the tab is hidden, and
    // the completion state can land there (a step finishing in a background
    // tab), which would leave the ring stranded mid-transition.
    const timer = window.setTimeout(() => setArmed(true), 30);
    return () => window.clearTimeout(timer);
  }, [complete]);

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
        stroke={
          complete ? "var(--creed-success)" : "var(--creed-accent)"
        }
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        transform="rotate(-90 9 9)"
        className="transition-[stroke-dashoffset,stroke] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
      />
      <circle
        cx="9"
        cy="9"
        r={radius + 1}
        fill="var(--creed-success)"
        style={{
          transformOrigin: "9px 9px",
          transform: armed ? "scale(1)" : "scale(0)",
        }}
        className="transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      />
      <g className="text-[var(--creed-surface)]">
        <Tick shown={armed} delayMs={120} />
      </g>
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
  onTargetHeight,
}: {
  steps: Partial<Record<GettingStartedStepKey, boolean>>;
  expanded: boolean;
  onToggleExpanded: () => void;
  allDone?: boolean;
  onDismiss?: () => void;
  onStepClick?: (step: GettingStartedStepKey) => void;
  // Reports the height the card is animating *towards*, once per state
  // change. The toast stack moves to it on its own transition rather than
  // being repositioned every frame.
  onTargetHeight?: (height: number) => void;
}) {
  const doneCount = GETTING_STARTED_STEPS.filter(({ key }) => steps[key]).length;
  const total = GETTING_STARTED_STEPS.length;
  const contentRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Both boxes have fixed content (one header line, five step rows), so a
  // measurement per layout change is enough , nothing is read while the
  // height transition runs.
  useEffect(() => {
    const content = contentRef.current;
    const header = headerRef.current;
    if (!content || !header) return;
    const update = () => {
      setContentHeight(content.scrollHeight);
      setHeaderHeight(header.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content);
    observer.observe(header);
    return () => observer.disconnect();
  }, [allDone]);

  useEffect(() => {
    if (!onTargetHeight || headerHeight === 0) return;
    onTargetHeight(headerHeight + (expanded && !allDone ? contentHeight : 0));
  }, [onTargetHeight, headerHeight, contentHeight, expanded, allDone]);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_10px_30px_rgba(28,28,26,0.10)]">
          {/* One header across both states , the ring must stay mounted so it
              can animate from the blue progress ring into the green tick when
              the last step lands. The toggle is a full-bleed button behind the
              content; the trailing control sits above it as its own button, so
              nothing nests and the chip keeps its own hover. */}
          <div ref={headerRef} className="relative">
            {allDone ? null : (
              <button
                type="button"
                onClick={onToggleExpanded}
                aria-expanded={expanded}
                aria-label={expanded ? "Hide steps" : "Show steps"}
                className="absolute inset-0 z-0"
              />
            )}
            <div
              className={cn(
                "pointer-events-none relative z-10 flex items-center gap-3 p-3.5",
                allDone ? "pr-14" : "pr-[5.25rem]",
              )}
            >
              <ProgressRing
                done={allDone ? total : doneCount}
                total={total}
                complete={allDone}
              />
              <span className="flex-1 truncate text-left text-[13px] font-medium leading-5 text-[var(--creed-text-primary)]">
                {allDone ? "You're all set." : "Get started"}
              </span>
              {allDone ? null : (
                <span className="absolute right-[4.75rem] top-1/2 -translate-y-1/2 text-[12px] tabular-nums text-[var(--creed-text-primary)]">
                  {doneCount}/{total}
                </span>
              )}
            </div>
            {allDone ? (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                className="absolute right-2.5 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onToggleExpanded}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="absolute right-10 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="Dismiss"
                  className="absolute right-2.5 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {/* Only this clip box changes size. The list inside is absolutely
              positioned against its top edge, so it is laid out once and the
              animation is reduced to clipping a static box , no per-frame
              reflow of the rows, and size+layout+paint containment keeps the
              work from escaping into the rest of the document. */}
          <div
            style={{ height: expanded && !allDone ? contentHeight : 0 }}
            className={cn(
              "relative overflow-hidden transition-[height] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              "[contain:size_layout_paint]",
            )}
          >
            <div ref={contentRef} className="absolute inset-x-0 top-0">
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
    </div>
  );
}

export function GettingStartedCard() {
  const gettingStarted = useCreedStateSelector(
    (state) => state.gettingStarted,
  );
  const creedId = useCreedStateSelector((state) => state.creedId);
  const { dismissGettingStarted } = useCreedActions();

  const [expanded, setExpanded] = useState(false);
  // The completion confirmation shows once the last step lands on screen and
  // stays until dismissed (auto after the toast timer, or via the X).
  const [showingCompletion, setShowingCompletion] = useState(false);
  const [dismissed, setDismissed] = useState(false);
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

  // A Creed switch resets local completion/dismiss chrome so a fresh Creed can
  // show its own card.
  useEffect(() => {
    setShowingCompletion(false);
    setDismissed(false);
    sawIncompleteRef.current = false;
    completionHandledRef.current = false;
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, [creedId]);

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setDismissed(true);
    dismissGettingStarted();
  }, [dismissGettingStarted]);

  // Completing the last step while the card is on screen shows the
  // confirmation and starts the auto-dismiss timer; arriving already-complete
  // (a page load after the fact) shows nothing. Handled exactly once, and the
  // timer is NOT tied to this effect's lifecycle so a re-run (e.g. a sync
  // giving `gettingStarted` a new identity) can't cancel or restart it.
  useEffect(() => {
    if (!gettingStarted) return;
    if (gettingStarted.dismissedAt) return;
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
    !gettingStarted?.dismissedAt &&
    (!allDone || showingCompletion);

  // Publish the card's target height so the toast stack sits above it; see
  // publishGettingStartedOffset for why the write is deferred.
  const publishHeight = useCallback(
    (height: number) => {
      if (visible) publishGettingStartedOffset(height);
    },
    [visible],
  );

  useEffect(() => {
    if (!visible) publishGettingStartedOffset(null);
  }, [visible]);

  useEffect(() => () => publishGettingStartedOffset(null), []);

  const { render, settled } = useCardPresence(visible);

  if (!render) return null;

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
    <GettingStartedPresence settled={settled}>
      <GettingStartedCardView
        steps={steps}
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        allDone={showingCompletion && allDone}
        onDismiss={dismiss}
        onTargetHeight={publishHeight}
      />
    </GettingStartedPresence>
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
  const action = STEP_ACTIONS[stepKey];
  // The checkbox + label are the toggle target in the dev preview; the action
  // link is always a sibling so it never nests inside a <button>.
  const marker = (
    <span
      className={cn(
        "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        done
          ? "scale-100 border-transparent bg-[var(--creed-success)]"
          : "border-[var(--creed-border-strong)] bg-transparent",
      )}
    >
      {/* Drawn at the tick's native 18x18 and centred over the 16px dot, so
          it renders at exactly the size and stroke weight of the completion
          tick , scaling it into the dot would thin it out. */}
      <svg
        viewBox="0 0 18 18"
        width="18"
        height="18"
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible text-[var(--creed-surface)]"
      >
        <Tick shown={done} />
      </svg>
    </span>
  );
  const text = (
    <span
      className={cn(
        "truncate text-left text-[13px] leading-5 transition-colors duration-300",
        done
          ? "text-[var(--creed-text-tertiary)] line-through decoration-[1.5px] decoration-[var(--creed-text-tertiary)]"
          : "text-[var(--creed-text-primary)]",
      )}
    >
      {label}
    </span>
  );

  return (
    <li data-step={stepKey} className="flex items-center gap-2.5 py-[7px]">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          {marker}
          {text}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {marker}
          {text}
        </span>
      )}
      {done ? null : (
        <Link
          href={action.href}
          onClick={() => {
            if (!action.intent) return;
            try {
              window.sessionStorage.setItem(FILE_NAV_INTENT_KEY, action.intent);
            } catch {
              // Session storage may be unavailable; the link still navigates.
            }
          }}
          className="shrink-0 text-[12px] font-medium text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]"
        >
          {action.label}
        </Link>
      )}
    </li>
  );
}
